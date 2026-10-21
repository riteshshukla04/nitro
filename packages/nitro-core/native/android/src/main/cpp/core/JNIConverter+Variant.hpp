#pragma once

#include "JNIConverter.hpp"
#include <fbjni/fbjni.h>
#include <tuple>
#include <variant>

namespace margelo::nitro {

namespace jni = facebook::jni;

template <typename... CppCases, typename JavaVariant>
  requires requires { typename JavaVariant::Cases; }
struct JNIConverter<std::variant<CppCases...>, jni::local_ref<JavaVariant>> {
  using Cpp = std::variant<CppCases...>;
  static_assert(sizeof...(CppCases) == std::tuple_size_v<typename JavaVariant::Cases>);

  static jni::local_ref<JavaVariant> toJNI(const Cpp& value) {
    return encode<0>(value);
  }

  static Cpp fromJNI(jni::alias_ref<JavaVariant> value) {
    return decode<0>(value, value->getIndex());
  }

private:
  template <size_t Index>
  using Case = std::tuple_element_t<Index, typename JavaVariant::Cases>;

  template <size_t Index>
  using Converter = JNIConverter<std::variant_alternative_t<Index, Cpp>, typename Case<Index>::Value>;

  template <size_t Index>
  static jni::local_ref<JavaVariant> encode(const Cpp& value) {
    if constexpr (Index == sizeof...(CppCases)) {
      throw std::bad_variant_access();
    } else {
      if (value.index() == Index) {
        return Case<Index>::create(Converter<Index>::toJNI(std::get<Index>(value)));
      }
      return encode<Index + 1>(value);
    }
  }

  template <size_t Index>
  static Cpp decode(jni::alias_ref<JavaVariant> value, size_t index) {
    if constexpr (Index == sizeof...(CppCases)) {
      throw std::invalid_argument("Invalid Kotlin variant index.");
    } else {
      if (index == Index) {
        auto payload = jni::static_ref_cast<Case<Index>>(value)->getValue();
        return Cpp(std::in_place_index<Index>, Converter<Index>::fromJNI(payload));
      }
      return decode<Index + 1>(value, index);
    }
  }
};

} // namespace margelo::nitro
