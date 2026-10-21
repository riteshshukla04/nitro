#pragma once

#include "JNIConverter.hpp"
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <typename Cpp, typename T>
struct JNIConverter<Cpp, jni::global_ref<T>> {
  using LocalRef = jni::local_ref<T>;

  static jni::global_ref<T> toJNI(const Cpp& value) {
    return jni::make_global(JNIConverter<Cpp, LocalRef>::toJNI(value));
  }

  static Cpp fromJNI(jni::alias_ref<T> value) {
    return JNIConverter<Cpp, LocalRef>::fromJNI(value);
  }
};

} // namespace margelo::nitro
