#pragma once

#include <algorithm>
#include <cstdint>
#include <fbjni/fbjni.h>
#include <limits>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** HashMap's constructor takes capacity, rather than the expected entry count. */
inline jint getJNIMapCapacity(size_t size) {
  const auto count = static_cast<uint64_t>(size);
  // HashMap grows past its 0.75 load factor; this rounds up size / 0.75.
  const auto capacity = (count * 4 + 2) / 3;
  return static_cast<jint>(std::min(capacity, static_cast<uint64_t>(std::numeric_limits<jint>::max())));
}

namespace detail {
  struct JMapIterator final : jni::JavaClass<JMapIterator> {
    static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/utils/MapIterator;";

    template <typename Key, typename Value>
    static jni::local_ref<JMapIterator> create(jni::alias_ref<jni::JMap<Key, Value>> map) {
      return newInstance(map);
    }

    bool advance() const {
      static const auto clazz = javaClassStatic();
      static const auto method = clazz->getNonvirtualMethod<jboolean()>("advance");
      return method(self(), clazz);
    }

    jni::local_ref<jni::JObject> key() const {
      static const auto field = javaClassStatic()->getField<jni::JObject>("key");
      return getFieldValue(field);
    }
    jni::local_ref<jni::JObject> value() const {
      static const auto field = javaClassStatic()->getField<jni::JObject>("value");
      return getFieldValue(field);
    }
  };
} // namespace detail

/** Owns only a local iterator and consumes each field reference without cloning it. */
template <typename Key, typename Value>
class JNIMapCursor final {
public:
  explicit JNIMapCursor(jni::alias_ref<jni::JMap<Key, Value>> map) : _iterator(detail::JMapIterator::create(map)) {}

  bool advance() const {
    return _iterator->advance();
  }
  jni::local_ref<Key> key() const {
    auto key = _iterator->key();
    auto raw = key.release();
    auto object = static_cast<jni::JniType<Key>>(raw);
    return jni::adopt_local(object);
  }
  jni::local_ref<Value> value() const {
    auto value = _iterator->value();
    auto raw = value.release();
    auto object = static_cast<jni::JniType<Value>>(raw);
    return jni::adopt_local(object);
  }

private:
  jni::local_ref<detail::JMapIterator> _iterator;
};

} // namespace margelo::nitro
