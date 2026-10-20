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

private struct JavaScriptFailure: Error, CustomStringConvertible {
  let description: String
}

/// Groups that run at the same time, each with its own Hermes runtime: one per
/// CPU core but one, at least two, unless `NITRO_TEST_WORKERS` (`run.mjs
/// --workers`) says otherwise. The spare core keeps Swift concurrency, which
/// HybridObject Promises complete on, responsive on 3-core CI machines.
private let workerCount =
  ProcessInfo.processInfo.environment["NITRO_TEST_WORKERS"].flatMap { Int($0) }.flatMap { $0 > 0 ? $0 : nil }
  ?? max(2, ProcessInfo.processInfo.activeProcessorCount - 1)
private let defaultTimeoutMs: UInt32 = 10_000

extension NitroTestScheduler {
  /// Returns nil when the case passes, otherwise its failure and JS stack.
  /// The case runs on a worker thread, so awaiting it never blocks Swift's
  /// cooperative executor, which `Promise.async` fixtures need to complete.
  fileprivate func run(_ name: String) async -> String? {
    await withCheckedContinuation { continuation in
      runCase(name) { failure, _ in continuation.resume(returning: failure) }
    }
  }
}

/// The manifests written by `scripts/bundle.ts`.
private struct Manifest: Sendable {
  private struct Group: Decodable {
    let name: String
    let cases: [String]
  }

  /// Cases that run on this platform and build.
  let enabled: [String]
  /// Cases excluded on this platform or build; see `runtime-test-skips.json`.
  let excluded: [String]
  let groups: [NitroTestGroup]

  static let shared = Result { try Manifest() }

  private static func read<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    guard let url = testResources.url(forResource: name, withExtension: "json") else {
      throw JavaScriptFailure(
        description: "Missing \(name).json. Run bun test:prepare before building the test target.")
    }
    do {
      return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    } catch {
      throw JavaScriptFailure(description: "Could not read \(name).json: \(error)")
    }
  }

  private init() throws {
    let names = try Self.read([String].self, "runtime-tests")
    guard !names.isEmpty else {
      throw JavaScriptFailure(description: "runtime-tests.json contains no JavaScript tests.")
    }
    guard names.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
      throw JavaScriptFailure(description: "runtime-tests.json contains an empty test name.")
    }
    guard Set(names).count == names.count else {
      throw JavaScriptFailure(description: "runtime-tests.json contains duplicate test names.")
    }

    let skips = try Self.read([String: [String: String]].self, "runtime-test-skips")
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
    let excluded = Set(
      names.filter { name in
        var reason = skips[name]?["ios"]
        #if !DEBUG
          reason = reason ?? skips[name]?["release"]
        #endif
        return reason != nil
      })

    let groups = try Self.read([Group].self, "runtime-test-groups")
    let grouped = groups.flatMap(\.cases)
    guard grouped.count == names.count, Set(grouped) == Set(names) else {
      throw JavaScriptFailure(
        description: "runtime-test-groups.json must contain every test exactly once.")
    }

    self.enabled = names.filter { !excluded.contains($0) }
    self.excluded = names.filter { excluded.contains($0) }
    // Excluded cases never run, so they never occupy a runtime either.
    self.groups = groups.compactMap { group in
      let cases = group.cases.filter { !excluded.contains($0) }
      guard !cases.isEmpty else { return nil }
      return NitroTestGroup(name: group.name, cases: cases)
    }
  }
}

/// Appends each group's JSON timing report to the file named by
/// `NITRO_TEST_REPORT`. `ios/run.mjs` sets it and prints a summary afterwards.
private final class GroupReportLog: @unchecked Sendable {
  private let handle: FileHandle?
  private let lock = NSLock()

  init(path: String?) {
    guard let path, FileManager.default.createFile(atPath: path, contents: nil) else {
      handle = nil
      return
    }
    handle = FileHandle(forWritingAtPath: path)
  }

  func append(_ line: String) {
    guard let handle else { return }
    lock.withLock { handle.write(Data((line + "\n").utf8)) }
  }
}

private let groupReports = GroupReportLog(path: ProcessInfo.processInfo.environment["NITRO_TEST_REPORT"])

private let behaviorScheduler = Result {
  let manifest = try Manifest.shared.get()
  guard let url = testResources.url(forResource: "runtime-tests", withExtension: "js") else {
    throw JavaScriptFailure(description: "Missing runtime-tests.js. Run bun test:prepare.")
  }
  return try NitroTestScheduler(
    bundle: String(contentsOf: url, encoding: .utf8), groups: manifest.groups, workers: UInt(workerCount),
    timeoutMs: defaultTimeoutMs, onCaseStarted: nil, onGroupFinished: { groupReports.append($0) })
}

