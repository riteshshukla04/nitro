#pragma once

#include "JNIConverter.hpp"
#include <exception>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <>
struct JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>> {
  static jni::local_ref<jni::JThrowable> toJNI(const std::exception_ptr& error);

  static std::exception_ptr fromJNI(jni::alias_ref<jni::JThrowable> error);
};

} // namespace margelo::nitro
