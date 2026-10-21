#pragma once

#include "JNIConverter+Null.hpp"
#include <NitroModules/JSIConverter+Null.hpp>

namespace margelo::nitro {

template <>
struct JSIConverter<jni::local_ref<JNull>> final {
  static jni::local_ref<JNull> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return JNIConverter<NullType, jni::local_ref<JNull>>::toJNI(JSIConverter<NullType>::fromJSI(runtime, value));
  }

  static jsi::Value toJSI(jsi::Runtime&, jni::alias_ref<JNull>) {
    return jsi::Value::null();
  }

  static bool canConvert(jsi::Runtime&, const jsi::Value& value) {
    return value.isNull();
  }
};

} // namespace margelo::nitro
