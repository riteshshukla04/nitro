#include "TestRuntime.hpp"

#ifdef __APPLE__
#include <NitroTest/NitroTestAutolinking.hpp>
#include <NitroTestExternal/NitroTestExternalAutolinking.hpp>
#endif

#include <NitroModules/Dispatcher.hpp>
#include <NitroModules/InstallNitro.hpp>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <future>
#include <hermes/hermes.h>
#include <jsi/instrumentation.h>
#include <limits>
#include <list>
#include <mutex>
#include <pthread.h>
#ifdef __APPLE__
#include <pthread/qos.h>
#endif
#include <queue>
#include <system_error>
#include <thread>
#include <unordered_map>

namespace margelo::nitro::testing {
namespace {
  using namespace facebook;
  using Clock = std::chrono::steady_clock;

  // The thread that owns a runtime runs its JS. Native workers enqueue callbacks
  // here, and the owner runs them between microtask drains.
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

    // Runs one queued task, waiting until the deadline for one to arrive.
    void tick(Clock::time_point deadline) {
      if (auto task = take(deadline))
        task();
    }

    // Runs one task that is already queued. Returns false if there is none.
    bool runQueued() {
      auto task = take(Clock::time_point::min());
      if (!task)
        return false;
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
    std::function<void()> take(Clock::time_point deadline) {
      std::unique_lock lock(mutex);
      changed.wait_until(lock, deadline, [&] { return closed || !tasks.empty(); });
      if (tasks.empty())
        return {};
      auto task = std::move(tasks.front());
      tasks.pop();
      return task;
    }

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

  std::string describeException(const std::exception& error) {
    std::string message = error.what();
    return message.empty() ? "Native exception without a message" : message;
  }

  std::shared_ptr<const jsi::PreparedJavaScript> prepareBundle(jsi::Runtime& runtime, const std::string& source) {
    using PreparedBundle = std::pair<std::string, std::shared_ptr<const jsi::PreparedJavaScript>>;
    // Only compilation and cache updates are serialized. Bytecode is shared across
    // Hermes runtimes; globals and native objects still belong to each runtime.
    // Several bundles stay cached, most recently used first, so the runner's
    // contract sources do not evict the behavior bundle while both run.
    constexpr size_t capacity = 8;
    static std::list<PreparedBundle> cache;
    static std::mutex cacheMutex;
    std::lock_guard lock(cacheMutex);
    auto entry = std::find_if(cache.begin(), cache.end(), [&](const PreparedBundle& bundle) { return bundle.first == source; });
    if (entry != cache.end()) {
      cache.splice(cache.begin(), cache, entry);
      return cache.front().second;
    }
    auto script = runtime.prepareJavaScript(std::make_shared<jsi::StringBuffer>(source), "runtime-tests.js");
    cache.emplace_front(source, script);
    if (cache.size() > capacity)
      cache.pop_back();
    return script;
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

  void registerFixtures() {
#ifdef __APPLE__
    // Registration is process-wide; every runtime sees the same classes.
    static std::once_flag registered;
    std::call_once(registered, [] {
      margelo::nitro::test::external::registerHybridClasses();
      margelo::nitro::test::registerHybridClasses();
    });
#endif
  }

  // One Hermes runtime with Nitro installed and the test bundle evaluated. It
  // belongs to the thread that created it, which runs its JS and dispatcher.
  class HermesSession {
  public:
    // Returns nullptr and sets `failure` if setup fails or times out.
    static std::unique_ptr<HermesSession> create(const std::string& bundle, uint32_t timeoutMs, std::string& failure) {
      std::unique_ptr<HermesSession> session(new HermesSession());
      failure = session->setup(bundle, timeoutMs);
      if (!failure.empty())
        return nullptr;
      return session;
    }

    ~HermesSession() {
      dispatcher->close();
      runtime->unwatchTimeLimit();
    }

    // Runs one case to completion. Returns an empty string on success.
    std::string run(const std::string& name, uint32_t defaultTimeoutMs, const std::function<void()>& onStarted) {
      const char* phase = "running JS test";
      // JSError owns JSI values. Convert it before its runtime can be destroyed.
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
        // Looking up the case's own budget runs JS too, so it gets the default one.
        runtime->watchTimeLimit(defaultTimeoutMs);
        auto runNitroTest = runtime->global().getPropertyAsFunction(*runtime, "runNitroTest");
        const auto testTimeoutMs = getTestTimeout(*runtime, name, defaultTimeoutMs);
        runtime->unwatchTimeLimit();

        if (onStarted)
          onStarted();
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
        if (!result->error.empty()) {
          runtime->unwatchTimeLimit();
          return result->error;
        }

        // The next case shares this runtime. Run work this case already queued
        // now, so its errors are reported here instead of in a later case.
        phase = "settling work queued by the JS test";
        while (true) {
          if (Clock::now() >= deadline)
            throw std::runtime_error(timeoutMessage);
          const bool drained = runtime->drainMicrotasks(128);
          if (!dispatcher->runQueued() && drained)
            break;
        }
        runtime->unwatchTimeLimit();
        return "";
      } catch (const std::exception& error) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": " + describeException(error);
      } catch (...) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": unknown native exception";
      }
    }

