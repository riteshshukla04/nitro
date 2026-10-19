# $$packageName$$

This Nitro V1 starter includes an `Example` class and its Swift implementation.

Install dependencies, then run `npm run specs` to generate native bindings and compile TypeScript. Nitrogen runs first because the spec re-exports its generated JavaScript class through `#nitro/Example`.

```ts
import { Example } from '$$packageName$$'

const example = new Example()
console.log(example.add(2, 3)) // 5
console.log(example instanceof Example) // true
```

The package pins Nitro and Nitrogen to the exact alpha version that created it. Keep those versions in sync when upgrading.

- `src/specs/Example.nitro.ts` declares the constructor, methods and Swift implementation through `@iOS`.
- `ios/HybridExample.swift` implements the generated `HybridExampleSpec`.
- `nitro.json` sets native module names and namespaces.
- `nitrogen/generated` contains native bindings and the lazy JavaScript class exports. Commit it and include it in the published package.
- `package.json` maps `#nitro/*` to the generated `.cjs` modules. Keep that mapping available to the compiled files as well as the source specs.

The V1 native build integration is still in progress. The CocoaPods and Android build files currently refer to autolinking files from the previous generator. They need the V1 native build wiring before this example can run in an app. The Swift implementation is included; Android has no implementation yet.
