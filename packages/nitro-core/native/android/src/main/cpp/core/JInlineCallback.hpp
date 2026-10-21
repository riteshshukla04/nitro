#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** The same JVM callback interface, invoked synchronously for an inline spec. */
template <typename JavaCallback>
struct JInlineCallback : jni::JavaClass<JInlineCallback<JavaCallback>, JavaCallback> {
  static constexpr const char* kJavaDescriptor = nullptr;
  static constexpr auto get_instantiated_java_descriptor() {
    return jni::jtype_traits<JavaCallback>::kDescriptor;
  }
  static constexpr auto get_instantiated_base_name() {
    return jni::jtype_traits<JavaCallback>::kBaseName;
  }
};

} // namespace margelo::nitro
