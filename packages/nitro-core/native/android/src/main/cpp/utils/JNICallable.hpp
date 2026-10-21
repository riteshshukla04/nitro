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

namespace margelo::nitro {

namespace jni = facebook::jni;

// Signature = R(Args...)
template <typename JFunc, typename Signature>
class JNICallable;

/**
 * A wrapper for any jni::JavaClass that implements `R invoke(Args...)` to
 * make it callable (e.g. conformable to `std::function<R(Args...)>`)
 * Calls and final reference release require an attached thread.
 */
template <typename JFunc, typename R, typename... Args>
class JNICallable<JFunc, R(Args...)> final {
public:
  using Signature = R(Args...);

  explicit JNICallable(jni::global_ref<JFunc>&& func) : _func(std::make_shared<jni::global_ref<JFunc>>(std::move(func))) {}

public:
  inline R operator()(Args... args) const {
    // Invocation can reentrantly release this callable's owner.
    const auto func = _func;
    return (*func)->invoke(std::forward<Args>(args)...);
  }

private:
  std::shared_ptr<jni::global_ref<JFunc>> _func;
};

} // namespace margelo::nitro
