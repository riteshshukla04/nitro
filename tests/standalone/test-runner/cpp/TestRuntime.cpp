#include "TestRuntime.hpp"

#ifdef __APPLE__
#include <NitroTest/NitroTestAutolinking.hpp>
#include <NitroTestExternal/NitroTestExternalAutolinking.hpp>
#endif
#ifdef __ANDROID__
#include <fbjni/fbjni.h>
#endif

#include <NitroModules/Dispatcher.hpp>
#include <NitroModules/InstallNitro.hpp>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <future>
#include <hermes/hermes.h>
#include <jsi/instrumentation.h>
#include <limits>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <utility>

namespace margelo::nitro::testing {
namespace {
  using namespace facebook;
  using Clock = std::chrono::steady_clock;

  // The test caller owns Hermes. Native workers enqueue callbacks here, and
  // tick() runs them on that same caller thread between microtask drains.
  class TestDispatcher final : public Dispatcher {
  public:
    bool isOnDispatcher() override {
      return std::this_thread::get_id() == owner;
    }

    void runSync(std::function<void()>&& function) override {
      if (std::this_thread::get_id() == owner) {
        function();
        return;
      }
      auto task = std::make_shared<std::packaged_task<void()>>(std::move(function));
      auto result = task->get_future();
      // The queue owns the task so close() unblocks waiters with broken_promise.
      if (!enqueue([task = std::move(task)] { (*task)(); }))
        throw std::runtime_error("Test runtime is closed");
      result.get();
    }

    void runAsync(std::function<void()>&& function) override {
      // Late native Promise completions must not enter a destroyed runtime.
      enqueue(std::move(function));
    }

