package com.margelo.nitro.test

import com.margelo.nitro.core.Promise

class HybridTestObject : HybridTestObjectSpec() {
  override fun bounceBoolean(value: Boolean): Boolean = value

  override fun calculateFibonacciAsync(value: Double): Promise<Long> {
    if (!value.isFinite() || value % 1.0 != 0.0 || value < 0 || value > 92) {
      return Promise.rejected(IllegalArgumentException("Fibonacci input must be an integer between 0 and 92"))
    }
    if (value == 0.0) return Promise.resolved(0L)
    return Promise.async {
      var previous = 0L
      var current = 1L
      repeat(value.toInt() - 1) {
        val next = previous + current
        previous = current
        current = next
      }
      current
    }
  }
}
