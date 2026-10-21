#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** Java Long storage interpreted as Kotlin ULong's unsigned bits. */
struct JUInt64 : jni::JavaClass<JUInt64, jni::JLong> {
  static constexpr auto kJavaDescriptor = "Ljava/lang/Long;";
};

/** Java long[] storage interpreted as Kotlin ULongArray's unsigned bits. */
struct JArrayUInt64 : jni::JavaClass<JArrayUInt64, jni::JArrayLong> {
  static constexpr auto kJavaDescriptor = "[J";

  static jni::local_ref<JArrayUInt64> newArray(size_t size) {
    auto array = jni::JArrayLong::newArray(size);
    auto raw = array.release();
    auto object = static_cast<javaobject>(raw);
    return jni::adopt_local(object);
  }
};

} // namespace margelo::nitro
