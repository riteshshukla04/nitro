import { expect } from 'chai'
import { NitroModules } from 'nitro-core'
import { TestObjectSwiftKotlin } from 'nitro-test'
import { withTestTimeout } from './utils/cases'

export async function microtasksDrainInOrder(): Promise<void> {
  const completed: number[] = []
  let chain = Promise.resolve()
  // No native callback wakes the dispatcher. The host must drain these jobs
  // before this test can complete, preserving each iteration's captured index.
  for (let index = 0; index < 300; index++) {
    chain = chain.then(() => {
      expect(completed.length).to.equal(index)
      completed.push(index)
    })
  }
  await chain
  expect(completed.length).to.equal(300)
}

// The 18 Swift Tasks complete on the test process's single strict cooperative
// thread. Right after a fresh simulator boot on 3-core CI machines, they took
// 10 to 16 seconds; a deadlock still fails.
export const concurrentNativePromises = withTestTimeout(30_000, async (): Promise<void> => {
  const object = new TestObjectSwiftKotlin()
  const results = await Promise.all(Array.from({ length: 16 }, () => object.calculateFibonacciAsync(10)))
  expect(results).to.deep.equal(Array(16).fill(55n))
  // The same runtime and object remain usable after all completions.
  expect(object.addNumbers(1, 2)).to.equal(3)
  expect(await object.calculateFibonacciAsync(1)).to.equal(1n)
})
