//
//  ByteBufferArrayBuffer.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 14.07.24.
//

#pragma once

#include <NitroModules/ArrayBuffer.hpp>
#include <fbjni/ByteBuffer.h>
#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;
namespace jsi = facebook::jsi;

/**
 * Represents an `ArrayBuffer` that holds a `ByteBuffer`.
 */
class ByteBufferArrayBuffer final : public jsi::MutableBuffer {
public:
  explicit ByteBufferArrayBuffer(const jni::alias_ref<jni::JByteBuffer>& byteBuffer)
      : _byteBuffer(jni::make_global(byteBuffer)), _data(byteBuffer->getDirectBytes()), _size(byteBuffer->getDirectSize()) {
    _byteBuffer->order(jni::JByteOrder::nativeOrder());
  }

  ~ByteBufferArrayBuffer() {
    // Hermes GC can destroy JS objects on a non-JNI Thread.
    jni::ThreadScope::WithClassLoader([&] { _byteBuffer.reset(); });
  }

public:
  [[nodiscard]] uint8_t* data() override {
    return _data;
  }
  [[nodiscard]] size_t size() const override {
    return _size;
  }

public:
  [[nodiscard]] const jni::global_ref<jni::JByteBuffer>& getBuffer() const {
    return _byteBuffer;
  }

private:
  jni::global_ref<jni::JByteBuffer> _byteBuffer;
  // Direct storage stays valid while _byteBuffer is retained. Read it without
  // JNI so owning ArrayBuffers can be used from unattached native workers.
  uint8_t* _data;
  size_t _size;
};

} // namespace margelo::nitro
