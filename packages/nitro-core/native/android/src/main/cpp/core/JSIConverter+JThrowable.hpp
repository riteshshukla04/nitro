#pragma once

#include "JNIConverter+Error.hpp"
#include <NitroModules/JSIConverter+Exception.hpp>

namespace margelo::nitro {

template <>
struct JSIConverter<jni::local_ref<jni::JThrowable>> final {
  static jni::local_ref<jni::JThrowable> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::toJNI(
        JSIConverter<std::exception_ptr>::fromJSI(runtime, value));
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<jni::JThrowable> value) {
    return JSIConverter<std::exception_ptr>::toJSI(runtime,
                                                   JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::fromJNI(value));
  }

  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<std::exception_ptr>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