@Suite
struct RuntimeTests {
  // Every case is its own Swift Testing case, but cases of one group share a
  // Hermes runtime: the first case requested from a group starts the whole
  // group on a worker, and each case reports its own result when it finishes.
  @Test(arguments: try Manifest.shared.get().enabled)
  func javaScript(_ name: String) async throws {
    let scheduler = try behaviorScheduler.get()
    if let failure = await scheduler.run(name) {
      throw JavaScriptFailure(description: failure)
    }
  }

  // Swift Testing conditions apply to a test function, so keep platform/build
  // exclusions in a separate, explicitly disabled group.
  @Test(
    "Platform/build exclusions",
    .disabled("See runtime-test-skips.json for the platform/build exclusion reasons"),
    arguments: try Manifest.shared.get().excluded)
  func excludedJavaScript(_ name: String) async throws {
    Issue.record("Excluded case \(name) must not run")
  }
}

/// Runs handwritten JS through its own scheduler and returns the failure of
/// every case that failed. These cases test the runner, not HybridObjects.
private func runContract(
  _ source: String, groups: [[String]], workers: Int = 1, timeoutMs: UInt32 = 1000,
  onCaseStarted: (@Sendable (String) -> Void)? = nil
) async throws -> (failures: [String: String], peakConcurrency: Int) {
  let scheduler = try NitroTestScheduler(
    bundle: source,
    groups: groups.enumerated().map { index, cases in NitroTestGroup(name: "contract \(index)", cases: cases) },
    workers: UInt(workers), timeoutMs: timeoutMs, onCaseStarted: onCaseStarted, onGroupFinished: nil)
  let failures = await withTaskGroup(of: (String, String?).self) { tasks in
    for name in groups.joined() {
      tasks.addTask { (name, await scheduler.run(name)) }
    }
    var failures: [String: String] = [:]
    for await (name, failure) in tasks {
      failures[name] = failure
    }
    return failures
  }
  return (failures, Int(scheduler.peakConcurrency))
}

// These cases use tight deadlines. Running them one at a time keeps them from
// competing with each other for the CPU while the behavior groups run.
@Suite(.serialized)
struct RunnerContractTests {
  @Test func failuresKeepJavaScriptMessage() async throws {
    let source = "globalThis.runNitroTest = async () => { throw new Error('sentinel failure') }"
    let failure = try #require(try await runContract(source, groups: [["failure"]]).failures["failure"])
    #expect(failure.contains("sentinel failure"))
  }

  @Test func evaluationFailuresFailEveryCaseOfTheGroup() async throws {
    let result = try await runContract("throw new Error('evaluation failure')", groups: [["a", "b"]])
    for name in ["a", "b"] {
      let failure = try #require(result.failures[name])
      #expect(failure.contains("evaluation failure"))
      #expect(failure.contains("loading JS test bundle"))
    }
  }

  // A deadlock still times out. The budget only absorbs a busy cooperative
  // thread, which every Swift Promise in the behavior groups also uses.
  @Test func swiftTasksCanCompleteDuringNativeRun() async throws {
    let source = """
      globalThis.runNitroTest = async () => {
        const TestObject = NitroModulesProxy.getHybridClass('test.TestObjectSwiftKotlin');
        const object = new TestObject();
        const value = await object.calculateFibonacciAsync(10);
        if (value !== 55n) throw new Error('Unexpected Fibonacci result');
      };
      """
    let result = try await runContract(source, groups: [["swift-task"]], timeoutMs: 10_000)
    #expect(result.failures.isEmpty, "\(result.failures)")
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

  @Test func casesOfAGroupShareOneRuntime() async throws {
    let result = try await runContract(Self.runtimeCounter, groups: [["a:1", "b:2", "c:3"]])
    #expect(result.failures.isEmpty, "\(result.failures)")
  }

  @Test func everyGroupGetsItsOwnRuntime() async throws {
    let result = try await runContract(Self.runtimeCounter, groups: [["a:1", "b:2"], ["c:1"], ["d:1"]])
    #expect(result.failures.isEmpty, "\(result.failures)")
  }

  @Test func failedCasesGiveTheRestOfTheirGroupAFreshRuntime() async throws {
    let result = try await runContract(Self.runtimeCounter, groups: [["a:1", "fail:2", "b:1", "c:2"]])
    #expect(Set(result.failures.keys) == ["fail:2"], "\(result.failures)")
    #expect(result.failures["fail:2"]?.contains("intentional failure") == true)
  }

  @Test func timedOutCasesDoNotStallTheirGroup() async throws {
    let source = """
      globalThis.runNitroTest = async (name) => {
        if (name === 'hang') while (true) {}
      };
      """
    let result = try await runContract(source, groups: [["hang", "after"]])
    #expect(Set(result.failures.keys) == ["hang"], "\(result.failures)")
    #expect(result.failures["hang"]?.localizedCaseInsensitiveContains("timed out") == true)
  }

  @Test func parallelGroupsOverlapAndStayIsolated() async throws {
    let source = """
      globalThis.evaluations = (globalThis.evaluations ?? 0) + 1;
      globalThis.runNitroTest = async () => {
        if (globalThis.evaluations !== 1) throw new Error('runtime was shared');
        const TestObject = NitroModulesProxy.getHybridClass('test.TestObjectSwiftKotlin');
        const object = new TestObject();
        const value = await object.calculateFibonacciAsync(10);
        if (value !== 55n) throw new Error('callback reached the wrong runtime');
      };
      """
    let rendezvous = Rendezvous(parties: 2)
    let result = try await runContract(
      source, groups: [["parallel-0"], ["parallel-1"], ["parallel-2"]], workers: 2,
      timeoutMs: 10_000, onCaseStarted: { _ in rendezvous.arrive() })
    #expect(rendezvous.met, "Two initialized Hermes runtimes must meet before either case runs")
    #expect(result.peakConcurrency == 2, "The third group must wait for a worker")
    #expect(result.failures.isEmpty, "\(result.failures)")
  }

  @Test func changedBundleReplacesPreparedSource() async throws {
    for message in ["alpha", "bravo", "alpha"] {
      let source = "globalThis.runNitroTest = async () => { throw new Error('\(message)'); };"
      let failure = try #require(
        try await runContract(source, groups: [["changed-source"]]).failures["changed-source"])
      #expect(failure.contains(message))
    }
  }

