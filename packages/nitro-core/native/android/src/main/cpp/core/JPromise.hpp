//
//  JPromise.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 14.07.24.
//

#pragma once

#include <NitroModules/Promise.hpp>
#include <exception>
#include <fbjni/fbjni.h>
#include <functional>
#include <optional>
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
 * Calls require an attached calling thread. Destruction attaches as needed.
 */
class JPromise final : public jni::HybridClass<JPromise> {
public:
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/core/Promise;";
  using ResultType = jni::global_ref<jni::JObject>;
  using OnResolvedFunc = std::function<void(jni::alias_ref<jni::JObject>)>;
  using OnRejectedFunc = std::function<void(jni::alias_ref<jni::JThrowable>)>;

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
  ~JPromise() override {
    // Destroy stored JNI references and notify pending listeners while attached.
    jni::ThreadScope::WithClassLoader([&]() { _promise.reset(); });
  }

public:
  void resolve(jni::alias_ref<jni::JObject> result) {
    const auto promise = *_promise;
    promise.resolve(jni::make_global(result));
  }
  void reject(jni::alias_ref<jni::JThrowable> error) {
    const auto promise = *_promise;
    promise.reject(std::make_exception_ptr(jni::JniException(error)));
  }
  void reject(std::exception_ptr error) {
    const auto promise = *_promise;
    promise.reject(std::move(error));
  }

public:
  void addOnResolvedListener(OnResolvedFunc onResolved) {
    const auto promise = *_promise;
    promise.addOnResolvedListener([onResolved = std::move(onResolved)](const ResultType& result) { onResolved(result); });
  }
  void addOnRejectedListener(OnRejectedFunc onRejected) {
    const auto promise = *_promise;
    promise.addOnRejectedListener(
        [onRejected = std::move(onRejected)](const std::exception_ptr& error) { onRejected(getJavaException(error)); });
  }

private:
  void rejectJava(jni::alias_ref<jni::JThrowable> error) {
    reject(error);
  }
  void addOnResolvedListenerJava(jni::alias_ref<JOnResolvedCallback> callback) {
    addOnResolvedListener([callback = jni::make_global(callback)](auto result) { callback->onResolved(result); });
  }
  void addOnRejectedListenerJava(jni::alias_ref<JOnRejectedCallback> callback) {
    addOnRejectedListener([callback = jni::make_global(callback)](auto error) { callback->onRejected(error); });
  }

private:
  static jni::local_ref<jni::JThrowable> getJavaException(const std::exception_ptr& error) {
    try {
      std::rethrow_exception(error);
    } catch (const jni::JniException& exception) {
      // fbjni's generic conversion consumes JniException's throwable. Keep it for subsequent listeners.
      return exception.getThrowable();
    } catch (const std::nested_exception& exception) {
      // fbjni also consumes nested JniException causes. Preserve them when converting this shared error.
      const auto* nativeException = dynamic_cast<const std::exception*>(&exception);
      auto javaException = jni::JCppException::create(nativeException != nullptr ? nativeException->what() : "Nested C++ exception");
      if (const auto cause = exception.nested_ptr()) {
        javaException->initCause(getJavaException(cause));
      }
      return javaException;
    } catch (...) {
      return jni::getJavaExceptionForCppException(error);
    }
  }

private:
  JPromise() = default;

private:
  friend HybridBase;
  using HybridBase::HybridBase;
  std::optional<Promise<ResultType>> _promise = Promise<ResultType>::pending();

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
