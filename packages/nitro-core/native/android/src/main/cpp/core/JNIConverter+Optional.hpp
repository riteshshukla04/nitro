#pragma once

#include "JNIConverter.hpp"
#include "JOptional.hpp"
#include <optional>

namespace margelo::nitro {

template <typename Cpp, typename JavaClass>
struct JNIConverter<std::optional<Cpp>, jni::local_ref<JOptional<JavaClass>>> {
  static jni::local_ref<JOptional<JavaClass>> toJNI(const std::optional<Cpp>& value) {
    if (!value) {
      return nullptr;
    }
    auto wrapped = JNIConverter<Cpp, jni::local_ref<JavaClass>>::toJNI(*value);
    auto raw = wrapped.release();
    auto object = static_cast<jobject>(raw);
    auto optional = static_cast<typename JOptional<JavaClass>::javaobject>(object);
    return jni::adopt_local(optional);
  }
  static std::optional<Cpp> fromJNI(jni::alias_ref<JOptional<JavaClass>> value) {
    if (!value) {
      return std::nullopt;
    }
    auto object = jni::static_ref_cast<jni::JObject>(value);
    auto unwrapped = jni::static_ref_cast<JavaClass>(object);
    return JNIConverter<Cpp, jni::local_ref<JavaClass>>::fromJNI(unwrapped);
  }
};

} // namespace margelo::nitro
