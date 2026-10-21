//
//  JSIConverter+SwiftArray.hpp
//  NitroModules
//
//  Created by Marc Rousavy on 30.09.26.
//

#pragma once

#include <NitroModules/JSIArrayHelpers.hpp>
#include <NitroModules/JSIConverter.hpp>

#include <NitroModules/JSIConverter+SwiftString.hpp>

// Use the consuming module's Swift definitions. Including another module's -Swift.h
// here can redefine metadata for C++ types exported by both modules.
#ifndef SWIFT_SWIFT_H
#error Include your generated -Swift.h header before JSIConverter+SwiftArray.hpp.
#endif

namespace margelo::nitro {

using namespace facebook;

// swift::Array<T> <> T[]
template <typename ElementType>
struct JSIConverter<swift::Array<ElementType>> final {
  static inline swift::Array<ElementType> fromJSI(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSIDecodable<ElementType>
  {
    jsi::Array array = value.asObject(runtime).asArray(runtime);
    size_t length = array.size(runtime);

    swift::Array<ElementType> result = swift::Array<ElementType>::init();
    result.reserveCapacity(static_cast<swift::Int>(length));
    for (size_t i = 0; i < length; ++i) {
      jsi::Value elementValue = array.getValueAtIndex(runtime, i);
      result.append(JSIConverter<ElementType>::fromJSI(runtime, elementValue));
    }
    return result;
  }

  static inline jsi::Array toJSI(jsi::Runtime& runtime, const swift::Array<ElementType>& value)
    requires JSIEncodable<ElementType>
  {
    const size_t size = static_cast<size_t>(value.getCount());
    return createJSIArray(runtime, size,
                          [&](size_t i) { return JSIConverter<ElementType>::toJSI(runtime, value[static_cast<swift::Int>(i)]); });
  }

  static inline bool canConvert(jsi::Runtime& runtime, const jsi::Value& value)
    requires JSITypeCheckable<ElementType>
  {
    return canConvertJSIArray(runtime, value,
                              [&](const jsi::Value& element) { return JSIConverter<ElementType>::canConvert(runtime, element); });
  }
};

} // namespace margelo::nitro
