import { config } from 'chai'
import type { TestCase } from './utils/cases'
import { SourceMap } from './utils/sourceMap'

config.includeStack = true
config.truncateThreshold = 0

declare global {
  var runNitroTest: (name: string) => Promise<void>
  var getNitroTestTimeoutMs: (name: string) => number | undefined
  /** Provided by native runners that ship the bundle's source map. */
  var __nitroTestSourceMap: (() => string) | undefined
}

let sourceMap: SourceMap | null | undefined

/** Points the stack of a failure at the TypeScript sources instead of the bundle. */
export function symbolicate(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('stack' in error) || typeof error.stack !== 'string') {
    return error
  }
  try {
    if (sourceMap === undefined) {
      const json = globalThis.__nitroTestSourceMap?.()
      sourceMap = json ? new SourceMap(JSON.parse(json)) : null
    }
    if (sourceMap === null) return error
    const stack = sourceMap.symbolicate(error.stack)
    Object.defineProperty(error, 'stack', { value: stack, configurable: true, writable: true })
    // Native runners report `stack`; keep the error itself if it took the value.
    return error.stack === stack ? error : { stack }
  } catch {
    // A broken map must not hide the failure; keep the bundle's locations.
    return error
  }
}

/**
 * Registers every case by name. Each entry loads its test module on first use,
 * so a runtime only evaluates the files whose cases it actually runs.
 */
export function registerTests(cases: Record<string, () => TestCase>): void {
  const getTest = (name: string): TestCase => {
    const load = Object.hasOwn(cases, name) ? cases[name] : undefined
    const test = typeof load === 'function' ? load() : undefined
    if (typeof test !== 'function') throw new Error(`Unknown Nitro test: ${name}`)
    return test
  }
  globalThis.getNitroTestTimeoutMs = (name) => getTest(name).timeoutMs
  // Native runners report each discovered case independently. Async tests stay
  // alive until their returned Promise settles, including native callbacks.
  globalThis.runNitroTest = async (name: string) => {
    try {
      await getTest(name)()
    } catch (error) {
      throw symbolicate(error)
    }
  }
}
