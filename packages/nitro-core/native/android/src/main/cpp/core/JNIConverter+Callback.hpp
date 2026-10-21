#pragma once

#include "JNICallback.hpp"

namespace margelo::nitro {

template <typename CppResult, typename... CppArgs, typename JavaResult, typename... JavaArgs>
struct JNICallbackConverter<InlineCallback<CppResult(CppArgs...)>, Callback<JavaResult(JavaArgs...)>> {
  using Cpp = InlineCallback<CppResult(CppArgs...)>;
  using Java = Callback<JavaResult(JavaArgs...)>;

  static Java toJNI(const Cpp& value) {
    return JNICallbackConverter<Callback<CppResult(CppArgs...)>, Java>::toJNI(value.escape());
  }

  static Cpp fromJNI(const Java& value) {
    if (auto* native = std::get_if<typename Java::NativeCallback>(&value._impl)) {
      return Cpp::make([callback = *native](CppArgs... args) -> CppResult {
        if constexpr (std::is_void_v<CppResult>) {
          callback(JNIConverter<std::remove_cvref_t<CppArgs>, std::remove_cvref_t<JavaArgs>>::toJNI(args)...);
        } else {
          return JNIConverter<CppResult, JavaResult>::fromJNI(
              callback(JNIConverter<std::remove_cvref_t<CppArgs>, std::remove_cvref_t<JavaArgs>>::toJNI(args)...));
        }
      });
    } else {
      const auto& callback = std::get<typename Java::JSCallback>(value._impl);
      jsi::Runtime& runtime = callback._runtime;
      jsi::Function function = jsi::Value(runtime, *callback._function).getObject(runtime).getFunction(runtime);
      return Cpp::make(runtime, std::move(function));
    }
  }
};

/** Native C++ callback conversion is separate from its direct JNI/JSI
 * representation. */
template <typename CppResult, typename... CppArgs, typename JavaCallback>
struct JNIConverter<Callback<CppResult(CppArgs...)>, jni::local_ref<JavaCallback>> {
  using Cpp = Callback<CppResult(CppArgs...)>;
  using NativeCallback = Callback<typename JavaCallback::NativeSignature>;
  using CxxPart = typename JavaCallback::CxxPart;

  static jni::local_ref<JavaCallback> toJNI(const Cpp& value) {
    return CxxPart::create(JNICallbackConverter<Cpp, NativeCallback>::toJNI(value), false);
  }

  static Cpp fromJNI(jni::alias_ref<JavaCallback> value) {
    return JNICallbackConverter<Cpp, NativeCallback>::fromJNI(getJNICallback<JavaCallback>(value));
  }
};

template <typename CppResult, typename... CppArgs, typename JavaCallback>
struct JNIConverter<InlineCallback<CppResult(CppArgs...)>, jni::local_ref<JavaCallback>> {
  using Cpp = InlineCallback<CppResult(CppArgs...)>;
  using NativeCallback = Callback<typename JavaCallback::NativeSignature>;
  using CxxPart = typename JavaCallback::CxxPart;

  static jni::local_ref<JavaCallback> toJNI(const Cpp& value) {
    return CxxPart::create(JNICallbackConverter<Cpp, NativeCallback>::toJNI(value), true);
  }

  static Cpp fromJNI(jni::alias_ref<JavaCallback> value) {
    return JNICallbackConverter<Cpp, NativeCallback>::fromJNI(getJNICallback<JavaCallback>(value));
  }
};

} // namespace margelo::nitro
