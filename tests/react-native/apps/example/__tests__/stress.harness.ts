import { expect, it } from 'react-native-harness'
import { NitroModules } from 'react-native-nitro-modules'
import { describeEachTestObject } from './utils/testObjects'

// Keep this workload in its own file because a timed-out test skips every
// remaining test in the same file.
describeEachTestObject('Promises under parallel load', (testObject) => {
  // Resolve HybridObjects off the JS thread while JSIConverter::toJSI reads
  // Promise state on the JS thread.
  it('newTestObjectAsync() resolves HybridObjects under parallel load', async () => {
    let objects: object[] = []
    for (let round = 0; round < 20; round++) {
      objects = await Promise.all(
        Array.from({ length: 32 }, () => testObject.newTestObjectAsync())
      )
    }
    // Only check the last round, so the stress loop itself stays cheap.
    expect(objects).toHaveLength(32)
    for (const object of objects) {
      expect(NitroModules.isHybridObject(object)).toBe(true)
    }
  })
})
