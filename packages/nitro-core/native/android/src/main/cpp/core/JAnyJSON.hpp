#pragma once

#include <NitroModules/AnyJSON.hpp>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** Bridges encoded JSON without parsing or re-encoding it. */
struct JAnyJSON final : jni::JavaClass<JAnyJSON> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/AnyJSON;";

  static jni::local_ref<JAnyJSON> create(jni::alias_ref<jni::JString> value) {
    return newInstance(value);
  }
  static jni::local_ref<JAnyJSON> create(const AnyJSON& value);

  jni::local_ref<jni::JString> getStringRepresentation() const {
    static const auto field = javaClassStatic()->getField<jni::JString>("stringRepresentation");
    return getFieldValue(field);
  }
  AnyJSON toCpp() const;
};

} // namespace margelo::nitro
