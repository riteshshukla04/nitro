package com.margelo.nitro.test

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONTokener
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class HybridObjectTest(
  private val name: String,
) {
  @Test
  fun runJavaScriptTest() {
    val failure = NativeTestRuntime.runTest(readAsset("runtime-tests.js"), name)
    if (failure.isNotEmpty()) throw AssertionError(failure)
  }

  companion object {
    @JvmStatic
    @Parameterized.Parameters(name = "{0}")
    fun cases(): List<Array<String>> {
      val parser = JSONTokener(readAsset("runtime-tests.json"))
      val manifest = parser.nextValue()
      require(manifest is JSONArray && parser.nextClean() == '\u0000') {
        "runtime-tests.json must contain an array of test names"
      }
      require(manifest.length() > 0) { "runtime-tests.json contains no tests" }

      val names = mutableSetOf<String>()
      return (0 until manifest.length()).map { index ->
        val name = manifest.get(index)
        require(name is String && name.isNotBlank()) {
          "runtime-tests.json entry $index must be a nonblank string"
        }
        require(names.add(name)) { "runtime-tests.json contains duplicate test: $name" }
        arrayOf(name)
      }
    }

    private fun readAsset(name: String): String =
      InstrumentationRegistry
        .getInstrumentation()
        .context.assets
        .open(name)
        .bufferedReader()
        .use { it.readText() }
  }
}
