//
//  JNull.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 10.11.25
//

#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/**
 * Represents a `Null` from Kotlin.
 */
struct JNull final : public jni::JavaClass<JNull> {
public:
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/NullType;";

public:
  static jni::alias_ref<JNull> null() {
    static const auto value = [] {
      const auto clazz = javaClassStatic();
      const auto field = clazz->getStaticField<JNull>("NULL");
      return jni::make_global(clazz->getStaticFieldValue(field));
    }();
    return value;
  }
};

} // namespace margelo::nitro
