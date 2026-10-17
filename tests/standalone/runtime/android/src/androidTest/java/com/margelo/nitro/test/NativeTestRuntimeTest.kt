package com.margelo.nitro.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeTestRuntimeTest {
  @Test
  fun reportsJavaScriptFailures() {
    val failure =
      NativeTestRuntime.runTest(
        "globalThis.runNitroTest = async () => { throw new Error('sentinel failure'); };",
        "bridge failure",
      )
    assertTrue(failure, failure.contains("sentinel failure"))
  }

  @Test
  fun reportsSynchronousJavaScriptFailures() {
    val failure = NativeTestRuntime.runTest("throw new Error('sync sentinel');", "bundle failure")
    assertTrue(failure, failure.contains("sync sentinel"))
  }

  @Test
  fun timesOutPendingPromises() {
    val failure =
      NativeTestRuntime.runTest(
        "globalThis.runNitroTest = () => new Promise(() => {});",
        "pending promise",
        50,
      )
    assertTrue(failure, failure.contains("timed out", ignoreCase = true))
  }

  @Test
  fun timesOutSynchronousJavaScript() {
    val failure = NativeTestRuntime.runTest("while (true) {}", "infinite loop", 100)
    assertTrue(failure, failure.contains("timed out", ignoreCase = true))
  }
}
