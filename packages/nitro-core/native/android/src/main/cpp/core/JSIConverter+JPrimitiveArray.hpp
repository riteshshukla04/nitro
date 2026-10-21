#pragma once

#include "JSIConverter+JNIPrimitives.hpp"
#include <NitroModules/JSIArrayHelpers.hpp>
#include <array>
#include <concepts>
#include <type_traits>

namespace margelo::nitro {

template <typename JavaArray>
  requires(jni::IsInstantiationOf<jni::JPrimitiveArray, JavaArray>() || std::same_as<JavaArray, JArrayUInt64>)
struct JSIConverter<jni::local_ref<JavaArray>> {
  using Primitive = typename JavaArray::T;
  using Element = std::conditional_t<std::same_as<JavaArray, JArrayUInt64>, uint64_t, Primitive>;

  static jni::local_ref<JavaArray> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSIDecodable<Element>
  {
    auto array = value.asObject(runtime).asArray(runtime);
    const jsize size = static_cast<jsize>(array.size(runtime));
    auto result = JavaArray::newArray(size);
    if (size != 0) {
      // pin() permits JNI/JSI calls while borrowed; pinCritical() does not.
      auto elements = result->pin();
      for (jsize i = 0; i < size; ++i) {
        elements[i] = JNIConverter<Element, Primitive>::toJNI(JSIConverter<Element>::fromJSI(runtime, array.getValueAtIndex(runtime, i)));
      }
    }
    return result;
  }
  static jsi::Array toJSI(jsi::Runtime& runtime, jni::alias_ref<JavaArray> value)
    requires JSIEncodable<Element>
  {
    const size_t size = value->size();
    if (size == 0) {
      return jsi::Array(runtime, 0);
    }
    auto elements = value->pin();
    return createJSIArray(runtime, size, [&](size_t i) {
      return JSIConverter<Element>::toJSI(runtime, JNIConverter<Element, Primitive>::fromJNI(elements[i]));
    });
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSITypeCheckable<Element>
  {
    return canConvertJSIArray(runtime, value,
                              [&](const jsi::Value& element) { return JSIConverter<Element>::canConvert(runtime, element); });
  }
};

} // namespace margelo::nitro
