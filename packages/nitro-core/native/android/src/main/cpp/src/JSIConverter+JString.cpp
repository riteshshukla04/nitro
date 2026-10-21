#include "JSIConverter+JString.hpp"
#include <algorithm>
#include <array>
#include <memory>

namespace margelo::nitro {

namespace {
  constexpr size_t stackCapacity = 256;

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
    StringCharacters(JNIEnv* env, jni::alias_ref<jni::JString> string)
        : _env(env), _string(string.get()), _characters(_env->GetStringChars(_string, nullptr)) {
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

  private:
    JNIEnv* _env;
    jstring _string;
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
  std::array<jchar, stackCapacity> stack;
  std::unique_ptr<jchar[]> heap;
  size_t offset = 0;
  auto append = [&](bool ascii, const void* data, size_t count) {
    if (count == 0) {
      return;
    }
    if (!ascii && count == length) {
      // A contiguous UTF-16 string can be copied straight into the JVM.
      result = createString(static_cast<const jchar*>(data), static_cast<jsize>(count));
      return;
    }
    jchar* characters;
    if (length <= stackCapacity) {
      characters = stack.data();
    } else {
      if (!heap) {
        heap = std::make_unique_for_overwrite<jchar[]>(length);
      }
      characters = heap.get();
    }
    if (ascii) {
      std::copy_n(static_cast<const uint8_t*>(data), count, characters + offset);
    } else {
      std::copy_n(static_cast<const jchar*>(data), count, characters + offset);
    }
    offset += count;
  };
  // Copy code units unchanged, including surrogate pairs split across ropes.
  value.getStringData(runtime, append);
  if (result) {
    return result;
  }
  return createString(length <= stackCapacity ? stack.data() : heap.get(), static_cast<jsize>(length));
}

jsi::String JSIConverter<jni::local_ref<jni::JString>>::toJSI(jsi::Runtime& runtime, jni::alias_ref<jni::JString> value) {
  JNIEnv* env = jni::Environment::current();
  const jsize length = env->GetStringLength(value.get());
  if (length == 0) {
    return jsi::String::createFromAscii(runtime, "", 0);
  }
  if (static_cast<size_t>(length) <= stackCapacity) {
    // Region copying avoids ART's temporary allocation and ReleaseStringChars for short strings.
    std::array<jchar, stackCapacity> characters;
    env->GetStringRegion(value.get(), 0, length, characters.data());
    return jsi::String::createFromUtf16(runtime, reinterpret_cast<const char16_t*>(characters.data()), length);
  }
  // GetStringChars allows allocation while borrowed; GetStringCritical does not.
  const StringCharacters characters(env, value);
  return jsi::String::createFromUtf16(runtime, characters.data(), length);
}

} // namespace margelo::nitro
