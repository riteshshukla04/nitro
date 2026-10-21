import Foundation
import NitroTestRunnerBridge
import Testing

private final class TestBundle: NSObject {}

private var testResources: Bundle {
  #if SWIFT_PACKAGE
    return Bundle.module
  #else
    return Bundle(for: TestBundle.self)
  #endif
}

private func makeRuntimeQueue() -> OperationQueue {
  let queue = OperationQueue()
  queue.name = "com.margelo.nitro.tests.runtime"
  queue.maxConcurrentOperationCount = 4
  return queue
}

private let runtimeQueue = makeRuntimeQueue()

private func runNitroTest(_ source: String, _ name: String, _ timeoutMs: UInt32) async -> String? {
  // The native runner blocks until JS settles. Swift Promise.async fixtures need
  // the cooperative executor to remain free while the runner pumps callbacks.
  await withCheckedContinuation { continuation in
    runtimeQueue.addOperation {
      continuation.resume(returning: NitroRunTest(source, name, timeoutMs, nil))
    }
  }
}

/// Runs the cases of one test file in order, in one Hermes runtime, and returns
/// the failure of every case that failed, keyed by its name.
private func runNitroTests(_ source: String, _ names: [String], _ timeoutMs: UInt32) async -> [String: String] {
  await withCheckedContinuation { continuation in
    runtimeQueue.addOperation {
      continuation.resume(returning: NitroRunTests(source, names, timeoutMs))
    }
  }
}

private struct JavaScriptFailure: Error, CustomStringConvertible {
  let description: String
}

