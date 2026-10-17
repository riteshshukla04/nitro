package com.margelo.nitro.testing

import com.facebook.soloader.nativeloader.NativeLoader
import com.facebook.soloader.nativeloader.SystemDelegate

object NitroCore {
  init {
    // fbjni's HybridData loads libfbjni through NativeLoader. Use Android's
    // standard System.loadLibrary in this standalone host.
    NativeLoader.initIfUninitialized(SystemDelegate())
    System.loadLibrary("NitroModules")
  }

  /** Loads the library and registers Nitro's core JNI bindings once. */
  fun initialize() = Unit
}
