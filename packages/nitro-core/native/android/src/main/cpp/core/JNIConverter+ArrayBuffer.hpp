#pragma once

#include "JArrayBuffer.hpp"
#include "JNIConverter.hpp"

namespace margelo::nitro {

template <typename T>
  requires std::same_as<jni::ReprType<T>, JArrayBuffer::JavaPart>
struct JNIConverter<ArrayBuffer, jni::local_ref<T>> {
  static jni::local_ref<T> toJNI(const ArrayBuffer& value) {
    return JArrayBuffer::wrap(value);
  }

  static ArrayBuffer fromJNI(jni::alias_ref<T> value) {
    return value->cthis()->getArrayBuffer();
  }
};

} // namespace margelo::nitro
