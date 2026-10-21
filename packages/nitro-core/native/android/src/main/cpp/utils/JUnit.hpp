//
//  JUnit.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 19.11.24.
//

#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/**
 * Represents a `Unit` from Kotlin.
 * This is similar to `void` for Java, but is actually an `Object`.
 */
class JUnit final : public jni::JavaClass<JUnit> {
public:
  static constexpr auto kJavaDescriptor = "Lkotlin/Unit;";

public:
  /**
   * Gets the shared instance to `Unit`. This is always a static global.
   */
  static jni::alias_ref<JUnit> instance() {
    static const auto value = [] {
      const auto clazz = javaClassStatic();
      const auto field = clazz->getStaticField<JUnit>("INSTANCE");
      return jni::make_global(clazz->getStaticFieldValue(field));
    }();
    return value;
  }
};

} // namespace margelo::nitro
