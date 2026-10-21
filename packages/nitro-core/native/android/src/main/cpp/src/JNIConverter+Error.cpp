#include "JNIConverter+Error.hpp"
#include <stdexcept>

namespace margelo::nitro {

jni::local_ref<jni::JThrowable> JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::toJNI(const std::exception_ptr& error) {
  if (!error) [[unlikely]] {
    throw std::runtime_error("Cannot convert a null exception_ptr to a Java Throwable.");
  }
  try {
    std::rethrow_exception(error);
  } catch (const jni::JniException& exception) {
    // fbjni's generic conversion consumes the throwable. Preserve it for subsequent conversions.
    return exception.getThrowable();
  } catch (const std::nested_exception& exception) {
    // fbjni also consumes nested JniException causes when converting a shared error.
    const auto* nativeException = dynamic_cast<const std::exception*>(&exception);
    auto javaException = jni::JCppException::create(nativeException != nullptr ? nativeException->what() : "Nested C++ exception");
    if (const auto cause = exception.nested_ptr()) {
      javaException->initCause(toJNI(cause));
    }
    return javaException;
  } catch (...) {
    return jni::getJavaExceptionForCppException(error);
  }
}

std::exception_ptr JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::fromJNI(jni::alias_ref<jni::JThrowable> error) {
  return std::make_exception_ptr(jni::JniException(error));
}

} // namespace margelo::nitro