  private:
    HermesSession() {
      auto config = ::hermes::vm::RuntimeConfig::Builder()
                        .withMicrotaskQueue(true)
                        .withAsyncBreakCheckInEval(true)
                        .withES6BlockScoping(true)
                        .withCompilationMode(::hermes::vm::ForceEagerCompilation)
                        .build();
      runtime = facebook::hermes::makeHermesRuntime(config);
    }

    std::string setup(const std::string& bundle, uint32_t timeoutMs) {
      const char* phase = "preparing JS test bundle";
      // JSError owns JSI values. Convert it before its runtime can be destroyed.
      try {
        // The watchdog interrupts JS execution, not native work such as the
        // compiler or Nitro's installation. Only evaluating the bundle counts
        // against the setup budget, so a busy machine cannot exhaust it first.
        auto prepared = prepareBundle(*runtime, bundle);
        phase = "installing Nitro";
        registerFixtures();
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
        phase = "loading JS test bundle";
        const auto timeoutMessage = "Timed out after " + std::to_string(timeoutMs) + "ms";
        const auto deadline = Clock::now() + std::chrono::milliseconds(timeoutMs);
        runtime->watchTimeLimit(timeoutMs);
        runtime->evaluatePreparedJavaScript(prepared);
        // Stop setup's watchdog before checking elapsed time so an expired
        // interrupt cannot carry over into the first case's deadline.
        runtime->unwatchTimeLimit();
        if (Clock::now() >= deadline)
          throw std::runtime_error(timeoutMessage);
        return "";
      } catch (const std::exception& error) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": " + describeException(error);
      } catch (...) {
        runtime->unwatchTimeLimit();
        return std::string("While ") + phase + ": unknown native exception";
      }
    }