@Suite
struct RuntimeTests {
  private static func testNames(skipped: Bool = false) throws -> [String] {
    let resources = testResources
    guard let url = resources.url(forResource: "runtime-tests", withExtension: "json") else {
      throw JavaScriptFailure(
        description:
          "Missing runtime-tests.json. Run bun test:prepare before building the test target.")
    }
    let names: [String]
    do {
      names = try JSONDecoder().decode([String].self, from: Data(contentsOf: url))
    } catch {
      throw JavaScriptFailure(description: "Could not read runtime-tests.json: \(error)")
    }
    guard !names.isEmpty else {
      throw JavaScriptFailure(description: "runtime-tests.json contains no JavaScript tests.")
    }
    guard names.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
      throw JavaScriptFailure(description: "runtime-tests.json contains an empty test name.")
    }
    guard Set(names).count == names.count else {
      throw JavaScriptFailure(description: "runtime-tests.json contains duplicate test names.")
    }
    guard let skipsURL = resources.url(forResource: "runtime-test-skips", withExtension: "json")
    else {
      throw JavaScriptFailure(description: "Missing runtime-test-skips.json. Run bun test:prepare.")
    }
    let skips = try JSONDecoder().decode(
      [String: [String: String]].self, from: Data(contentsOf: skipsURL))
    guard Set(skips.keys).isSubset(of: Set(names)),
      skips.values.allSatisfy({ rules in
        rules.allSatisfy { key, reason in
          ["ios", "android", "release"].contains(key) && !reason.isEmpty
        }
      })
    else {
      throw JavaScriptFailure(
        description: "Invalid test exclusion metadata in runtime-test-skips.json.")
    }
    return names.filter { name in
      var reason = skips[name]?["ios"]
      #if !DEBUG
        reason = reason ?? skips[name]?["release"]
      #endif
      return (reason != nil) == skipped
    }
  }

  /// The enabled cases of each test file, in bundle order. Every case name
  /// starts with its file name, e.g. `arrays.` for `arrays.test.ts`.
  private static let testFiles = Result {
    Dictionary(grouping: try testNames()) { name in
      String(name.prefix { $0 != "." })
    }
  }

  private static let bundleSource = Result {
    let resources = testResources
    let url = try #require(resources.url(forResource: "runtime-tests", withExtension: "js"))
    return try String(contentsOf: url, encoding: .utf8)
  }

  // Each test file runs in one Hermes runtime, so destroying it also checks
  // that Nitro releases everything the file created. A case that needs its own
  // runtime belongs in its own file.
  @Test(arguments: try RuntimeTests.testFiles.get().keys.sorted())
  func javaScript(_ file: String) async throws {
    let cases = try #require(try Self.testFiles.get()[file])
    let failures = await runNitroTests(try Self.bundleSource.get(), cases, 10_000)
    for name in cases {
      if let failure = failures[name] {
        Issue.record(JavaScriptFailure(description: failure))
      }
    }
  }

  // Swift Testing conditions apply to a test function, so keep platform/build
  // exclusions in a separate, explicitly disabled group.
  @Test(
    "Platform/build exclusions",
    .disabled("See runtime-test-skips.json for the platform/build exclusion reasons"),
    arguments: try RuntimeTests.testNames(skipped: true))
  func excludedJavaScript(_ name: String) async throws {
    Issue.record("Excluded case \(name) must not run")
  }

  // These handwritten cases test the runner, not HybridObject behavior. They
  // deliberately fail or hang in JS and check that Swift receives the failure.
  // The TypeScript behavior cases above are discovered from runtime-tests.json.
  @Test func failuresKeepJavaScriptMessage() async throws {
    let source = "globalThis.runNitroTest = async () => { throw new Error('sentinel failure') }"
    let failure = try #require(await runNitroTest(source, "failure-contract", 10000))
    #expect(failure.contains("sentinel failure"))
  }

  @Test func evaluationFailuresKeepJavaScriptMessage() async throws {
    let failure = try #require(
      await runNitroTest("throw new Error('evaluation failure')", "evaluation-contract", 10000))
    #expect(failure.contains("evaluation failure"))
  }

  @Test func swiftTasksCanCompleteDuringNativeRun() async throws {
    let source = """
      globalThis.runNitroTest = async () => {
        const TestObject = NitroModulesProxy.getHybridClass('test.TestObjectSwiftKotlin');
        const object = new TestObject();
        const value = await object.calculateFibonacciAsync(10);
        if (value !== 55n) throw new Error('Unexpected Fibonacci result');
      };
      """
    let failure = await runNitroTest(source, "swift-task-contract", 2000)
    #expect(failure == nil)
  }

  @Test func reusingBundleKeepsRuntimesIsolated() async throws {
    let source = """
      globalThis.executionCount = (globalThis.executionCount ?? 0) + 1;
      globalThis.runNitroTest = async () => {
        if (globalThis.executionCount !== 1) throw new Error('runtime was reused');
        globalThis.executionCount++;
      };
      """
    for _ in 0..<2 {
      let failure = await runNitroTest(source, "runtime-isolation-contract", 1000)
      #expect(failure == nil)
    }
  }

  // Module state lives as long as the runtime, so it shows which cases shared one.
  private static let runtimeCounter = """
    globalThis.evaluations = (globalThis.evaluations ?? 0) + 1;
    globalThis.casesRun = 0;
    globalThis.runNitroTest = async (name) => {
      if (globalThis.evaluations !== 1) throw new Error('bundle evaluated twice in one runtime');
      globalThis.casesRun++;
      const expected = Number(name.split(':')[1]);
      if (globalThis.casesRun !== expected) {
        throw new Error(`${name} ran as case ${globalThis.casesRun} of its runtime`);
      }
      if (name.startsWith('fail')) throw new Error('intentional failure');
    };
    """

  @Test func casesOfAFileShareOneRuntime() async throws {
    let failures = await runNitroTests(Self.runtimeCounter, ["a:1", "b:2", "c:3"], 1000)
    #expect(failures.isEmpty, "\(failures)")
  }

  @Test func failedCasesGiveTheRestOfTheirFileAFreshRuntime() async throws {
    let failures = await runNitroTests(Self.runtimeCounter, ["a:1", "fail:2", "b:1", "c:2"], 1000)
    #expect(Set(failures.keys) == ["fail:2"], "\(failures)")
    #expect(failures["fail:2"]?.contains("intentional failure") == true)
  }

  @Test func timedOutCasesDoNotStallTheirFile() async throws {
    let source = "globalThis.runNitroTest = async (name) => { if (name === 'hang') while (true) {} };"
    let failures = await runNitroTests(source, ["hang", "after"], 1000)
    #expect(Set(failures.keys) == ["hang"], "\(failures)")
    #expect(failures["hang"]?.localizedCaseInsensitiveContains("timed out") == true)
  }

  @Test func filesThatCannotLoadFailEveryCase() async throws {
    let failures = await runNitroTests("throw new Error('evaluation failure')", ["a", "b"], 1000)
    for name in ["a", "b"] {
      let failure = try #require(failures[name])
      #expect(failure.contains("evaluation failure"))
      #expect(failure.contains("loading JS test bundle"))
    }
  }

  @Test func parallelRuntimesOverlapAndStayIsolated() async {
    let source = """
      globalThis.executionCount = (globalThis.executionCount ?? 0) + 1;
      globalThis.runNitroTest = async () => {
        if (globalThis.executionCount !== 1) throw new Error('runtime was reused');
        globalThis.executionCount++;
        const TestObject = NitroModulesProxy.getHybridClass('test.TestObjectSwiftKotlin');
        const object = new TestObject();
        const value = await object.calculateFibonacciAsync(10);
        if (value !== 55n) throw new Error('callback reached the wrong runtime');
      };
      """
    // A queue like the shared one, so test files running on that queue cannot
    // keep the overlapping runs apart.
    let queue = makeRuntimeQueue()
    let workers = queue.maxConcurrentOperationCount
    let runs = ConcurrentRuns(workers: workers)
    await withCheckedContinuation { continuation in
      let operations = (0...workers).map { index in
        BlockOperation {
          let failure = NitroRunTest(source, "parallel-runtime-\(index)", 10_000) {
            runs.started(index)
          }
          if runs.finished(index, failure: failure) {
            continuation.resume()
          }
        }
      }
      queue.addOperations(operations, waitUntilFinished: false)
    }
    let result = runs.result
    #expect(result.overlapped, "\(workers) initialized Hermes runtimes must meet before any test runs")
    #expect(result.peak == workers, "The extra native test must wait for a worker")
    #expect(result.failures.isEmpty, "\(result.failures)")
  }

  @Test func changedBundleReplacesPreparedSource() async throws {
    for message in ["alpha", "bravo", "alpha"] {
      let source = "globalThis.runNitroTest = async () => { throw new Error('\(message)'); };"
      let failure = try #require(await runNitroTest(source, "changed-source-contract", 1000))
      #expect(failure.contains(message))
    }
  }

  @Test func invalidSourceDoesNotPoisonPreparedBundle() async throws {
    let source = "globalThis.runNitroTest = async () => {};"
    let first = await runNitroTest(source, "valid-source-contract", 1000)
    #expect(first == nil)
    let invalid = await runNitroTest(
      "globalThis.runNitroTest = async () => {", "invalid-source-contract", 1000)
    #expect(invalid != nil)
    let repeated = await runNitroTest(source, "valid-source-contract", 1000)
    #expect(repeated == nil)
  }

  @Test func timeoutOverridesApplyOnlyToSelectedCase() async throws {
    let source = """
      globalThis.getNitroTestTimeoutMs = (name) => name === 'slow' ? 2000 : undefined;
      globalThis.runNitroTest = async () => {
        const deadline = Date.now() + 1200;
        while (Date.now() < deadline) {}
      };
      """
    let slow = await runNitroTest(source, "slow", 1000)
    #expect(slow == nil)
    let ordinary = try #require(await runNitroTest(source, "ordinary", 1000))
    #expect(ordinary.localizedCaseInsensitiveContains("timed out"))
    #expect(ordinary.contains("running JS test"))
  }

  @Test func rejectsInvalidTimeoutOverrides() async throws {
    for value in ["0", "-1", "1.5", "NaN", "Infinity", "4294967296", "'1000'", "null"] {
      let source = """
        globalThis.getNitroTestTimeoutMs = () => \(value);
        globalThis.runNitroTest = async () => {};
        """
      let failure = try #require(await runNitroTest(source, "invalid-timeout-contract", 1000))
      #expect(failure.contains("getNitroTestTimeoutMs"))
    }
  }

  @Test func unresolvedPromisesTimeOut() async throws {
    let source = "globalThis.runNitroTest = () => new Promise(() => {})"
    let failure = try #require(await runNitroTest(source, "promise-timeout-contract", 1000))
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("running JS test"))
  }

  @Test func evaluationAndTestHaveSeparateTimeouts() async throws {
    let source = """
      function wait(ms) {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {}
      }
      wait(600);
      globalThis.runNitroTest = async () => {
        wait(600);
      };
      """
    let failure = await runNitroTest(source, "separate-timeouts-contract", 1000)
    #expect(failure == nil)
  }

  @Test func evaluationLoopsTimeOut() async throws {
    let source = """
      while (true) {}
      """
    let failure = try #require(await runNitroTest(source, "evaluation-timeout-contract", 1000))
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("loading JS test bundle"))
  }

  @Test func synchronousLoopsTimeOut() async throws {
    let source = """
      globalThis.runNitroTest = () => {
        while (true) {}
      };
      """
    let failure = try #require(await runNitroTest(source, "loop-timeout-contract", 1000))
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("running JS test"))
  }

  @Test func microtaskLoopsTimeOut() async throws {
    let source = """
      globalThis.runNitroTest = async () => {
        while (true) {
          await Promise.resolve();
        }
      };
      """
    let failure = try #require(await runNitroTest(source, "microtask-timeout-contract", 1000))
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("running JS test"))
  }
}

