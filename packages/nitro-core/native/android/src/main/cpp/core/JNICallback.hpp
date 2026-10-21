#pragma once

#include "JNICallable.hpp"
#include "JNIConverter+GlobalRef.hpp"
#include "JNIConverter+Primitives.hpp"
#include "JSIConverter+JNIGlobalRef.hpp"
#include <NitroModules/Callback.hpp>
#include <NitroModules/InlineCallback.hpp>

namespace margelo::nitro {

/** JNI values retained by an escapable callback; primitives need no reference.
 */
template <typename T>
struct JNIRetainedValue {
  using Type = T;
  using Borrowed = T;
  using Local = T;
  static Type retain(T value) {
    return value;
  }
  static T borrow(T value) {
    return value;
  }
  static T toLocal(T value) {
    return value;
  }
};

template <typename T>
struct JNIRetainedValue<jni::local_ref<T>> {
  using Type = jni::global_ref<T>;
  using Borrowed = jni::alias_ref<T>;
  using Local = jni::local_ref<T>;
  static Type retain(Borrowed value) {
    return jni::make_global(value);
  }
  static Borrowed borrow(const Type& value) {
    return value;
  }
  static jni::local_ref<T> toLocal(const Type& value) {
    return jni::make_local(value);
  }
};

template <>
struct JNIRetainedValue<void> {
  using Type = void;
  using Local = void;
};

// JNI carries unsigned Long bits in a signed jlong.
template <>
struct JNIRetainedValue<uint64_t> {
  using Type = uint64_t;
  using Borrowed = jlong;
  using Local = jlong;
  static Type retain(jlong value) {
    return JNIConverter<uint64_t, jlong>::fromJNI(value);
  }
  static jlong borrow(Type value) {
    return JNIConverter<uint64_t, jlong>::toJNI(value);
  }
  static jlong toLocal(Type value) {
    return borrow(value);
  }
};

template <typename Signature>
class JNICallbackState;

/** A Kotlin callback keeps Nitro's existing native/JS callback state. */
template <typename R, typename... Args>
class JNICallbackState<R(Args...)> final {
public:
  using Signature = typename JNIRetainedValue<R>::Type(typename JNIRetainedValue<Args>::Type...);
  using CallbackType = Callback<Signature>;

  explicit JNICallbackState(CallbackType callback, bool isInline) : _callback(std::move(callback)), _isInline(isInline) {}

  typename JNIRetainedValue<R>::Local invoke(typename JNIRetainedValue<Args>::Borrowed... args) const {
    // Invocation can reentrantly release this callback's HybridData.
    const auto callback = _callback;
    const bool isInline = _isInline;
    if constexpr (std::is_void_v<R>) {
      if (isInline) {
        callback.callSync(JNIRetainedValue<Args>::retain(args)...);
      } else {
        callback.callAndForget(JNIRetainedValue<Args>::retain(args)...);
      }
    } else {
      return JNIRetainedValue<R>::toLocal(callback.callSync(JNIRetainedValue<Args>::retain(args)...));
    }
  }

  const CallbackType& getCallback() const {
    return _callback;
  }

private:
  CallbackType _callback;
  bool _isInline;
};

/** Obtain the existing native callback or retain a Kotlin implementation. */
template <typename JavaCallback>
Callback<typename JavaCallback::NativeSignature> getJNICallback(jni::alias_ref<JavaCallback> value) {
  using CxxPart = typename JavaCallback::CxxPart;
  using NativeSignature = typename JavaCallback::NativeSignature;
  using NativeCallback = Callback<NativeSignature>;
  if (value->isInstanceOf(CxxPart::javaClassStatic())) {
    auto native = jni::static_ref_cast<typename CxxPart::javaobject>(value);
    return native->cthis()->getCallback();
  }
  return NativeCallback::make(JNICallable<JavaCallback, NativeSignature>(jni::make_global(value)));
}

} // namespace margelo::nitro
