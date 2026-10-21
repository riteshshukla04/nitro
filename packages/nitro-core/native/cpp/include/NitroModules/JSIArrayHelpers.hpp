#pragma once

#include <array>
#include <jsi/jsi.h>
#include <vector>

namespace margelo::nitro {

namespace jsi = facebook::jsi;

/** Convert each element and append all values with one push, using stack storage for small arrays. */
template <typename Convert>
jsi::Array createJSIArray(jsi::Runtime& runtime, size_t size, Convert convert) {
  jsi::Array result(runtime, 0);
  if (size == 0) {
    return result;
  }
  constexpr size_t inlineCapacity = 8;
  std::array<jsi::Value, inlineCapacity> inlineValues;
  std::vector<jsi::Value> heapValues;
  if (size > inlineCapacity) {
    heapValues.resize(size);
  }
  jsi::Value* values = size <= inlineCapacity ? inlineValues.data() : heapValues.data();
  for (size_t i = 0; i < size; ++i) {
    values[i] = convert(i);
  }
  // A const pointer selects the buffer overload instead of the variadic push overload.
  result.push(runtime, static_cast<const jsi::Value*>(values), size);
  return result;
}

/** Accept empty arrays; check only the first element to keep union selection inexpensive. */
template <typename CanConvertElement>
bool canConvertJSIArray(jsi::Runtime& runtime, const jsi::Value& value, CanConvertElement canConvertElement) {
  if (!value.isObject()) {
    return false;
  }
  auto object = value.getObject(runtime);
  if (!object.isArray(runtime)) {
    return false;
  }
  auto array = object.getArray(runtime);
  return array.size(runtime) == 0 || canConvertElement(array.getValueAtIndex(runtime, 0));
}

} // namespace margelo::nitro
