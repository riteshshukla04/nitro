#pragma once

#include <type_traits>

namespace margelo::nitro {

/** Converts an explicit native C++/JNI type pair. Specializations compose at native boundaries. */
template <typename Cpp, typename JNI>
struct JNIConverter {
  static_assert(std::is_same_v<Cpp, JNI>, "This C++/JNI type pair needs a native converter.");

  static const JNI& toJNI(const Cpp& value) {
    return value;
  }

  static const Cpp& fromJNI(const JNI& value) {
    return value;
  }
};

template <>
struct JNIConverter<void, void> {};

} // namespace margelo::nitro
