#pragma once

#include <NitroModules/Callback.hpp>
#include <NitroModules/InlineCallback.hpp>
#include <NitroModules/Promise.hpp>
#include <optional>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <variant>
#include <vector>

namespace margelo::nitro {

namespace jsi = facebook::jsi;

/** Converts public C++ API values to the C++ types used inside Kotlin's private bridge. */
template <typename Cpp, typename Kotlin>
struct JNIConverter {
  static_assert(std::is_same_v<Cpp, Kotlin>, "This C++/Kotlin type pair needs a native converter.");
  static const Kotlin& toKotlin(const Cpp& value) {
    return value;
  }
  static const Cpp& fromKotlin(const Kotlin& value) {
    return value;
  }
};

template <>
struct JNIConverter<void, void> {};

template <typename CppValue, typename KotlinValue>
struct JNIConverter<std::vector<CppValue>, std::vector<KotlinValue>> {
  using Cpp = std::vector<CppValue>;
  using Kotlin = std::vector<KotlinValue>;
  static decltype(auto) toKotlin(const Cpp& values) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (values);
    } else {
      Kotlin result;
      result.reserve(values.size());
      for (const auto& value : values)
        result.push_back(JNIConverter<CppValue, KotlinValue>::toKotlin(value));
      return result;
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& values) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (values);
    } else {
      Cpp result;
      result.reserve(values.size());
      for (const auto& value : values)
        result.push_back(JNIConverter<CppValue, KotlinValue>::fromKotlin(value));
      return result;
    }
  }
};

template <typename CppValue, typename KotlinValue>
struct JNIConverter<std::optional<CppValue>, std::optional<KotlinValue>> {
  using Cpp = std::optional<CppValue>;
  using Kotlin = std::optional<KotlinValue>;
  static decltype(auto) toKotlin(const Cpp& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      if (!value)
        return Kotlin(std::nullopt);
      return Kotlin(JNIConverter<CppValue, KotlinValue>::toKotlin(*value));
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      if (!value)
        return Cpp(std::nullopt);
      return Cpp(JNIConverter<CppValue, KotlinValue>::fromKotlin(*value));
    }
  }
};

template <typename CppKey, typename CppValue, typename KotlinKey, typename KotlinValue>
struct JNIConverter<std::unordered_map<CppKey, CppValue>, std::unordered_map<KotlinKey, KotlinValue>> {
  using Cpp = std::unordered_map<CppKey, CppValue>;
  using Kotlin = std::unordered_map<KotlinKey, KotlinValue>;
  static decltype(auto) toKotlin(const Cpp& values) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (values);
    } else {
      Kotlin result;
      result.reserve(values.size());
      for (const auto& [key, value] : values)
        result.emplace(JNIConverter<CppKey, KotlinKey>::toKotlin(key), JNIConverter<CppValue, KotlinValue>::toKotlin(value));
      return result;
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& values) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (values);
    } else {
      Cpp result;
      result.reserve(values.size());
      for (const auto& [key, value] : values)
        result.emplace(JNIConverter<CppKey, KotlinKey>::fromKotlin(key), JNIConverter<CppValue, KotlinValue>::fromKotlin(value));
      return result;
    }
  }
};

template <typename... CppValues, typename... KotlinValues>
struct JNIConverter<std::tuple<CppValues...>, std::tuple<KotlinValues...>> {
  using Cpp = std::tuple<CppValues...>;
  using Kotlin = std::tuple<KotlinValues...>;
  static_assert(sizeof...(CppValues) == sizeof...(KotlinValues));
  static decltype(auto) toKotlin(const Cpp& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      return toKotlin(value, std::index_sequence_for<CppValues...>{});
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      return fromKotlin(value, std::index_sequence_for<CppValues...>{});
    }
  }

private:
  template <size_t... Index>
  static Kotlin toKotlin(const Cpp& value, std::index_sequence<Index...>) {
    return Kotlin(JNIConverter<CppValues, KotlinValues>::toKotlin(std::get<Index>(value))...);
  }
  template <size_t... Index>
  static Cpp fromKotlin(const Kotlin& value, std::index_sequence<Index...>) {
    return Cpp(JNIConverter<CppValues, KotlinValues>::fromKotlin(std::get<Index>(value))...);
  }
};

