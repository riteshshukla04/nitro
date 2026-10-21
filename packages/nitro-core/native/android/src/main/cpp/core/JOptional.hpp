#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** A nullable JNI reference with the same JVM type as its wrapped Java class. */
template <typename T>
struct JOptional : jni::JavaClass<JOptional<T>> {
  static constexpr const char* kJavaDescriptor = nullptr;
  static constexpr auto get_instantiated_java_descriptor() {
    return jni::jtype_traits<T>::kDescriptor;
  }
  static constexpr auto get_instantiated_base_name() {
    return jni::jtype_traits<T>::kBaseName;
  }
};

} // namespace margelo::nitro
