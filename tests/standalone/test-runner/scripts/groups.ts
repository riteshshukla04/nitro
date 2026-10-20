/**
 * How a test file's cases share Hermes runtimes. Test files opt out of the
 * default by exporting `runtimeSharing` (see `js/utils/cases.ts`).
 *
 * - `suite`: suites of the file are packed into runtimes of a bounded size.
 * - `file`: every case of the file runs in one runtime, in order. Use this when
 *   cases write process-wide native state and must never overlap.
 * - `case`: every case gets a fresh runtime, e.g. for heap measurements.
 */
export type RuntimeSharing = 'suite' | 'file' | 'case'
export const RUNTIME_SHARING_MODES: readonly RuntimeSharing[] = ['suite', 'file', 'case']

export interface TestFile {
  /** File name without `.test.ts`, which also prefixes every case name. */
  prefix: string
  sharing: RuntimeSharing
  /** Fully qualified case names in execution order. */
  cases: string[]
}

/** Cases that run in order in one Hermes runtime. */
export interface TestGroup {
  name: string
  cases: string[]
}

export interface GroupingOptions {
  /** Suites are merged until a runtime holds about this many cases. */
  targetCases: number
  /** No shared runtime ever holds more cases than this. */
  maxCases: number
}

export const DEFAULT_GROUPING: GroupingOptions = { targetCases: 50, maxCases: 100 }

/** `Arrays / TestObjectCpp / works` belongs to suite `Arrays / TestObjectCpp`. */
export function suiteOf(caseName: string): string {
  const separator = caseName.lastIndexOf(' / ')
  return separator < 0 ? '' : caseName.slice(0, separator)
}

/** Splits `items` into `parts` contiguous chunks whose sizes differ by at most one. */
function chunk<T>(items: T[], parts: number): T[][] {
  const size = Math.floor(items.length / parts)
  const larger = items.length % parts
  const chunks: T[][] = []
  let start = 0
  for (let index = 0; index < parts; index++) {
    const end = start + size + (index < larger ? 1 : 0)
    chunks.push(items.slice(start, end))
    start = end
  }
  return chunks
}

/**
 * Packs each file's suites into runtimes. A suite is never split unless it alone
 * exceeds `maxCases`, and suites of different files never share a runtime, so a
 * failure can always be traced back to one file.
 *
 * Groups are returned in the order they should start: isolated cases first,
 * because heap and stress cases are the slowest, then larger groups first.
 */
export function groupTests(files: TestFile[], options: GroupingOptions = DEFAULT_GROUPING): TestGroup[] {
  if (options.targetCases < 1 || options.maxCases < options.targetCases) {
    throw new Error('Grouping needs 1 <= targetCases <= maxCases')
  }
  const isolated: TestGroup[] = []
  const groups: TestGroup[] = []
  for (const file of files) {
    if (file.cases.length === 0) continue
    if (file.sharing === 'case') {
      for (const [index, name] of file.cases.entries()) {
        isolated.push({ name: `${file.prefix} #${index + 1}`, cases: [name] })
      }
      continue
    }
    if (file.sharing === 'file') {
      groups.push({ name: file.prefix, cases: [...file.cases] })
      continue
    }

    const suites = new Map<string, string[]>()
    for (const name of file.cases) {
      const suite = suiteOf(name)
      suites.set(suite, [...(suites.get(suite) ?? []), name])
    }
    const packed: string[][] = []
    let current: string[] = []
    for (const cases of suites.values()) {
      const pieces = cases.length > options.maxCases ? chunk(cases, Math.ceil(cases.length / options.maxCases)) : [cases]
      for (const piece of pieces) {
        if (current.length > 0 && current.length + piece.length > options.targetCases) {
          packed.push(current)
          current = []
        }
        current = [...current, ...piece]
      }
    }
    if (current.length > 0) packed.push(current)
    for (const [index, cases] of packed.entries()) {
      const name = packed.length === 1 ? file.prefix : `${file.prefix} (${index + 1}/${packed.length})`
      groups.push({ name, cases })
    }
  }
  // A stable sort keeps file order among groups of the same size.
  return [...isolated, ...groups.sort((a, b) => b.cases.length - a.cases.length)]
}
