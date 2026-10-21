---
name: nitro-nitrogen
description: Apply Nitro v1's review conventions when editing Nitrogen generators, type models, imports, or autolinking.
---

- Avoid nested ternaries and ternaries inside generated-code templates, including conditional whitespace or newlines. Select generated
  bodies outside templates: use a short ternary for simple literal alternatives, and explicit `if`/`else` or `switch` for longer or more
  complex choices.
- Always write generated code in multiline template literals with `.trim()`. Use actual line breaks, never `\n` escapes for layout;
  `.join('\n')` is the exception.
- Always use `indent(...)` for interpolated code, with matching indentation before `${...}` for its first line.
- Name generated bodies by direction, e.g. `swiftToCppConverterCode`, before passing them to helpers. Do not bury multiline strings in
  arguments or object properties.
- Use typed options objects destructured immediately in the parameter list for helpers receiving several code fragments or types, including
  native Swift and JSI conversion emitters.
- Extract mapping, filtering, sorting, deduplication, comparisons, and other nontrivial expressions into named variables before
  generated-code templates. Split long chains into multiple variables when it improves readability. Interpolate the results, leaving only
  final `.join(...)` and `indent(...)` calls inline. Shared renderers such as `getImportsCode()` can return complete strings.
- Prefer `switch (language)` over `if` chains, ternaries, or inline language-check returns so additional languages fit the same dispatch.
  Collect imports in a shared result and pass import context through nested wrappers.
- Avoid `??=` when it hides initialization.
- Use `getImportCode()` / `getImportsCode()` for import rendering and deduplication. Model declaration and implementation dependencies
  separately; do not repair them by comparing emitted strings or overriding descriptors at the caller.
- Collect module dependencies from specs and their type graph, including nested types and inheritance. Preserve ownership through wrapping;
  do not infer modules from include paths.
- Put type-specific policy on `Type`/`SwiftType` as overridable properties or methods, e.g. contextual `getCode()` and
  `requiresExplicitSwiftTarget`, rather than repeating `type.kind` checks in shared emitters.
- Keep Kotlin JNI ABI and JSI value representations in the type's printer. Callback and container consumers must not know how unsigned
  values are represented or boxed. Select primitive arrays directly in the array type's language branch.
- Reject unsupported Kotlin types when wrapping them; do not create placeholder types whose methods only throw later.
- Keep one class per file. Avoid generated forwarding specializations when a constrained runtime specialization can handle their metadata.
- Keep foreign projection requirements immutable on each type or generation plan. Scope caches to the TypeScript project and include the
  owning native namespace in type identities. Avoid mutable global generation state and reset functions.
- Validate supported language references when rendering the type. Keep nested containers subject to the same rules; use a concrete failing
  fixture before adding a separate traversal or workaround.
- Keep JSI conversion and native C++/Swift conversion in separate emitters so requesting one does not force generation of the other.
- Use declaration metadata for language, ownership, and converter policy. Do not infer those decisions from output paths or emitted-code
  strings.
- In a PR stack, run Nitrogen at each atomic PR and commit its affected generated files in that PR. Keep every PR buildable with its own
  generated output; do not defer regeneration to the end of the stack.
- Apply review fixes in the earliest PR that introduces the affected code, then carry them through the rest of the stack.
- When authorized to reply to reviews, explain the change made or the disagreement for each comment. Resolve a thread only after verifying
  that the pushed code addresses its concern; leave unaddressed concerns open.
- Accept incidental blank lines from empty include blocks. Avoid arbitrary gaps between related literal includes.

```ts
const code = `
function whatever() {
  ${indent(maybeMultiLine, '  ')}
}
`.trim()
```
