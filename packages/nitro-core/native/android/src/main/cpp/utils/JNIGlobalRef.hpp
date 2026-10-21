#pragma once

#include <fbjni/fbjni.h>

namespace margelo::nitro {

namespace jni = facebook::jni;

/** Deletes a global reference on any thread, without entering an application classloader. */
template <typename T>
void resetGlobalRef(jni::global_ref<T>& reference) {
  if (jni::detail::currentOrNull() != nullptr) {
    reference.reset();
  } else if (reference) {
    jni::ThreadScope scope;
    reference.reset();
  }
}

} // namespace margelo::nitro
