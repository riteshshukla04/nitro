#pragma once

#include "JNICallback.hpp"
#include <NitroModules/JSIConverter+Callback.hpp>

namespace margelo::nitro {

template <typename JavaCallback>
  requires requires {
    typename JavaCallback::NativeSignature;
    typename JavaCallback::CxxPart;
  }
struct JSIConverter<jni::local_ref<JavaCallback>> final {
  using NativeCallback = Callback<typename JavaCallback::NativeSignature>;

  static jni::local_ref<JavaCallback> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    auto callback = JSIConverter<NativeCallback>::fromJSI(runtime, value);
    using CxxPart = typename JavaCallback::CxxPart;
    return CxxPart::create(std::move(callback), false);
  }
  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<JavaCallback> value) {
    return JSIConverter<NativeCallback>::toJSI(runtime, getJNICallback<JavaCallback>(value));
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<NativeCallback>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
