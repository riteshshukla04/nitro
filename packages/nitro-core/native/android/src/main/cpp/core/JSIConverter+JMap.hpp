#pragma once

#include "JNIMapCursor.hpp"
#include <NitroModules/JSIConverter.hpp>
#include <NitroModules/JSIHelpers.hpp>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;
namespace jsi = facebook::jsi;

template <typename Key, typename Value>
struct JSIConverter<jni::local_ref<jni::JMap<Key, Value>>> {
  using JavaMap = jni::JMap<Key, Value>;
  using OwnedKey = jni::local_ref<Key>;
  using OwnedValue = jni::local_ref<Value>;

  static jni::local_ref<JavaMap> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires(JSIDecodable<OwnedKey> && JSIDecodable<OwnedValue>)
  {
    auto object = value.asObject(runtime);
    auto keys = object.getPropertyNames(runtime);
    const jsize size = static_cast<jsize>(keys.size(runtime));
    auto result = jni::JHashMap<Key, Value>::create(getJNIMapCapacity(size));
    for (jsize i = 0; i < size; ++i) {
      auto key = keys.getValueAtIndex(runtime, i);
      auto element = object.getProperty(runtime, key);
      result->put(JSIConverter<OwnedKey>::fromJSI(runtime, key), JSIConverter<OwnedValue>::fromJSI(runtime, element));
    }
    return result;
  }
  static jsi::Object toJSI(jsi::Runtime& runtime, jni::alias_ref<JavaMap> value)
    requires(JSIEncodable<OwnedKey> && JSIEncodable<OwnedValue>)
  {
    jsi::Object result(runtime);
    JNIMapCursor<Key, Value> cursor(value);
    while (cursor.advance()) {
      auto key = cursor.key();
      auto element = cursor.value();
      auto jsKey = JSIConverter<OwnedKey>::toJSI(runtime, key);
      result.setProperty(runtime, jsKey, JSIConverter<OwnedValue>::toJSI(runtime, element));
    }
    return result;
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires(JSITypeCheckable<OwnedKey> && JSITypeCheckable<OwnedValue>)
  {
    if (!value.isObject()) {
      return false;
    }
    auto object = value.getObject(runtime);
    if (!isPlainObject(runtime, object)) {
      return false;
    }
    auto keys = object.getPropertyNames(runtime);
    if (keys.size(runtime) == 0) {
      return true;
    }
    auto key = keys.getValueAtIndex(runtime, 0);
    return JSIConverter<OwnedKey>::canConvert(runtime, key) &&
           JSIConverter<OwnedValue>::canConvert(runtime, object.getProperty(runtime, key));
  }
};

} // namespace margelo::nitro
