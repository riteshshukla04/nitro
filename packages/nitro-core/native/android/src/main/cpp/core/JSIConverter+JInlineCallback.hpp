#pragma once

#include "JInlineCallback.hpp"
#include "JSIConverter+JNICallback.hpp"

namespace margelo::nitro {

template <typename JavaCallback>
struct JSIConverter<jni::local_ref<JInlineCallback<JavaCallback>>> final {
  using NativeCallback = Callback<typename JavaCallback::NativeSignature>;
  using Java = JInlineCallback<JavaCallback>;

  static jni::local_ref<Java> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    auto callback = JSIConverter<NativeCallback>::fromJSI(runtime, value);
    using CxxPart = typename JavaCallback::CxxPart;
    auto result = CxxPart::create(std::move(callback), true);
    auto raw = result.release();
    auto object = reinterpret_cast<typename Java::javaobject>(raw);
    return jni::adopt_local(object);
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<Java> value) {
    auto object = jni::static_ref_cast<jni::JObject>(value);
    auto callback = jni::static_ref_cast<JavaCallback>(object);
    return JSIConverter<jni::local_ref<JavaCallback>>::toJSI(runtime, callback);
  }

  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<jni::local_ref<JavaCallback>>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
