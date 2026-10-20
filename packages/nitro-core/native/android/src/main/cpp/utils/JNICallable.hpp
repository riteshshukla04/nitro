//
//  JNICallable.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 20.11.25.
//

#pragma once

#include <NitroModules/NitroDefines.hpp>
#include <fbjni/fbjni.h>
#include <memory>
#include <optional>

namespace margelo::nitro {

namespace jni = facebook::jni;

// Signature = R(Args...)
template <typename JFunc, typename Signature>
class JNICallable;

/**
 * A wrapper for any jni::JavaClass that implements `R invoke(Args...)` to
 * make it callable (e.g. conformable to `std::function<R(Args...)>`)
 * The `jni::global_ref` is safely deleted.
 */
template <typename JFunc, typename R, typename... Args>
class JNICallable<JFunc, R(Args...)> final {
public:
  using Signature = R(Args...);

  explicit JNICallable(jni::global_ref<JFunc>&& func) : _state(std::make_shared<State>(std::move(func))) {}

public:
  inline R operator()(Args... args) const {
    const auto state = _state;
    if constexpr (std::is_void_v<R>) {
      jni::ThreadScope::WithClassLoader([&] { state->func->invoke(std::forward<Args>(args)...); });
    } else {
      std::optional<R> result;
      jni::ThreadScope::WithClassLoader([&] { result.emplace(state->func->invoke(std::forward<Args>(args)...)); });
      return std::move(*result);
    }
  }

private:
  struct State {
    explicit State(jni::global_ref<JFunc>&& function) : func(std::move(function)) {}
    ~State() {
      jni::ThreadScope::WithClassLoader([&] { func.reset(); });
    }
    jni::global_ref<JFunc> func;
  };

  // Copies of Callback/std::function may be made on unattached native workers.
  // Share the global reference without calling NewGlobalRef for every copy.
  std::shared_ptr<State> _state;
};

} // namespace margelo::nitro
