#pragma once

#include "JOptional.hpp"
#include <NitroModules/JSIConverter.hpp>
#include <NitroModules/detail/CountTrailingOptionals.hpp>

namespace margelo::nitro {

namespace jsi = facebook::jsi;

namespace detail {
  template <typename T>
  struct is_optional<jni::local_ref<JOptional<T>>> : std::true_type {};

  template <typename T>
  struct is_optional<jni::alias_ref<JOptional<T>>> : std::true_type {};
} // namespace detail

template <typename T>
struct JSIConverter<jni::local_ref<JOptional<T>>> {
  static jni::local_ref<JOptional<T>> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSIDecodable<jni::local_ref<T>>
  {
    if (value.isUndefined()) {
      return nullptr;
    }
    auto wrapped = JSIConverter<jni::local_ref<T>>::fromJSI(runtime, value);
    auto raw = wrapped.release();
    auto object = static_cast<jobject>(raw);
    auto optional = static_cast<typename JOptional<T>::javaobject>(object);
    return jni::adopt_local(optional);
  }
  static jsi::Value toJSI(jsi::Runtime& runtime, jni::alias_ref<JOptional<T>> value)
    requires JSIEncodable<jni::local_ref<T>>
  {
    if (!value) {
      return jsi::Value::undefined();
    }
    auto object = jni::static_ref_cast<jni::JObject>(value);
    auto unwrapped = jni::static_ref_cast<T>(object);
    return JSIConverter<jni::local_ref<T>>::toJSI(runtime, unwrapped);
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSITypeCheckable<jni::local_ref<T>>
  {
    return value.isUndefined() || JSIConverter<jni::local_ref<T>>::canConvert(runtime, value);
  }
};

/** Borrow only when the wrapped converter provides a reference backed by a static owner. */
template <typename T>
struct JSIConverter<jni::alias_ref<JOptional<T>>> : JSIConverter<jni::local_ref<JOptional<T>>> {
  static jni::alias_ref<JOptional<T>> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSIDecodable<jni::alias_ref<T>>
  {
    if (value.isUndefined()) {
      return nullptr;
    }
    const auto wrapped = JSIConverter<jni::alias_ref<T>>::fromJSI(runtime, value);
    auto object = jni::static_ref_cast<jni::JObject>(wrapped);
    return jni::static_ref_cast<JOptional<T>>(object);
  }
};

} // namespace margelo::nitro
