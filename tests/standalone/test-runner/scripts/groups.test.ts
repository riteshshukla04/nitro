import { expect, test } from 'bun:test'
import { groupTests, suiteOf, type TestFile } from './groups'

const options = { targetCases: 4, maxCases: 6 }

function suite(prefix: string, name: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}.${name} / case ${index}`)
}

test('a case belongs to the suite before its last separator', () => {
  expect(suiteOf('arrays.Arrays / TestObjectCpp / works')).toBe('arrays.Arrays / TestObjectCpp')
  expect(suiteOf('Runtime.microtasksDrainInOrder')).toBe('')
})

test('small suites of one file share a runtime up to the target size', () => {
  const file: TestFile = {
    prefix: 'maps',
    sharing: 'suite',
    cases: [...suite('maps', 'A', 2), ...suite('maps', 'B', 2), ...suite('maps', 'C', 3)],
  }
  const groups = groupTests([file], options)
  expect(groups.map((group) => [group.name, group.cases.length])).toEqual([
    ['maps (1/2)', 4],
    ['maps (2/2)', 3],
  ])
  expect(groups.flatMap((group) => group.cases)).toEqual(file.cases)
})

test('a suite is never split unless it exceeds the maximum size', () => {
  const file: TestFile = { prefix: 'big', sharing: 'suite', cases: [...suite('big', 'A', 5), ...suite('big', 'B', 13)] }
  const groups = groupTests([file], options)
  expect(groups.map((group) => group.cases.length)).toEqual([5, 5, 4, 4])
  expect(groups.every((group) => group.cases.length <= options.maxCases)).toBe(true)
  expect(groups[0]!.cases.every((name) => name.startsWith('big.A'))).toBe(true)
})

test('files never share a runtime', () => {
  const groups = groupTests(
    [
      { prefix: 'a', sharing: 'suite', cases: suite('a', 'A', 1) },
      { prefix: 'b', sharing: 'suite', cases: suite('b', 'B', 1) },
    ],
    options
  )
  expect(groups.map((group) => group.name)).toEqual(['a', 'b'])
})

test('isolated cases start first, then larger groups', () => {
  const groups = groupTests(
    [
      { prefix: 'small', sharing: 'suite', cases: suite('small', 'A', 1) },
      { prefix: 'large', sharing: 'suite', cases: suite('large', 'A', 3) },
      { prefix: 'memory', sharing: 'case', cases: suite('memory', 'A', 2) },
    ],
    options
  )
  expect(groups.map((group) => group.name)).toEqual(['memory #1', 'memory #2', 'large', 'small'])
})

test('file sharing keeps every case of a file in one runtime', () => {
  const cases = [...suite('static', 'A', 5), ...suite('static', 'B', 5)]
  expect(groupTests([{ prefix: 'static', sharing: 'file', cases }], options)).toEqual([{ name: 'static', cases }])
})

test('case sharing gives every case its own runtime', () => {
  const cases = suite('memory', 'A', 2)
  expect(groupTests([{ prefix: 'memory', sharing: 'case', cases }], options)).toEqual([
    { name: 'memory #1', cases: [cases[0]!] },
    { name: 'memory #2', cases: [cases[1]!] },
  ])
})

test('invalid limits are rejected', () => {
  expect(() => groupTests([], { targetCases: 0, maxCases: 1 })).toThrow()
  expect(() => groupTests([], { targetCases: 5, maxCases: 4 })).toThrow()
})