    // Declared first so it outlives the runtime that holds JSI values for it.
    std::shared_ptr<TestDispatcher> dispatcher = std::make_shared<TestDispatcher>();
    std::unique_ptr<facebook::hermes::HermesRuntime> runtime;
  };

  // Hermes needs more native stack than the 512 KiB default of secondary
  // threads on Apple platforms, so workers get the main thread's 8 MiB.
  class WorkerThread {
  public:
    WorkerThread(std::string name, std::function<void()> body) {
      struct Start {
        std::string name;
        std::function<void()> body;
      };
      auto start = std::make_unique<Start>(Start{std::move(name), std::move(body)});
      pthread_attr_t attributes;
      pthread_attr_init(&attributes);
      pthread_attr_setstacksize(&attributes, 8 * 1024 * 1024);
      const int error = pthread_create(
          &thread, &attributes,
          [](void* context) -> void* {
            std::unique_ptr<Start> start(static_cast<Start*>(context));
#ifdef __APPLE__
            pthread_setname_np(start->name.c_str());
            // Workers use whatever CPU is idle, but must never starve Swift
            // concurrency: the test process runs Swift Tasks, including the
            // ones that complete HybridObject Promises, on a single strict
            // cooperative thread. On 3-core CI machines, three busy workers
            // delayed those Tasks past the 10-second case budget.
            pthread_set_qos_class_self_np(QOS_CLASS_UTILITY, 0);
#else
            pthread_setname_np(pthread_self(), start->name.substr(0, 15).c_str());
#endif
            start->body();
            return nullptr;
          },
          start.get());
      pthread_attr_destroy(&attributes);
      if (error != 0)
        throw std::system_error(error, std::generic_category(), "Could not start a test worker");
      start.release();
    }

    void join() {
      pthread_join(thread, nullptr);
    }

  private:
    pthread_t thread{};
  };

  double millisecondsSince(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
  }
} // namespace

std::string runTest(const std::string& bundle, const std::string& name, uint32_t timeoutMs, const std::function<void()>& onTestStarted) {
  try {
    std::string failure;
    if (auto session = HermesSession::create(bundle, timeoutMs, failure))
      failure = session->run(name, timeoutMs, onTestStarted);
    return failure.empty() ? "" : name + ": " + failure;
  } catch (const std::exception& error) {
    return name + ": " + describeException(error);
  } catch (...) {
    return name + ": unknown native exception";
  }
}

struct TestScheduler::State {
  using Callback = std::function<void(const TestCaseResult&)>;

  std::string bundle;
  std::vector<TestGroup> groups;
  TestSchedulerOptions options;
  std::unordered_map<std::string, size_t> groupOfCase;

  mutable std::mutex mutex;
  std::condition_variable wake;
  std::vector<bool> queuedOnce;
  std::vector<size_t> pending;
  std::unordered_map<std::string, TestCaseResult> results;
  std::unordered_map<std::string, std::vector<Callback>> waiting;
  std::vector<std::unique_ptr<WorkerThread>> workers;
  bool stopping = false;
  size_t running = 0;
  size_t peak = 0;

  // Requires `mutex`. Swift Testing requests cases in no particular order, so
  // queued groups start in the order the manifest lists them: slowest first.
  size_t takeFirstPending() {
    auto first = std::min_element(pending.begin(), pending.end());
    const size_t group = *first;
    pending.erase(first);
    return group;
  }

  void publish(const std::string& name, TestCaseResult result) {
    std::vector<Callback> callbacks;
    {
      std::lock_guard lock(mutex);
      if (auto entry = waiting.find(name); entry != waiting.end()) {
        callbacks = std::move(entry->second);
        waiting.erase(entry);
      }
      results[name] = result;
    }
    for (auto& callback : callbacks)
      callback(result);
  }

  void runGroup(const TestGroup& group) {
    TestGroupReport report{group.name, group.cases.size()};
    std::unique_ptr<HermesSession> session;
    std::string setupFailure;
    auto destroySession = [&] {
      if (!session)
        return;
      const auto start = Clock::now();
      session.reset();
      report.teardownMs += millisecondsSince(start);
    };
    for (const auto& name : group.cases) {
      std::string failure;
      double durationMs = 0;
      auto runCase = [&] {
        // A group whose runtime cannot be set up fails its remaining cases
        // with that error instead of retrying setup for each of them.
        if (!session && setupFailure.empty()) {
          const auto start = Clock::now();
          session = HermesSession::create(bundle, options.timeoutMs, setupFailure);
          report.setupMs += millisecondsSince(start);
          report.runtimes++;
        }
        if (session) {
          const auto start = Clock::now();
          failure = session->run(name, options.timeoutMs, [&] {
            if (options.onCaseStarted)
              options.onCaseStarted(name);
          });
          durationMs = millisecondsSince(start);
          report.casesMs += durationMs;
        } else {
          failure = setupFailure;
        }
        // A failed case may leave JS or native work behind, so the next case
        // gets a clean runtime.
        if (!failure.empty())
          destroySession();
      };
      try {
        if (options.caseScope)
          options.caseScope(runCase);
        else
          runCase();
      } catch (const std::exception& error) {
        failure = describeException(error);
        session.reset();
      } catch (...) {
        failure = "unknown native exception";
        session.reset();
      }
      if (!failure.empty())
        report.failures++;
      publish(name, {failure.empty() ? "" : name + ": " + failure, durationMs});
    }
    // Destroying the runtime finalizes everything the group created.
    if (options.caseScope)
      options.caseScope(destroySession);
    else
      destroySession();
    if (options.onGroupFinished)
      options.onGroupFinished(report);
  }

