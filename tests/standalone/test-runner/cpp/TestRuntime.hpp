#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace margelo::nitro::testing {

// Runs one case in a fresh Hermes runtime owned by the calling thread. Native
// fixtures must be registered first. An empty result means success; failures
// include the test name and JS stack. No C++ exception crosses the Swift/JNI
// boundary. Bundle compilation is cached outside the JS deadlines. Setup and
// execution each receive timeoutMs; getNitroTestTimeoutMs(name) can override
// execution only. onTestStarted runs after setup, right before the case.
std::string runTest(const std::string& bundle, const std::string& name, uint32_t timeoutMs = 10000,
                    const std::function<void()>& onTestStarted = {});

struct TestGroup {
  std::string name;
  // Cases run in this order.
  std::vector<std::string> cases;
};

struct TestCaseResult {
  // Empty on success. Otherwise the failure, prefixed with the case name.
  std::string failure;
  // Time spent running the case, excluding runtime setup and teardown.
  double durationMs = 0;
};

struct TestGroupReport {
  std::string name;
  size_t cases = 0;
  size_t failures = 0;
  // A failed case replaces the runtime, so a group can create more than one.
  size_t runtimes = 0;
  // Creating runtimes, installing Nitro and evaluating the bundle.
  double setupMs = 0;
  double casesMs = 0;
  // Destroying runtimes, which finalizes everything their cases created.
  double teardownMs = 0;
};

struct TestSchedulerOptions {
  // Groups that run at the same time, each on its own worker thread.
  size_t workers = 1;
  // Budget for runtime setup, and the default budget for each case.
  uint32_t timeoutMs = 10000;
  // Runs on the worker thread after setup, right before a case starts.
  std::function<void(const std::string& name)> onCaseStarted;
  // Wraps everything a worker does for one case, e.g. in an autorelease pool.
  std::function<void(const std::function<void()>& body)> caseScope;
  // Runs on the worker thread after a group's runtime was destroyed.
  std::function<void(const TestGroupReport& report)> onGroupFinished;
};

// Runs groups of JS cases. A group's cases run in order in one Hermes runtime
// on a dedicated worker thread, which also pumps that runtime's dispatcher.
// The runtime is destroyed after the group's last case, which checks that Nitro
// releases everything a whole suite created. A failed or timed out case also
// destroys it, so the group's remaining cases start in a clean runtime.
class TestScheduler {
public:
  TestScheduler(std::string bundle, std::vector<TestGroup> groups, TestSchedulerOptions options);
  // Waits for running groups; cases that never started fail.
  ~TestScheduler();
  TestScheduler(const TestScheduler&) = delete;
  TestScheduler& operator=(const TestScheduler&) = delete;

  // Reports the result of one case. The first request for any case of a group
  // queues that group; queued groups start in the order they were given.
  // `callback` runs exactly once, possibly on a worker.
  void request(const std::string& name, std::function<void(const TestCaseResult&)> callback);

  // Highest number of groups that ran at the same time.
  size_t peakConcurrency() const;

private:
  struct State;
  std::unique_ptr<State> state_;
};

} // namespace margelo::nitro::testing
