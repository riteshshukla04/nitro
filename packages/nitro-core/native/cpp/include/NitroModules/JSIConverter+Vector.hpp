//
// Created by Marc Rousavy on 21.02.24.
//

#pragma once

#include <NitroModules/JSIArrayHelpers.hpp>
#include <NitroModules/JSIConverter.hpp>
#include <jsi/jsi.h>
#include <vector>

namespace margelo::nitro {

using namespace facebook;

// std::vector<T> <> T[]
template <typename ElementType>
struct JSIConverter<std::vector<ElementType>> final {
  static inline std::vector<ElementType> fromJSI(jsi::Runtime& runtime, const jsi::Value& arg)
    requires(JSIDecodable<ElementType> && std::constructible_from<ElementType, ElementType>)
  {
    jsi::Array array = arg.asObject(runtime).asArray(runtime);
    size_t length = array.size(runtime);

    std::vector<ElementType> vector;
    vector.reserve(length);
    for (size_t i = 0; i < length; ++i) {
      jsi::Value elementValue = array.getValueAtIndex(runtime, i);
      vector.emplace_back(JSIConverter<ElementType>::fromJSI(runtime, elementValue));
    }
    return vector;
  }
  static inline jsi::Value toJSI(jsi::Runtime& runtime, const std::vector<ElementType>& vector)
    requires requires(jsi::Runtime& rt, const std::vector<ElementType>& value) {
      { JSIConverter<ElementType>::toJSI(rt, value[0]) } -> std::convertible_to<jsi::Value>;
    }
  {
    return createJSIArray(runtime, vector.size(), [&](size_t i) { return JSIConverter<ElementType>::toJSI(runtime, vector[i]); });
  }

  static inline bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSITypeCheckable<ElementType>
  {
    return canConvertJSIArray(runtime, value,
                              [&](const jsi::Value& element) { return JSIConverter<ElementType>::canConvert(runtime, element); });
  }
};

} // namespace margelo::nitro