template <typename... CppValues, typename... KotlinValues>
struct JNIConverter<std::variant<CppValues...>, std::variant<KotlinValues...>> {
  using Cpp = std::variant<CppValues...>;
  using Kotlin = std::variant<KotlinValues...>;
  static_assert(sizeof...(CppValues) == sizeof...(KotlinValues));
  static decltype(auto) toKotlin(const Cpp& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      return toKotlin<0>(value);
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else {
      return fromKotlin<0>(value);
    }
  }

private:
  template <size_t Index>
  static Kotlin toKotlin(const Cpp& value) {
    if constexpr (Index == sizeof...(CppValues)) {
      throw std::bad_variant_access();
    } else {
      using Converter = JNIConverter<std::variant_alternative_t<Index, Cpp>, std::variant_alternative_t<Index, Kotlin>>;
      if (value.index() == Index)
        return Kotlin(std::in_place_index<Index>, Converter::toKotlin(std::get<Index>(value)));
      return toKotlin<Index + 1>(value);
    }
  }
  template <size_t Index>
  static Cpp fromKotlin(const Kotlin& value) {
    if constexpr (Index == sizeof...(KotlinValues)) {
      throw std::bad_variant_access();
    } else {
      using Converter = JNIConverter<std::variant_alternative_t<Index, Cpp>, std::variant_alternative_t<Index, Kotlin>>;
      if (value.index() == Index)
        return Cpp(std::in_place_index<Index>, Converter::fromKotlin(std::get<Index>(value)));
      return fromKotlin<Index + 1>(value);
    }
  }
};

template <typename Cpp, typename Kotlin>
struct JNIConverter<Promise<Cpp>, Promise<Kotlin>> {
  static Promise<Kotlin> toKotlin(const Promise<Cpp>& value) {
    return convert<Promise<Kotlin>>(value, [](const Cpp& item) { return JNIConverter<Cpp, Kotlin>::toKotlin(item); });
  }
  static Promise<Cpp> fromKotlin(const Promise<Kotlin>& value) {
    return convert<Promise<Cpp>>(value, [](const Kotlin& item) { return JNIConverter<Cpp, Kotlin>::fromKotlin(item); });
  }

private:
  template <typename Output, typename Input, typename Convert>
  static Output convert(const Input& input, Convert convertValue) {
    if constexpr (std::is_same_v<Output, Input>) {
      return input;
    } else {
      auto result = Output::pending();
      input.addOnResolvedListener([result, convertValue](const auto& value) {
        std::optional<std::decay_t<decltype(convertValue(value))>> converted;
        try {
          converted.emplace(convertValue(value));
        } catch (...) {
          result.reject(std::current_exception());
          return;
        }
        result.resolve(std::move(*converted));
      });
      input.addOnRejectedListener([result](const std::exception_ptr& error) { result.reject(std::exception_ptr(error)); });
      return result;
    }
  }
};

template <>
struct JNIConverter<Promise<void>, Promise<void>> {
  static const Promise<void>& toKotlin(const Promise<void>& value) {
    return value;
  }
  static const Promise<void>& fromKotlin(const Promise<void>& value) {
    return value;
  }
};

template <typename CppCallback, typename KotlinCallback>
struct JNICallbackConverter;

