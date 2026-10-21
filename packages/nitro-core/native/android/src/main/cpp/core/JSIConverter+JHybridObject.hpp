#pragma once

#include "JNIConverter+HybridObject.hpp"
#include <NitroModules/JSIConverter+NativeState.hpp>

namespace margelo::nitro {

template <typename Java>
  requires std::derived_from<Java, JHybridObject::JavaPart>
struct JSIConverter<jni::local_ref<Java>> final {
  using Cpp = std::shared_ptr<typename Java::HybridType>;
  using Converter = JNIConverter<Cpp, jni::local_ref<Java>>;

  static jni::local_ref<Java> fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    return Converter::toJNI(JSIConverter<Cpp>::fromJSI(runtime, value));
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<Java> value) {
    return JSIConverter<Cpp>::toJSI(runtime, Converter::fromJNI(value));
  }

  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    return JSIConverter<Cpp>::canConvert(runtime, value);
  }
};

} // namespace margelo::nitro
