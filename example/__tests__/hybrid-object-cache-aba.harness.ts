import { describe, expect, it } from 'react-native-harness'
import { NitroModules } from 'react-native-nitro-modules'
import type { TestObjectCpp } from 'react-native-nitro-test'
import { createWorkletRuntime } from 'react-native-worklets'

// Regression test for the HybridObject::toObject() runtime-address-reuse (ABA) cache crash.
//
// `toObject` caches a `jsi::WeakObject` per `jsi::Runtime*`. Every worklet runtime below captures `obj` in
// its initializer, so Nitro's worklets serializer materializes it into that runtime -> `toObject(rt)`. Not
// retaining the runtime lets it be collected; the next iteration reuses its heap address. On reuse, the dead
// runtime's `JSICache` has invalidated the cached BorrowingReference, leaving a stale (null) entry keyed by
// the reused pointer, and `toObject` throws:
//
//   HybridObject "TestObjectCpp" was cached, but the reference got destroyed!
//
// (This is the exact HUMAND-KIOSK-E2 crash, driven the real way via react-native-worklets - no test seam.)

function forceGc(): void {
  const g = globalThis as unknown as { gc?: () => void }
  if (typeof g.gc === 'function') {
    g.gc()
    return
  }
  for (let i = 0; i < 8; i++) {
    void new Array(200_000).fill(0)
  }
}

describe('HybridObject toObject cache (runtime address-reuse / ABA)', () => {
  it('re-creates the object across churned worklet runtimes instead of throwing', () => {
    const obj = NitroModules.createHybridObject<TestObjectCpp>('TestObjectCpp')

    for (let i = 0; i < 50; i++) {
      createWorkletRuntime({
        name: `nitro-aba-${i}`,
        initializer: () => {
          'worklet'
          void obj.name
        },
      })
      forceGc()
    }

    expect(obj.name).toBeDefined()
  })
})