    // Runs one task, waiting until the deadline for one to arrive. Returns
    // whether it ran a task; a past deadline only takes one already queued.
    bool tick(Clock::time_point deadline) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex);
        changed.wait_until(lock, deadline, [&] { return closed || !tasks.empty(); });
        if (tasks.empty())
          return false;
        task = std::move(tasks.front());
        tasks.pop();
      }
      task();
      return true;
    }

    void close() {
      std::queue<std::function<void()>> discarded;
      {
        std::lock_guard lock(mutex);
        closed = true;
        tasks.swap(discarded);
      }
      changed.notify_all();
      // Release pending JSI handles on their owning thread, before Hermes dies.
    }

  private:
    bool enqueue(std::function<void()>&& task) {
      {
        std::lock_guard lock(mutex);
        if (closed)
          return false;
        tasks.push(std::move(task));
      }
      changed.notify_one();
      return true;
    }

    const std::thread::id owner = std::this_thread::get_id();
    std::mutex mutex;
    std::condition_variable changed;
    std::queue<std::function<void()>> tasks;
    bool closed = false;
  };

  std::string describeError(jsi::Runtime& runtime, const jsi::Value& error) {
    if (error.isObject()) {
      auto stack = error.asObject(runtime).getProperty(runtime, "stack");
      if (stack.isString())
        return stack.asString(runtime).utf8(runtime);
    }
    return error.toString(runtime).utf8(runtime);
  }

  std::shared_ptr<const jsi::PreparedJavaScript> prepareBundle(jsi::Runtime& runtime, const std::string& source) {
    struct PreparedBundle {
      std::string source;
      std::shared_ptr<const jsi::PreparedJavaScript> script;
    };
    // Only compilation and cache replacement are serialized. Bytecode is shared across
    // Hermes runtimes; globals and native objects still belong to each runtime.
    static PreparedBundle cached;
    static std::mutex cacheMutex;
    std::lock_guard lock(cacheMutex);
    if (!cached.script || cached.source != source) {
      auto script = runtime.prepareJavaScript(std::make_shared<jsi::StringBuffer>(source), "runtime-tests.js");
      cached = {source, std::move(script)};
    }
    return cached.script;
  }

  uint32_t getTestTimeout(jsi::Runtime& runtime, const std::string& name, uint32_t defaultTimeoutMs) {
    auto getter = runtime.global().getProperty(runtime, "getNitroTestTimeoutMs");
    if (getter.isUndefined())
      return defaultTimeoutMs;
    auto timeout = getter.asObject(runtime).asFunction(runtime).call(runtime, jsi::String::createFromUtf8(runtime, name));
    if (timeout.isUndefined())
      return defaultTimeoutMs;
    if (!timeout.isNumber() || !std::isfinite(timeout.getNumber()) || timeout.getNumber() <= 0 ||
        timeout.getNumber() > std::numeric_limits<uint32_t>::max() || std::floor(timeout.getNumber()) != timeout.getNumber()) {
      throw std::runtime_error("getNitroTestTimeoutMs must return a positive uint32 timeout or undefined");
    }
    return static_cast<uint32_t>(timeout.getNumber());
  }

  std::string describeFailure(const char* phase, const std::exception& error) {
    std::string message = error.what();
    return std::string("While ") + phase + ": " + (message.empty() ? "Native exception without a message" : message);
  }

  // One Hermes runtime with Nitro installed and the test bundle loaded. The
  // thread that creates it owns it: that thread runs its JS and pumps its dispatcher.
  class TestSession {
  public:
    TestSession()
        : runtime(facebook::hermes::makeHermesRuntime(::hermes::vm::RuntimeConfig::Builder()
                                                          .withMicrotaskQueue(true)
                                                          .withAsyncBreakCheckInEval(true)
                                                          .withES6BlockScoping(true)
                                                          .withCompilationMode(::hermes::vm::ForceEagerCompilation)
                                                          .build())) {}

    ~TestSession() {
      dispatcher->close();
      runtime->unwatchTimeLimit();
    }

    // Installs Nitro and evaluates the bundle. Returns an empty string on success.
    std::string load(const std::string& bundle, uint32_t timeoutMs, const std::shared_ptr<const std::string>& sourceMap = nullptr) {
      const char* phase = "preparing JS test bundle";
      // JSError owns JSI values. Convert it before destroying their runtime.
      try {
        // The watchdog interrupts JS execution, not the native compiler. Compile
        // once before timing setup, then evaluate in each fresh runtime.
        auto prepared = prepareBundle(*runtime, bundle);
        phase = "loading JS test bundle";
        const auto timeoutMessage = "Timed out after " + std::to_string(timeoutMs) + "ms";
        const auto deadline = Clock::now() + std::chrono::milliseconds(timeoutMs);
        runtime->watchTimeLimit(timeoutMs);
#ifdef __APPLE__
        margelo::nitro::test::external::registerHybridClasses();
        margelo::nitro::test::registerHybridClasses();
#endif
        install(*runtime, dispatcher);
        // Expose platform information and explicit garbage collection to the tests.
#ifdef __ANDROID__
        runtime->global().setProperty(*runtime, "__nitroTestPlatform", "android");
#else
        runtime->global().setProperty(*runtime, "__nitroTestPlatform", "ios");
#endif
        runtime->global().setProperty(
            *runtime, "gc",
            jsi::Function::createFromHostFunction(*runtime, jsi::PropNameID::forAscii(*runtime, "gc"), 0,
                                                  [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
                                                    rt.instrumentation().collectGarbage("Nitro runtime test");
                                                    return jsi::Value::undefined();
                                                  }));
        if (sourceMap) {
          // Only failing cases call this, so the map is never copied otherwise.
          runtime->global().setProperty(
              *runtime, "__nitroTestSourceMap",
              jsi::Function::createFromHostFunction(*runtime, jsi::PropNameID::forAscii(*runtime, "__nitroTestSourceMap"), 0,
                                                    [sourceMap](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
                                                      return jsi::String::createFromUtf8(rt, *sourceMap);
                                                    }));
        }
        runtime->evaluatePreparedJavaScript(prepared);
        // Stop setup's watchdog before checking elapsed time so an expired
        // interrupt cannot carry over when the execution deadline is reset.
        runtime->unwatchTimeLimit();
        if (Clock::now() >= deadline)
          throw std::runtime_error(timeoutMessage);
        return "";
      } catch (const std::exception& error) {
        runtime->unwatchTimeLimit();
        return describeFailure(phase, error);
      } catch (...) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": unknown native exception";
      }
    }

    // Runs one case. With settleQueuedWork, a passing case also runs the native
    // callbacks and microtasks it already queued, so their errors fail this case
    // instead of the next one in this runtime. Returns an empty string on success.
    std::string run(const std::string& name, uint32_t timeoutMs, const std::function<void()>& onTestStarted, bool settleQueuedWork) {
      const char* phase = "running JS test";
      // JSError owns JSI values. Convert it before destroying their runtime.
      try {
        struct Result {
          bool done = false;
          std::string error;
        };
        auto result = std::make_shared<Result>();
        auto success = jsi::Function::createFromHostFunction(*runtime, jsi::PropNameID::forAscii(*runtime, "testPassed"), 0,
                                                             [result](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) {
                                                               result->done = true;
                                                               return jsi::Value::undefined();
                                                             });
        auto failure =
            jsi::Function::createFromHostFunction(*runtime, jsi::PropNameID::forAscii(*runtime, "testFailed"), 1,
                                                  [result](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
                                                    result->done = true;
                                                    try {
                                                      result->error =
                                                          count == 0 ? "Test rejected without an error" : describeError(rt, args[0]);
                                                      if (result->error.empty())
                                                        result->error = "Test rejected with an empty error";
                                                    } catch (const std::exception& error) {
                                                      result->error = std::string("Could not describe JS rejection: ") + error.what();
                                                    } catch (...) {
                                                      result->error = "Could not describe JS rejection";
                                                    }
                                                    return jsi::Value::undefined();
                                                  });
        auto runNitroTest = runtime->global().getPropertyAsFunction(*runtime, "runNitroTest");
        // Reading the case's own budget runs JS too, so it gets the default one.
        runtime->watchTimeLimit(timeoutMs);
        const auto testTimeoutMs = getTestTimeout(*runtime, name, timeoutMs);
        runtime->unwatchTimeLimit();

        if (onTestStarted)
          onTestStarted();
        const auto timeoutMessage = "Timed out after " + std::to_string(testTimeoutMs) + "ms";
        const auto deadline = Clock::now() + std::chrono::milliseconds(testTimeoutMs);
        runtime->watchTimeLimit(testTimeoutMs);
        auto promise = runNitroTest.call(*runtime, jsi::String::createFromUtf8(*runtime, name)).asObject(*runtime);
        promise.getPropertyAsFunction(*runtime, "then").callWithThis(*runtime, promise, success, failure);

        while (!result->done) {
          if (Clock::now() >= deadline)
            throw std::runtime_error(timeoutMessage);
          const bool drained = runtime->drainMicrotasks(128);
          if (!result->done && drained)
            dispatcher->tick(deadline);
        }
        if (result->error.empty() && settleQueuedWork) {
          phase = "running work queued by the JS test";
          while (true) {
            if (Clock::now() >= deadline)
              throw std::runtime_error(timeoutMessage);
            const bool drained = runtime->drainMicrotasks(128);
            if (!dispatcher->tick(Clock::time_point::min()) && drained)
              break;
          }
        }
        runtime->unwatchTimeLimit();
        if (Clock::now() >= deadline)
          throw std::runtime_error(timeoutMessage);
        return result->error;
      } catch (const std::exception& error) {
        runtime->unwatchTimeLimit();
        return describeFailure(phase, error);
      } catch (...) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": unknown native exception";
      }
    }

  private:
    // Declared first, so it outlives the runtime that holds JSI values for it.
    const std::shared_ptr<TestDispatcher> dispatcher = std::make_shared<TestDispatcher>();
    const std::unique_ptr<facebook::hermes::HermesRuntime> runtime;
  };

  // The host owns JNI attachment for the whole runtime lifetime, including
  // dispatcher callbacks, microtasks and teardown.
  template <typename Body>
  void withRuntimeThreadScope(Body&& body) {
#ifdef __ANDROID__
    facebook::jni::ThreadScope::WithClassLoader(std::forward<Body>(body));
#else
    body();
#endif
  }
} // namespace

