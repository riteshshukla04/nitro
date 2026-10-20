---
name: nitro-typescript
description: Apply Nitro v1's typing rules when writing or reviewing TypeScript and TSX, including Nitrogen and generated TypeScript.
---

- Never use `as Type` or angle-bracket type assertions. `as const` is allowed.
- Define values and APIs so the compiler checks their types from the start. Type annotations (`const value: Type = { ... }`) and `satisfies`
  (`const value = { ... } satisfies Type`) are equally acceptable. Contextual typing from function parameters or return types, generics, and
  other typing mechanisms are also valid. Choose whichever fits; `satisfies` is optional.
- Always spell out object property assignments, e.g. `{ spec: spec }` rather than `{ spec }`. This applies to object literals, not
  destructuring.
- Never use `any`, explicitly or implicitly. Use concrete types or generics for known values and `unknown` for data that has not been
  validated.
- When parsing unknown data, validate it with `zod` or an equivalent runtime schema validator and derive the type from the schema.
  `satisfies` does not validate runtime data.
- Never use non-null assertions (`value!`) or definite-assignment assertions (`field!: Type`). Model optional values and initialization
  accurately, and narrow or handle missing values explicitly.
- Prefer an explicit local `if`/`throw` for simple preconditions instead of an assertion helper that hides the condition.
- Use `.map`, `for (const value of values)`, or `.forEach` to work with elements directly. When an index is also needed, use `.entries()` or
  the callback's index parameter. Avoid index-based loops that require unchecked element lookups; when a lookup is necessary, check and
  handle a missing result.
- Prefer a short ternary when both alternatives are simple literals, e.g. `const access = isFinal ? 'public final' : 'open'`. For longer or
  more complex choices, declare `let value: Type` without an initializer and assign it in explicit `if`/`else` branches. Do not initialize a
  fallback only to overwrite it in one branch. This applies to selecting alternatives, not accumulating or transforming a value.
- Assign awaited values to named variables before passing them into another call or interpolating them into generated code.
