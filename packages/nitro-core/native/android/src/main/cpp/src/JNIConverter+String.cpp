#include "JNIConverter+String.hpp"

namespace margelo::nitro {

jni::local_ref<jni::JString> JNIConverter<std::string, jni::local_ref<jni::JString>>::toJNI(const std::string& value) {
  // TODO: fbjni truncates embedded NULs: https://github.com/facebookincubator/fbjni/issues/126
  return jni::make_jstring(value);
}

std::string JNIConverter<std::string, jni::local_ref<jni::JString>>::fromJNI(jni::alias_ref<jni::JString> value) {
  return value->toStdString();
}

} // namespace margelo::nitro
