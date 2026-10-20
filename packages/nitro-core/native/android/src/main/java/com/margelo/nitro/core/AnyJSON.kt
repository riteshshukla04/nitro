package com.margelo.nitro.core

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

/**
 * An encoded JSON value, stored without validation or re-encoding.
 *
 * Use a JSON encoder to produce [stringRepresentation]. The root can be an object,
 * array, string, number, boolean, or null. Equality compares the encoded text,
 * including whitespace and key order.
 */
@Keep
@DoNotStrip
data class AnyJSON(
  @get:Keep
  @get:DoNotStrip
  val stringRepresentation: String,
)
