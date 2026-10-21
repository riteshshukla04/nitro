#pragma once

#include "JAnyJSON.hpp"
#include "JNIConverter+String.hpp"
#include "JNIConverter.hpp"

namespace margelo::nitro {

template <>
struct JNIConverter<AnyJSON, jni::local_ref<JAnyJSON>> {
  static jni::local_ref<JAnyJSON> toJNI(const AnyJSON& value) {
    return JAnyJSON::create(JNIConverter<std::string, jni::local_ref<jni::JString>>::toJNI(value.stringRepresentation));
  }
  static AnyJSON fromJNI(jni::alias_ref<JAnyJSON> value) {
    return AnyJSON(JNIConverter<std::string, jni::local_ref<jni::JString>>::fromJNI(value->getStringRepresentation()));
  }
};

} // namespace margelo::nitro
