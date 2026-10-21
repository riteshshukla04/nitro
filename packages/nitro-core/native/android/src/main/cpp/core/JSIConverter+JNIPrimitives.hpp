#pragma once

#include "JNIConverter+Primitives.hpp"
#include <NitroModules/JSIConverter.hpp>
#include <type_traits>

namespace margelo::nitro {

namespace jsi = facebook::jsi;

template <typename Cpp, typename JNI>
struct JSIPrimitiveJNIConverter {
  static JNI fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return JNIConverter<Cpp, JNI>::toJNI(JSIConverter<Cpp>::fromJSI(runtime, value));
  }
  static jsi::Value toJSI(jsi::Runtime& runtime, JNI value) {
    return JSIConverter<Cpp>::toJSI(runtime, JNIConverter<Cpp, JNI>::fromJNI(value));
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<Cpp>::canConvert(runtime, value);
  }
};

template <typename Cpp, typename JavaBox>
struct JSIBoxedJNIConverter {
  using JNI = jni::local_ref<JavaBox>;

  static JNI fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return JNIConverter<Cpp, JNI>::toJNI(JSIConverter<Cpp>::fromJSI(runtime, value));
  }
  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<JavaBox> value) {
    return JSIConverter<Cpp>::toJSI(runtime, JNIConverter<Cpp, JNI>::fromJNI(value));
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<Cpp>::canConvert(runtime, value);
  }
};

template <>
struct JSIConverter<jni::local_ref<jni::JInteger>> : JSIBoxedJNIConverter<int32_t, jni::JInteger> {};

template <>
struct JSIConverter<jni::local_ref<jni::JFloat>> : JSIBoxedJNIConverter<float, jni::JFloat> {};

template <>
struct JSIConverter<jni::local_ref<jni::JDouble>> : JSIBoxedJNIConverter<double, jni::JDouble> {};

} // namespace margelo::nitro