// Protect observations shared by the native workers. The deadline only makes a
// serialization regression fail instead of hanging the test process.
private final class ConcurrentRuns: @unchecked Sendable {
  private let workers: Int
  private let condition = NSCondition()
  private var active: Set<Int> = []
  private var startedCount = 0
  private var finishedCount = 0
  private var peak = 0
  private var overlapped = true
  private var failures: [String] = []

  /// Expects `workers` runs to overlap, plus one more that waits for a worker.
  init(workers: Int) {
    self.workers = workers
  }

  func started(_ index: Int) {
    condition.lock()
    defer { condition.unlock() }
    active.insert(index)
    startedCount += 1
    peak = max(peak, active.count)
    condition.broadcast()
    let deadline = Date().addingTimeInterval(10)
    while startedCount < workers {
      if !condition.wait(until: deadline) {
        overlapped = false
        break
      }
    }
  }

  func finished(_ index: Int, failure: String?) -> Bool {
    condition.lock()
    defer { condition.unlock() }
    active.remove(index)
    finishedCount += 1
    if let failure { failures.append(failure) }
    return finishedCount == workers + 1
  }

  var result: (overlapped: Bool, peak: Int, failures: [String]) {
    condition.lock()
    defer { condition.unlock() }
    return (overlapped && startedCount == workers + 1, peak, failures)
  }
}
