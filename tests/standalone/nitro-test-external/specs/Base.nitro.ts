import { iOS } from "nitro-core";
import type { HybridObject } from "nitro-core";

export * from "#nitro/Base";

@iOS({
  language: "swift",
  implementation: { className: "HybridBase" },
})
export declare class Base extends HybridObject {
  constructor();
  readonly baseValue: number;
}
