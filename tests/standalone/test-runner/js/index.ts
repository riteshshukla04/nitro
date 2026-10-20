import { config } from 'chai'
import type { TestCase } from './utils/cases'

config.includeStack = true
config.truncateThreshold = 0

declare global {
  var runNitroTest: (name: string) => Promise<void>
  var getNitroTestTimeoutMs: (name: string) => number | undefined
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
    await getTest(name)()
  }
}
