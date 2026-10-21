#pragma once

#include "JNIConverter.hpp"
#include "JNIMapCursor.hpp"
#include <fbjni/fbjni.h>
#include <unordered_map>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <typename CppKey, typename CppValue, typename JavaKey, typename JavaValue>
struct JNIConverter<std::unordered_map<CppKey, CppValue>, jni::local_ref<jni::JMap<JavaKey, JavaValue>>> {
  using JavaMap = jni::JMap<JavaKey, JavaValue>;

  static jni::local_ref<JavaMap> toJNI(const std::unordered_map<CppKey, CppValue>& value) {
    auto map = jni::JHashMap<JavaKey, JavaValue>::create(getJNIMapCapacity(value.size()));
    for (const auto& [key, element] : value) {
      map->put(JNIConverter<CppKey, jni::local_ref<JavaKey>>::toJNI(key),
               JNIConverter<CppValue, jni::local_ref<JavaValue>>::toJNI(element));
    }
    return map;
  }
  static std::unordered_map<CppKey, CppValue> fromJNI(jni::alias_ref<JavaMap> value) {
    std::unordered_map<CppKey, CppValue> result;
    result.reserve(value->size());
    JNIMapCursor<JavaKey, JavaValue> cursor(value);
    while (cursor.advance()) {
      auto key = cursor.key();
      auto element = cursor.value();
      result.emplace(JNIConverter<CppKey, jni::local_ref<JavaKey>>::fromJNI(key),
                     JNIConverter<CppValue, jni::local_ref<JavaValue>>::fromJNI(element));
    }
    return result;
  }
};

} // namespace margelo::nitro
