#include "JSIConverter+JString.hpp"
#include <vector>

namespace margelo::nitro {

namespace {
  jni::local_ref<jni::JString> createString(const jchar* data, jsize length) {
    // Keep the empty string distinct from a null Java reference.
    static constexpr jchar empty = 0;
    jstring result = jni::Environment::current()->NewString(length == 0 ? &empty : data, length);
    if (result == nullptr) [[unlikely]] {
      FACEBOOK_JNI_THROW_EXCEPTION_IF(true);
    }
    return jni::adopt_local(result);
  }

  class StringCharacters final {
  public:
    explicit StringCharacters(jni::alias_ref<jni::JString> string)
        : _env(jni::Environment::current()), _string(string.get()), _length(_env->GetStringLength(_string)),
          _characters(_env->GetStringChars(_string, nullptr)) {
      if (_characters == nullptr) [[unlikely]] {
        FACEBOOK_JNI_THROW_EXCEPTION_IF(true);
      }
    }
    ~StringCharacters() {
      _env->ReleaseStringChars(_string, _characters);
    }
    StringCharacters(const StringCharacters&) = delete;
    StringCharacters& operator=(const StringCharacters&) = delete;

    const char16_t* data() const {
      return reinterpret_cast<const char16_t*>(_characters);
    }
    size_t size() const {
      return static_cast<size_t>(_length);
    }

  private:
    JNIEnv* _env;
    jstring _string;
    jsize _length;
    const jchar* _characters;
  };
} // namespace

jni::local_ref<jni::JString> JSIConverter<jni::local_ref<jni::JString>>::fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
  return fromJSI(runtime, value.asString(runtime));
}

jni::local_ref<jni::JString> JSIConverter<jni::local_ref<jni::JString>>::fromJSI(jsi::Runtime& runtime, const jsi::String& value) {
  const size_t length = value.length(runtime);
  if (length == 0) {
    return createString(nullptr, 0);
  }

  jni::local_ref<jni::JString> result;
  std::vector<jchar> characters;
  auto append = [&](bool ascii, const void* data, size_t count) {
    if (count == 0) {
      return;
    }
    if (!ascii && count == length) {
      // A contiguous UTF-16 string can be copied straight into the JVM.
      result = createString(static_cast<const jchar*>(data), static_cast<jsize>(count));
      return;
    }
    if (characters.empty()) {
      characters.reserve(length);
    }
    if (ascii) {
      const auto* bytes = static_cast<const uint8_t*>(data);
      characters.insert(characters.end(), bytes, bytes + count);
    } else {
      const auto* units = static_cast<const jchar*>(data);
      characters.insert(characters.end(), units, units + count);
    }
  };
  // Copy code units unchanged, including surrogate pairs split across ropes.
  value.getStringData(runtime, append);
  if (result) {
    return result;
  }
  return createString(characters.data(), static_cast<jsize>(characters.size()));
}

jsi::String JSIConverter<jni::local_ref<jni::JString>>::toJSI(jsi::Runtime& runtime, jni::alias_ref<jni::JString> value) {
  // GetStringChars allows allocation while borrowed; GetStringCritical does not.
  const StringCharacters characters(value);
  return jsi::String::createFromUtf16(runtime, characters.data(), characters.size());
}

} // namespace margelo::nitro
