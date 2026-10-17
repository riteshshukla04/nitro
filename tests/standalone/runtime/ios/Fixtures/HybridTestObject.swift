import NitroModules

final class HybridTestObject: HybridTestObjectSpec {
  func bounceBoolean(value: Bool) throws -> Bool {
    return value
  }

  func calculateFibonacciAsync(value: Double) throws -> Promise<Int64> {
    guard value.isFinite, value >= 0, value <= 92, value.rounded() == value else {
      return Promise.rejected(
        withError: RuntimeError.error(
          withMessage: "Fibonacci input must be an integer between 0 and 92."))
    }
    if value == 0 { return Promise.resolved(withResult: 0) }
    return Promise.parallel {
      let count = Int(value)
      var previous: Int64 = 0
      var current: Int64 = 1
      for _ in 1..<count {
        (previous, current) = (current, previous + current)
      }
      return current
    }
  }
}
