#include "JAnyMap.hpp"
#include "JAnyValue.hpp"
#include "JArrayBuffer.hpp"
#include "JHardwareBufferUtils.hpp"
#include "JHybridObject.hpp"
#include "JNativeRunnable.hpp"
#include "JPromise.hpp"
#include <fbjni/fbjni.h>
#include <jni.h>

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    using namespace margelo::nitro;
    JArrayBuffer::registerNatives();
    JAnyMap::registerNatives();
    JAnyValue::registerNatives();
    JHardwareBufferUtils::registerNatives();
    JPromise::registerNatives();
    JNativeRunnable::registerNatives();
    JHybridObject::CxxPart::registerNatives();
  });
}
