---
name: nitro-jni
description:
  Apply Nitro v1's review decisions when editing Android JNI converters, reference ownership, or native callback and Promise bridges.
---

- Reuse the existing C++ `Promise` and its `JSIConverter` from JNI bridges. Keep JNI adaptation in Android code; do not extract or redesign
  shared C++ Promise conversion merely to serve Android.
- Use fbjni `alias_ref` for borrowed inputs, `local_ref` for owned local results, and `global_ref` for retained values. Do not add a
  parallel reference wrapper solely to attach during copying or destruction. Shared immutable owners are appropriate when callers need
  shared lifetime.
- JS and Java entry threads are attached. Attach native workers once at their execution boundary, covering execution and destruction of
  retained JNI values. Do not add a `ThreadScope` around each conversion or method call.
- Declare conversion temporaries inside the `try` block and consume them there. Avoid optional holders, early returns, or extra scopes used
  only to move a result past `catch`.
- Keep short, single-use listener implementations at their call site. Prefer existing converters to hand-written JSI host functions.
- Put concrete exception conversion in compiled Android `.cpp` files so Nitro owns the RTTI and exception compiler settings.
- Use fbjni's public string conversions for C++ STL interop. Keep direct JSI string conversion on `getStringData` and JNI UTF-16 APIs.
