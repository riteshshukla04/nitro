#pragma once

#include "JAnyJSON.hpp"
#include "JSIConverter+JString.hpp"
#include <NitroModules/CommonGlobals.hpp>

namespace margelo::nitro {

template <>
struct JSIConverter<jni::local_ref<JAnyJSON>> {
  static jni::local_ref<JAnyJSON> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    const auto json = CommonGlobals::JSON::stringify(runtime, value);
    return JAnyJSON::create(JSIConverter<jni::local_ref<jni::JString>>::fromJSI(runtime, json));
  }
  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<JAnyJSON> value) {
    // TODO: Use jsi::Value::createFromJsonUtf16 once Hermes/JSI includes
    // https://github.com/facebook/hermes/pull/2259.
    const auto json = JSIConverter<jni::local_ref<jni::JString>>::toJSI(runtime, value->getStringRepresentation());
    return CommonGlobals::JSON::parse(runtime, json);
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<AnyJSON>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
