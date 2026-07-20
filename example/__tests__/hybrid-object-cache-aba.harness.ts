import { describe, expect, it } from 'react-native-harness'
import { NitroModules } from 'react-native-nitro-modules'
import type { TestObjectCpp } from 'react-native-nitro-test'

// Regression test for the HybridObject::toObject() runtime-address-reuse (ABA) cache bug.
//
// `toObject` caches a `jsi::WeakObject` per `jsi::Runtime*`. When a runtime is destroyed and a new one is
// created at the same heap address (e.g. worklet runtimes churned by react-native-vision-camera), the dead
// runtime's `JSICache` invalidated the cached BorrowingReference, leaving a stale (null) entry keyed by the
// reused pointer. Materializing the same HybridObject then threw:
//
//   HybridObject "..." was cached, but the reference got destroyed!
//
// `reproToObjectCacheAba` is a debug-only raw method on TestObjectCpp that reproduces exactly that
// post-condition deterministically (it nulls the current runtime's cache entry, then re-runs `toObject`),
// so this is testable in the harness without a second runtime.

type WithRepro = TestObjectCpp & { reproToObjectCacheAba(): TestObjectCpp }

describe('HybridObject toObject cache (runtime address-reuse / ABA)', () => {
  it('re-creates the JS object instead of throwing when the cached reference is dead', () => {
    const obj = NitroModules.createHybridObject<TestObjectCpp>(
      'TestObjectCpp'
    ) as WithRepro

    // Before the fix this throws "...reference got destroyed!". After the fix it returns a fresh JS object.
    const recreated = obj.reproToObjectCacheAba()

    expect(recreated).toBeDefined()
    // The re-created object is functional and wraps the same underlying native HybridObject.
    expect(recreated.equals(obj)).toBe(true)
  })
})
