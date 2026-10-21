package com.margelo.nitro.utils

/** Maps object array elements without an intermediate List. */
inline fun <Element, reified Result> Array<Element>.mapToArray(transform: (Element) -> Result): Array<Result> =
  Array(size) { transform(this[it]) }

/** Maps primitive LongArray elements to an object array without an intermediate List. */
inline fun <reified Result> LongArray.mapToArray(transform: (Long) -> Result): Array<Result> = Array(size) { transform(this[it]) }

/** Maps object array elements to a primitive LongArray in one allocation. */
inline fun <Element> Array<Element>.mapToLongArray(transform: (Element) -> Long): LongArray = LongArray(size) { transform(this[it]) }