template <typename R, typename... Args, typename KotlinResult, typename... KotlinArgs>
struct JNICallbackConverter<Callback<R(Args...)>, Callback<KotlinResult(KotlinArgs...)>> {
  using Cpp = Callback<R(Args...)>;
  using Kotlin = Callback<KotlinResult(KotlinArgs...)>;
  static Cpp fromKotlin(const Kotlin& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return value;
    } else if (auto* native = std::get_if<typename Kotlin::NativeCallback>(&value._impl)) {
      return Cpp::make([callback = *native](Args... args) -> R {
        if constexpr (std::is_void_v<R>) {
          callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::toKotlin(args)...);
        } else {
          return JNIConverter<R, KotlinResult>::fromKotlin(
              callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::toKotlin(args)...));
        }
      });
    } else {
      const auto& callback = std::get<typename Kotlin::JSCallback>(value._impl);
      return Cpp(typename Cpp::JSCallback(callback._runtime, BorrowingReference(callback._function), callback._dispatcher));
    }
  }
  static Kotlin toKotlin(const Cpp& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return value;
    } else if (auto* native = std::get_if<typename Cpp::NativeCallback>(&value._impl)) {
      return Kotlin::make([callback = *native](KotlinArgs... args) -> KotlinResult {
        if constexpr (std::is_void_v<KotlinResult>) {
          callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::fromKotlin(args)...);
        } else {
          return JNIConverter<R, KotlinResult>::toKotlin(
              callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::fromKotlin(args)...));
        }
      });
    } else {
      const auto& callback = std::get<typename Cpp::JSCallback>(value._impl);
      return Kotlin(typename Kotlin::JSCallback(callback._runtime, BorrowingReference(callback._function), callback._dispatcher));
    }
  }
};

template <typename R, typename... Args, typename KotlinResult, typename... KotlinArgs>
struct JNICallbackConverter<InlineCallback<R(Args...)>, InlineCallback<KotlinResult(KotlinArgs...)>> {
  using Cpp = InlineCallback<R(Args...)>;
  using Kotlin = InlineCallback<KotlinResult(KotlinArgs...)>;
  static decltype(auto) toKotlin(const Cpp& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else if (auto* native = std::get_if<typename Cpp::NativeCallback>(&value._impl)) {
      return Kotlin::make([callback = *native](KotlinArgs... args) -> KotlinResult {
        if constexpr (std::is_void_v<KotlinResult>) {
          callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::fromKotlin(args)...);
        } else {
          return JNIConverter<R, KotlinResult>::toKotlin(
              callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::fromKotlin(args)...));
        }
      });
    } else {
      const auto& callback = std::get<typename Cpp::JSCallback>(value._impl);
      jsi::Runtime& runtime = callback._runtime;
      jsi::Function function = jsi::Value(runtime, callback._function).getObject(runtime).getFunction(runtime);
      return Kotlin::make(runtime, std::move(function));
    }
  }
  static decltype(auto) fromKotlin(const Kotlin& value) {
    if constexpr (std::is_same_v<Cpp, Kotlin>) {
      return (value);
    } else if (auto* native = std::get_if<typename Kotlin::NativeCallback>(&value._impl)) {
      return Cpp::make([callback = *native](Args... args) -> R {
        if constexpr (std::is_void_v<R>) {
          callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::toKotlin(args)...);
        } else {
          return JNIConverter<R, KotlinResult>::fromKotlin(
              callback(JNIConverter<std::remove_cvref_t<Args>, std::remove_cvref_t<KotlinArgs>>::toKotlin(args)...));
        }
      });
    } else {
      const auto& callback = std::get<typename Kotlin::JSCallback>(value._impl);
      jsi::Runtime& runtime = callback._runtime;
      jsi::Function function = jsi::Value(runtime, callback._function).getObject(runtime).getFunction(runtime);
      return Cpp::make(runtime, std::move(function));
    }
  }
};

template <typename R, typename... Args, typename KotlinResult, typename... KotlinArgs>
struct JNIConverter<Callback<R(Args...)>, Callback<KotlinResult(KotlinArgs...)>>
    : JNICallbackConverter<Callback<R(Args...)>, Callback<KotlinResult(KotlinArgs...)>> {};

template <typename R, typename... Args, typename KotlinResult, typename... KotlinArgs>
struct JNIConverter<InlineCallback<R(Args...)>, InlineCallback<KotlinResult(KotlinArgs...)>>
    : JNICallbackConverter<InlineCallback<R(Args...)>, InlineCallback<KotlinResult(KotlinArgs...)>> {};

} // namespace margelo::nitro