std::string runTest(const std::string& bundle, const std::string& name, uint32_t timeoutMs, const std::function<void()>& onTestStarted) {
  try {
    std::string error;
    withRuntimeThreadScope([&] {
      TestSession session;
      error = session.load(bundle, timeoutMs);
      if (error.empty())
        error = session.run(name, timeoutMs, onTestStarted, false);
    });
    return error.empty() ? "" : name + ": " + error;
  } catch (const std::exception& error) {
    return name + ": " + error.what();
  } catch (...) {
    return name + ": unknown native exception";
  }
}

std::vector<std::string> runTests(const std::string& bundle, const std::vector<std::string>& names, uint32_t timeoutMs,
                                  const std::string& sourceMap) {
  std::vector<std::string> results;
  results.reserve(names.size());
  try {
    // Shared by the runtimes of this file, so each one only copies a pointer.
    auto sharedSourceMap = sourceMap.empty() ? nullptr : std::make_shared<const std::string>(sourceMap);
    withRuntimeThreadScope([&] {
      std::unique_ptr<TestSession> session;
      // A runtime that cannot load the bundle fails the remaining cases
      // instead of loading it again for each of them.
      std::string loadError;
      for (const auto& name : names) {
        std::string error = loadError;
        if (!session && error.empty()) {
          session = std::make_unique<TestSession>();
          error = loadError = session->load(bundle, timeoutMs, sharedSourceMap);
        }
        if (error.empty())
          error = session->run(name, timeoutMs, {}, true);
        if (!error.empty())
          session.reset();
        results.push_back(error.empty() ? "" : name + ": " + error);
      }
    });
  } catch (const std::exception& error) {
    for (size_t index = results.size(); index < names.size(); index++)
      results.push_back(names[index] + ": " + error.what());
  } catch (...) {
    for (size_t index = results.size(); index < names.size(); index++)
      results.push_back(names[index] + ": unknown native exception");
  }
  return results;
}
} // namespace margelo::nitro::testing
