#pragma once

#include "JNIConverter+ArrayBuffer.hpp"
#include <NitroModules/JSIConverter+ArrayBuffer.hpp>

namespace margelo::nitro {

template <typename T>
  requires std::same_as<jni::ReprType<T>, JArrayBuffer::JavaPart>
struct JSIConverter<jni::local_ref<T>> final {
  static jni::local_ref<T> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return JNIConverter<ArrayBuffer, jni::local_ref<T>>::toJNI(JSIConverter<ArrayBuffer>::fromJSI(runtime, value));
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<T> value) {
    return JSIConverter<ArrayBuffer>::toJSI(runtime, JNIConverter<ArrayBuffer, jni::local_ref<T>>::fromJNI(value));
  }

  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<ArrayBuffer>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
