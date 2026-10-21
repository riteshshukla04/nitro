#pragma once

#include "JSIConverter+JNIPrimitives.hpp"
#include <NitroModules/JSIArrayHelpers.hpp>

namespace margelo::nitro {

template <typename Element>
struct JSIConverter<jni::local_ref<jni::JArrayClass<Element>>> {
  using JavaArray = jni::JArrayClass<Element>;
  using OwnedElement = jni::local_ref<Element>;

  static jni::local_ref<JavaArray> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSIDecodable<OwnedElement>
  {
    auto array = value.asObject(runtime).asArray(runtime);
    const jsize size = static_cast<jsize>(array.size(runtime));
    auto result = JavaArray::newArray(size);
    for (jsize i = 0; i < size; ++i) {
      auto element = JSIConverter<OwnedElement>::fromJSI(runtime, array.getValueAtIndex(runtime, i));
      result->setElement(i, *element);
    }
    return result;
  }
  static jsi::Array toJSI(jsi::Runtime& runtime, jni::alias_ref<JavaArray> value)
    requires JSIEncodable<OwnedElement>
  {
    return createJSIArray(runtime, value->size(),
                          [&](size_t i) { return JSIConverter<OwnedElement>::toJSI(runtime, value->getElement(i)); });
  }
  static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSITypeCheckable<OwnedElement>
  {
    return canConvertJSIArray(runtime, value,
                              [&](const jsi::Value& element) { return JSIConverter<OwnedElement>::canConvert(runtime, element); });
  }
};

} // namespace margelo::nitro