  @Test func invalidSourceDoesNotPoisonPreparedBundle() async throws {
    let source = "globalThis.runNitroTest = async () => {};"
    #expect(try await runContract(source, groups: [["valid"]]).failures.isEmpty)
    let invalid = try await runContract("globalThis.runNitroTest = async () => {", groups: [["invalid"]])
    #expect(invalid.failures["invalid"] != nil)
    #expect(try await runContract(source, groups: [["valid"]]).failures.isEmpty)
  }

  @Test func timeoutOverridesApplyOnlyToSelectedCase() async throws {
    let source = """
      globalThis.getNitroTestTimeoutMs = (name) => name === 'slow' ? 2000 : undefined;
      globalThis.runNitroTest = async () => {
        const deadline = Date.now() + 1200;
        while (Date.now() < deadline) {}
      };
      """
    let result = try await runContract(source, groups: [["slow"], ["ordinary"]])
    #expect(result.failures["slow"] == nil, "\(result.failures)")
    let ordinary = try #require(result.failures["ordinary"])
    #expect(ordinary.localizedCaseInsensitiveContains("timed out"))
    #expect(ordinary.contains("running JS test"))
  }

  @Test func rejectsInvalidTimeoutOverrides() async throws {
    for value in ["0", "-1", "1.5", "NaN", "Infinity", "4294967296", "'1000'", "null"] {
      let source = """
        globalThis.getNitroTestTimeoutMs = () => \(value);
        globalThis.runNitroTest = async () => {};
        """
      let failure = try #require(
        try await runContract(source, groups: [["invalid-timeout"]]).failures["invalid-timeout"])
      #expect(failure.contains("getNitroTestTimeoutMs"))
    }
  }

  @Test func unresolvedPromisesTimeOut() async throws {
    let source = "globalThis.runNitroTest = () => new Promise(() => {})"
    let failure = try #require(try await runContract(source, groups: [["pending"]]).failures["pending"])
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
    let result = try await runContract(source, groups: [["separate-timeouts"]])
    #expect(result.failures.isEmpty, "\(result.failures)")
  }

  @Test func evaluationLoopsTimeOut() async throws {
    let failure = try #require(
      try await runContract("while (true) {}", groups: [["evaluation-loop"]]).failures["evaluation-loop"])
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("loading JS test bundle"))
  }

  @Test func synchronousLoopsTimeOut() async throws {
    let source = """
      globalThis.runNitroTest = () => {
        while (true) {}
      };
      """
    let failure = try #require(try await runContract(source, groups: [["loop"]]).failures["loop"])
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
    let failure = try #require(
      try await runContract(source, groups: [["microtask-loop"]]).failures["microtask-loop"])
    #expect(failure.localizedCaseInsensitiveContains("timed out"))
    #expect(failure.contains("running JS test"))
  }
}

/// Lets worker threads wait until `parties` of them have arrived. The deadline
/// only turns a serialization regression into a failure instead of a hang.
private final class Rendezvous: @unchecked Sendable {
  private let condition = NSCondition()
  private let parties: Int
  private var arrived = 0
  private var timedOut = false

  init(parties: Int) {
    self.parties = parties
  }

  func arrive() {
    condition.lock()
    defer { condition.unlock() }
    arrived += 1
    condition.broadcast()
    let deadline = Date().addingTimeInterval(10)
    while arrived < parties {
      if !condition.wait(until: deadline) {
        timedOut = true
        return
      }
    }
  }

  var met: Bool {
    condition.lock()
    defer { condition.unlock() }
    return arrived >= parties && !timedOut
  }
}
