import { afterEach, expect, mock, test } from 'bun:test'
import { registerTests } from '../js/index'
const created: string[] = []
mock.module('nitro-core', () => ({ NitroModules: {} }))
mock.module('nitro-test', () => ({
  TestObjectCpp: class TestObjectCpp {
    constructor() {
      created.push('TestObjectCpp')
    }
  },
  TestObjectSwiftKotlin: class TestObjectSwiftKotlin {
    constructor() {
      created.push('TestObjectSwiftKotlin')
    }
  },
  Child: class Child {},
}))
mock.module('nitro-test-external', () => ({
  SomeExternalObject: class SomeExternalObject {},
}))
const { casesForTestObjects, namedCases, withTestTimeout } = await import('../js/utils/cases')
type TestCase = import('../js/utils/cases').TestCase

/** Registers already loaded cases, the way the bundle registers module loaders. */
function loaded(cases: Record<string, TestCase>): Record<string, () => TestCase> {
  return Object.fromEntries(Object.entries(cases).map(([name, test]) => [name, () => test]))
}

const originalRun = globalThis.runNitroTest
const originalTimeout = globalThis.getNitroTestTimeoutMs
afterEach(() => {
  created.length = 0
  globalThis.runNitroTest = originalRun
  globalThis.getNitroTestTimeoutMs = originalTimeout
})

test('unannotated cases leave the native default unchanged', async () => {
  let called = false
  registerTests(
    loaded({
      ordinary: () => {
        called = true
      },
    })
  )
  expect(globalThis.getNitroTestTimeoutMs('ordinary')).toBeUndefined()
  await globalThis.runNitroTest('ordinary')
  expect(called).toBe(true)
})

test('fixture binding preserves timeouts without allocating the fixture', async () => {
  const received: string[] = []
  const cases = casesForTestObjects('Memory', {
    allocate: withTestTimeout(150_000, (object) => {
      received.push(object.constructor.name)
    }),
    ordinary: () => {},
  })
  registerTests(loaded(cases))

  for (const implementation of ['TestObjectCpp', 'TestObjectSwiftKotlin']) {
    const name = `Memory / ${implementation} / allocate`
    expect(globalThis.getNitroTestTimeoutMs(name)).toBe(150_000)
    expect(globalThis.getNitroTestTimeoutMs(`Memory / ${implementation} / ordinary`)).toBeUndefined()
  }
  expect(created).toEqual([])
  await globalThis.runNitroTest('Memory / TestObjectCpp / allocate')
  await globalThis.runNitroTest('Memory / TestObjectSwiftKotlin / allocate')
  expect(created).toEqual(['TestObjectCpp', 'TestObjectSwiftKotlin'])
  expect(received).toEqual(created)
})

test('named cases retain an explicit timeout', () => {
  registerTests(loaded(namedCases('Stress', { allocate: withTestTimeout(500, () => {}) })))
  expect(globalThis.getNitroTestTimeoutMs('Stress / allocate')).toBe(500)
})

test('timeout lookup rejects unknown and inherited case names', () => {
  registerTests(loaded({ ordinary: () => {} }))
  for (const name of ['missing', 'constructor']) {
    expect(() => globalThis.getNitroTestTimeoutMs(name)).toThrow(`Unknown Nitro test: ${name}`)
  }
})

test('only the four allocation stress cases receive a longer budget', async () => {
  const { cases } = await import('../js/memory.test')
  registerTests(loaded(cases))
  const overrides = Object.keys(cases).filter((name) => globalThis.getNitroTestTimeoutMs(name) !== undefined)
  expect(overrides.sort()).toEqual([
    'Memory / TestObjectCpp / newTestObject() objects are reclaimed by JS GC',
    'Memory / TestObjectCpp / newTestObject() objects are released by manual dispose()',
    'Memory / TestObjectSwiftKotlin / newTestObject() objects are reclaimed by JS GC',
    'Memory / TestObjectSwiftKotlin / newTestObject() objects are released by manual dispose()',
  ])
  for (const name of overrides) {
    expect(globalThis.getNitroTestTimeoutMs(name)).toBe(150_000)
  }
})

test('a test module is only loaded when one of its cases runs', async () => {
  const loads: string[] = []
  const module = (file: string, cases: Record<string, TestCase>) => () => {
    loads.push(file)
    return cases
  }
  const arrays = module('arrays', { first: () => {}, second: () => {} })
  const maps = module('maps', { first: () => {} })
  registerTests({
    'arrays.first': () => arrays().first!,
    'arrays.second': () => arrays().second!,
    'maps.first': () => maps().first!,
  })
  expect(loads).toEqual([])
  await globalThis.runNitroTest('arrays.second')
  expect(loads).toEqual(['arrays'])
  expect(() => globalThis.getNitroTestTimeoutMs('missing')).toThrow('Unknown Nitro test: missing')
})