  void work() {
    while (true) {
      size_t group;
      {
        std::unique_lock lock(mutex);
        wake.wait(lock, [&] { return stopping || !pending.empty(); });
        if (stopping)
          return;
        group = takeFirstPending();
        peak = std::max(peak, ++running);
      }
      runGroup(groups[group]);
      std::lock_guard lock(mutex);
      running--;
    }
  }
};

TestScheduler::TestScheduler(std::string bundle, std::vector<TestGroup> groups, TestSchedulerOptions options)
    : state_(std::make_unique<State>()) {
  state_->bundle = std::move(bundle);
  state_->groups = std::move(groups);
  state_->options = std::move(options);
  state_->options.workers = std::max<size_t>(1, state_->options.workers);
  state_->queuedOnce.assign(state_->groups.size(), false);
  for (size_t group = 0; group < state_->groups.size(); group++) {
    for (const auto& name : state_->groups[group].cases) {
      if (!state_->groupOfCase.emplace(name, group).second)
        throw std::invalid_argument("Test case \"" + name + "\" belongs to more than one group");
    }
  }
}

TestScheduler::~TestScheduler() {
  {
    std::lock_guard lock(state_->mutex);
    state_->stopping = true;
  }
  state_->wake.notify_all();
  for (auto& worker : state_->workers)
    worker->join();
  std::unordered_map<std::string, std::vector<State::Callback>> abandoned;
  {
    std::lock_guard lock(state_->mutex);
    abandoned.swap(state_->waiting);
  }
  for (auto& [name, callbacks] : abandoned) {
    for (auto& callback : callbacks)
      callback({name + ": The test scheduler stopped before this case ran", 0});
  }
}

void TestScheduler::request(const std::string& name, std::function<void(const TestCaseResult&)> callback) {
  std::unique_lock lock(state_->mutex);
  if (auto result = state_->results.find(name); result != state_->results.end()) {
    auto copy = result->second;
    lock.unlock();
    callback(copy);
    return;
  }
  auto group = state_->groupOfCase.find(name);
  if (group == state_->groupOfCase.end() || state_->stopping) {
    lock.unlock();
    callback({name + ": Unknown test case", 0});
    return;
  }
  state_->waiting[name].push_back(std::move(callback));
  if (state_->queuedOnce[group->second])
    return;
  state_->queuedOnce[group->second] = true;
  state_->pending.push_back(group->second);
  // Workers start with the first request, so an unused scheduler costs nothing.
  const size_t workers = std::min(state_->options.workers, state_->groups.size());
  while (state_->workers.size() < workers) {
    const auto index = std::to_string(state_->workers.size() + 1);
    state_->workers.push_back(std::make_unique<WorkerThread>("NitroTest " + index, [state = state_.get()] { state->work(); }));
  }
  lock.unlock();
  state_->wake.notify_one();
}

size_t TestScheduler::peakConcurrency() const {
  std::lock_guard lock(state_->mutex);
  return state_->peak;
}

} // namespace margelo::nitro::testing
