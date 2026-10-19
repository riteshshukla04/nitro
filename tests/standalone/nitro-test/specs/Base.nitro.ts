import { iOS } from "nitro-core";
import type { HybridObject } from "nitro-core";

export * from "#nitro/Base";

// This is a simple `HybridObject` with just one value.
@iOS({
  language: "swift",
  implementation: { className: "HybridBase" },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
export declare class Base extends HybridObject {
  constructor();
  readonly baseValue: number;
}
