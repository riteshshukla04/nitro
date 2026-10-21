#pragma once

#include "JNIConverter.hpp"
#include <bit>
#include <cstdint>
#include <fbjni/fbjni.h>
#include <utility>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <>
struct JNIConverter<bool, jboolean> {
  static jboolean toJNI(bool value) {
    return value ? JNI_TRUE : JNI_FALSE;
  }
  static bool fromJNI(jboolean value) {
    return value != JNI_FALSE;
  }
};

template <>
struct JNIConverter<int32_t, jint> {
  static jint toJNI(int32_t value) {
    return value;
  }
  static int32_t fromJNI(jint value) {
    return value;
  }
};

template <>
struct JNIConverter<int64_t, jlong> {
  static jlong toJNI(int64_t value) {
    return static_cast<jlong>(value);
  }
  static int64_t fromJNI(jlong value) {
    return static_cast<int64_t>(value);
  }
};

template <>
struct JNIConverter<float, jfloat> {
  static jfloat toJNI(float value) {
    return value;
  }
  static float fromJNI(jfloat value) {
    return value;
  }
};

template <>
struct JNIConverter<double, jdouble> {
  static jdouble toJNI(double value) {
    return value;
  }
  static double fromJNI(jdouble value) {
    return value;
  }
};

template <typename Cpp, typename JavaBox>
struct JNIBoxedPrimitiveConverter {
  using JPrimitive = decltype(std::declval<const JavaBox&>().value());

  static jni::local_ref<JavaBox> toJNI(Cpp value) {
    return JavaBox::valueOf(JNIConverter<Cpp, JPrimitive>::toJNI(value));
  }
  static Cpp fromJNI(jni::alias_ref<JavaBox> value) {
    return JNIConverter<Cpp, JPrimitive>::fromJNI(value->value());
  }
};

template <>
struct JNIConverter<bool, jni::local_ref<jni::JBoolean>> : JNIBoxedPrimitiveConverter<bool, jni::JBoolean> {};

template <>
struct JNIConverter<int32_t, jni::local_ref<jni::JInteger>> : JNIBoxedPrimitiveConverter<int32_t, jni::JInteger> {};

template <>
struct JNIConverter<int64_t, jni::local_ref<jni::JLong>> : JNIBoxedPrimitiveConverter<int64_t, jni::JLong> {};

template <>
struct JNIConverter<float, jni::local_ref<jni::JFloat>> : JNIBoxedPrimitiveConverter<float, jni::JFloat> {};

template <>
struct JNIConverter<double, jni::local_ref<jni::JDouble>> : JNIBoxedPrimitiveConverter<double, jni::JDouble> {};

} // namespace margelo::nitro
