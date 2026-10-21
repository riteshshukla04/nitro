#pragma once

#include <NitroModules/JSIConverter.hpp>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;
namespace jsi = facebook::jsi;

/** Converts strings on an attached thread, preserving their UTF-16 code units. */
template <>
struct JSIConverter<jni::local_ref<jni::JString>> {
  static jni::local_ref<jni::JString> fromJSI(jsi::Runtime& runtime, const jsi::Value& value);
  static jni::local_ref<jni::JString> fromJSI(jsi::Runtime& runtime, const jsi::String& value);
  static jsi::String toJSI(jsi::Runtime& runtime, jni::alias_ref<jni::JString> value);
  static bool canConvert(jsi::Runtime&, const jsi::Value& value) {
    return value.isString();
  }
};

} // namespace margelo::nitro
