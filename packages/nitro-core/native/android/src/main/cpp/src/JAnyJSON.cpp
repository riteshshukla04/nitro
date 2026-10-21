#include "JAnyJSON.hpp"
#include "JNIConverter+AnyJSON.hpp"

namespace margelo::nitro {

jni::local_ref<JAnyJSON> JAnyJSON::create(const AnyJSON& value) {
  return JNIConverter<AnyJSON, jni::local_ref<JAnyJSON>>::toJNI(value);
}

AnyJSON JAnyJSON::toCpp() const {
  return JNIConverter<AnyJSON, jni::local_ref<JAnyJSON>>::fromJNI(self());
}

} // namespace margelo::nitro
