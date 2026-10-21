#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** Java Long storage interpreted as Kotlin ULong's unsigned bits. */
struct JUInt64 : jni::JavaClass<JUInt64, jni::JLong> {
  static constexpr auto kJavaDescriptor = "Ljava/lang/Long;";
};

} // namespace margelo::nitro
