//
//  JPromise.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 14.07.24.
//

#pragma once

#include "JNIConverter+Error.hpp"
#include <NitroModules/Promise.hpp>
#include <exception>
#include <fbjni/fbjni.h>
#include <utility>

namespace margelo::nitro {

namespace jni = facebook::jni;

struct JOnResolvedCallback : public jni::JavaClass<JOnResolvedCallback> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/Promise$OnResolvedCallback;";
  void onResolved(const jni::alias_ref<jni::JObject>& result) const {
    static const auto method = javaClassLocal()->getMethod<void(jni::alias_ref<jni::JObject>)>("onResolved");
    method(self(), result);
  }
};

struct JOnRejectedCallback : public jni::JavaClass<JOnRejectedCallback> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/Promise$OnRejectedCallback;";
  void onRejected(const jni::alias_ref<jni::JThrowable>& error) const {
    static const auto method = javaClassLocal()->getMethod<void(jni::alias_ref<jni::JThrowable>)>("onRejected");
    method(self(), error);
  }
};

/**
 * JNI wrapper around the shared C++ Promise.
 * Calls and destruction require an attached calling thread.
 */
class JPromise final : public jni::HybridClass<JPromise> {
public:
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/Promise;";
  using ResultType = jni::global_ref<jni::JObject>;

private:
  /**
   * Create a new, still unresolved `JPromise` from Java.
   */
  static jni::local_ref<JPromise::jhybriddata> initHybrid(jni::alias_ref<jhybridobject>) {
    return makeCxxInstance();
  }

public:
  /**
   * Create a new, still unresolved `JPromise` from C++.
   */
  static jni::local_ref<JPromise::javaobject> create() {
    return newObjectCxxArgs();
  }

public:
  void resolve(jni::alias_ref<jni::JObject> result) {
    _promise.resolve(jni::make_global(result));
  }
  void reject(jni::alias_ref<jni::JThrowable> error) {
    _promise.reject(JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::fromJNI(error));
  }
  void reject(std::exception_ptr error) {
    _promise.reject(std::move(error));
  }

public:
  /** Borrow the shared state while this JNI owner is alive. Wiring listeners requires an attached thread. */
  const Promise<ResultType>& getPromise() const {
    return _promise;
  }

private:
  void rejectJava(jni::alias_ref<jni::JThrowable> error) {
    reject(error);
  }
  void addOnResolvedListenerJava(jni::alias_ref<JOnResolvedCallback> callback) {
    _promise.addOnResolvedListener([callback = jni::make_global(callback)](const ResultType& result) { callback->onResolved(result); });
  }
  void addOnRejectedListenerJava(jni::alias_ref<JOnRejectedCallback> callback) {
    _promise.addOnRejectedListener([callback = jni::make_global(callback)](const std::exception_ptr& error) {
      callback->onRejected(JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::toJNI(error));
    });
  }

private:
  JPromise() = default;

private:
  friend HybridBase;
  using HybridBase::HybridBase;
  Promise<ResultType> _promise = Promise<ResultType>::pending();

public:
  static void registerNatives() {
    registerHybrid({
        makeNativeMethod("initHybrid", JPromise::initHybrid),
        makeNativeMethod("nativeResolve", JPromise::resolve),
        makeNativeMethod("nativeReject", JPromise::rejectJava),
        makeNativeMethod("addOnResolvedListener", JPromise::addOnResolvedListenerJava),
        makeNativeMethod("addOnRejectedListener", JPromise::addOnRejectedListenerJava),
    });
  }
};

} // namespace margelo::nitro
