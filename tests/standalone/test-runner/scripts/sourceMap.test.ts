import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SourceMap } from '../js/utils/sourceMap'

async function bundleFixture(): Promise<{ code: string; map: SourceMap }> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitro-source-map-'))
  const entry = path.join(directory, 'fixture.test.ts')
  writeFileSync(
    entry,
    ['type Value = number', '', 'export function fails(value: Value): void {', "  throw new Error('marker ' + value)", '}', ''].join('\n')
  )
  const result = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'iife', sourcemap: 'external' })
  const code = await result.outputs.find((output) => output.kind === 'entry-point')!.text()
  const map = await result.outputs.find((output) => output.kind === 'sourcemap')!.text()
  return { code, map: new SourceMap(JSON.parse(map)) }
}

test('a generated position maps to its TypeScript line', async () => {
  const { code, map } = await bundleFixture()
  const lines = code.split('\n')
  const line = lines.findIndex((text) => text.includes('throw new Error')) + 1
  const column = lines[line - 1]!.indexOf('throw') + 1
  const original = map.originalPosition(line, column)
  expect(original?.source).toEndWith('fixture.test.ts')
  expect(original?.line).toBe(4)
  expect(original?.column).toBe(3)
})

test('Hermes stacks point at sources and drop internal bytecode frames', async () => {
  const { code, map } = await bundleFixture()
  const lines = code.split('\n')
  const line = lines.findIndex((text) => text.includes('throw new Error')) + 1
  const stack = [
    'Error: marker 1',
    `    at fails (runtime-tests.js:${line}:9)`,
    '    at next (native)',
    '    at resume (address at InternalBytecode.js:1:27803)',
    '    at unmapped (runtime-tests.js:999999:1)',
  ].join('\n')
  expect(map.symbolicate(stack).split('\n')).toEqual([
    'Error: marker 1',
    expect.stringMatching(/^ {4}at fails \(.*fixture\.test\.ts:4:3\)$/),
    '    at unmapped (runtime-tests.js:999999:1)',
  ])
})

test('invalid mappings are rejected', () => {
  expect(() => new SourceMap({ sources: [], mappings: 'A!' })).toThrow('Invalid source map character')
})
