package com.margelo.nitro.testing

import com.facebook.soloader.nativeloader.NativeLoader
import com.facebook.soloader.nativeloader.SystemDelegate
import com.margelo.nitro.JNIOnLoad

object NitroCore {
  init {
    // fbjni's HybridData loads libfbjni through NativeLoader. Use Android's
    // standard System.loadLibrary in this standalone host.
    NativeLoader.initIfUninitialized(SystemDelegate())
    // Run fbjni's JNI_OnLoad before a native worker needs ThreadScopeSupport.
    System.loadLibrary("fbjni")
    JNIOnLoad.initializeNativeNitro()
  }

  /** Loads the library and registers Nitro's core JNI bindings once. */
  fun initialize() = Unit
}
