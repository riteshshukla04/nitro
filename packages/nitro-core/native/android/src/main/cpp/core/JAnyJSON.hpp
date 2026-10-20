#pragma once

#include <NitroModules/AnyJSON.hpp>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

/** Bridges encoded JSON without parsing or re-encoding it. */
struct JAnyJSON final : facebook::jni::JavaClass<JAnyJSON> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/AnyJSON;";

  static facebook::jni::local_ref<JAnyJSON> create(const AnyJSON& value) {
    return newInstance(facebook::jni::make_jstring(value.stringRepresentation));
  }

  AnyJSON toCpp() const {
    static const auto getter = javaClassStatic()->getMethod<facebook::jni::JString()>("getStringRepresentation");
    return AnyJSON{getter(self())->toStdString()};
  }
};

} // namespace margelo::nitro
