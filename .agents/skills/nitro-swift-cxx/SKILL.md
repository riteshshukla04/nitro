---
name: nitro-swift-cxx
description: Apply Nitro v1's review decisions when editing native Swift converters, generated bridges, or Swift import visibility.
---

- Generated calls always use `SwiftConverter<CppType, SwiftType>`. `SwiftType.requiresExplicitSwiftTarget` controls specialization
  declarations only; preserve default mappings for handwritten C++.
- For Array/Optional, implement the explicit specialization directly and delegate the default specialization to it. Use `CppElementType` /
  `SwiftElementType`; explain default-selection convenience consistently across equivalent specializations.
- Adapt callback signatures through the existing private native/JS alternatives and converter friendship. Do not add `AdaptedCallback` state
  just to record adaptation.
- Preserve umbrella ordering: C++ prerequisites, dependency module umbrellas, local generated Swift definitions, then converters.
  Swift-facing public headers must not include their own `-Swift.h` or the private implementation umbrella.
- Foreign HybridObject converters come from their owning module. Shared runtime converters belong in the `NitroModulesSwiftBridge` target
  (`packages/nitro-core/native/apple/swift-bridge`). Generated module converters belong in that module's `<Module>SwiftBridge` target.
- Collect Swift imports from both API types and wrapped types. Use `getSwiftImports()` and `getImportsCode()` for access levels and
  promotion; avoid blanket `@usableFromInline` fixes.
- Optional dictionary cursor slots support types without default initializers. Do not lose that support for simpler iteration; Swift
  `.get()` can create owned values with allocation or retain/release costs.
- In a PR stack, regenerate and commit affected bridge files in each atomic PR alongside its source changes. Keep each PR buildable; do not
  collect generated output in a final PR.
- Inside `margelo::nitro` and its nested namespaces, use Nitro types directly, including `HybridObject`, `Promise`, `SwiftConverter`, and
  `JSIConverter`. Outside those namespaces, qualify Nitro names where needed. Keep `jsi::` for JSI symbols and declare aliases explicitly;
  do not rely on `using namespace` declarations in runtime headers.
