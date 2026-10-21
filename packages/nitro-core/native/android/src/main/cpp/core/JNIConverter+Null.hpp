#pragma once

#include "JNIConverter.hpp"
#include "JNull.hpp"
#include <NitroModules/Null.hpp>

namespace margelo::nitro {

template <>
struct JNIConverter<NullType, jni::local_ref<JNull>> {
  static jni::local_ref<JNull> toJNI(const NullType&) {
    return jni::make_local(JNull::null());
  }

  static NullType fromJNI(jni::alias_ref<JNull>) {
    return null;
  }
};

} // namespace margelo::nitro
