package com.margelo.nitro.utils

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

/** Keeps map traversal local to one synchronous JNI conversion. */
@Keep
@DoNotStrip
internal class MapIterator(
  map: Map<*, *>,
) {
  private val iterator = map.entries.iterator()

  @JvmField
  @Keep
  @DoNotStrip
  var key: Any? = null

  @JvmField
  @Keep
  @DoNotStrip
  var value: Any? = null

  @Keep
  @DoNotStrip
  fun advance(): Boolean {
    if (!iterator.hasNext()) {
      key = null
      value = null
      return false
    }
    val entry = iterator.next()
    key = entry.key
    value = entry.value
    return true
  }
}
