#pragma once

#include "JNIConverter.hpp"
#include <fbjni/fbjni.h>
#include <string>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <>
struct JNIConverter<std::string, jni::local_ref<jni::JString>> {
  static jni::local_ref<jni::JString> toJNI(const std::string& value);
  static std::string fromJNI(jni::alias_ref<jni::JString> value);
};

} // namespace margelo::nitro
