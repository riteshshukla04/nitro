#pragma once

#include "JHybridObject.hpp"
#include "JNIConverter.hpp"
#include <concepts>
#include <memory>

namespace margelo::nitro {

template <typename Cpp, typename Java>
  requires std::derived_from<Cpp, JHybridObject> && std::derived_from<Java, JHybridObject::JavaPart>
struct JNIConverter<std::shared_ptr<Cpp>, jni::local_ref<Java>> {
  static jni::local_ref<Java> toJNI(const std::shared_ptr<Cpp>& value) {
    return jni::make_local(value->getJavaPart());
  }

  static std::shared_ptr<Cpp> fromJNI(jni::alias_ref<Java> value) {
    auto object = value->getJHybridObject();
    auto result = std::dynamic_pointer_cast<Cpp>(object);
    if (!result) [[unlikely]] {
      throw std::runtime_error("The Java HybridObject has an incompatible native type.");
    }
    return result;
  }
};

} // namespace margelo::nitro
