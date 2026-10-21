/**
 * Maps stack frames of the bundled `runtime-tests.js` back to the TypeScript
 * sources, using the bundle's source map (version 3).
 */
export interface SourceMapJSON {
  sources: string[]
  mappings: string
}

/** One mapping segment: generated column and original source, line and column, all 0-based. */
type Segment = [generatedColumn: number, source: number, line: number, column: number]

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_VALUES = new Map([...BASE64].map((character, index) => [character, index]))

function decodeMappings(mappings: string): Segment[][] {
  const lines: Segment[][] = []
  let source = 0
  let line = 0
  let column = 0
  for (const encodedLine of mappings.split(';')) {
    const segments: Segment[] = []
    let generatedColumn = 0
    for (const encodedSegment of encodedLine.split(',')) {
      if (encodedSegment === '') continue
      const fields: number[] = []
      let value = 0
      let shift = 0
      for (const character of encodedSegment) {
        const digit = BASE64_VALUES.get(character)
        if (digit === undefined) throw new Error(`Invalid source map character "${character}"`)
        value += (digit & 31) << shift
        if (digit & 32) {
          shift += 5
        } else {
          fields.push(value & 1 ? -(value >>> 1) : value >>> 1)
          value = 0
          shift = 0
        }
      }
      generatedColumn += fields[0] ?? 0
      // A one-field segment maps generated code to no original position.
      if (fields.length < 4) continue
      source += fields[1]!
      line += fields[2]!
      column += fields[3]!
      segments.push([generatedColumn, source, line, column])
    }
    lines.push(segments)
  }
  return lines
}

export class SourceMap {
  private readonly lines: Segment[][]

  constructor(private readonly map: SourceMapJSON) {
    this.lines = decodeMappings(map.mappings)
  }

  /** Looks up a 1-based generated position, as printed in Hermes stack frames. */
  originalPosition(line: number, column: number): { source: string; line: number; column: number } | undefined {
    const segments = this.lines[line - 1]
    if (segments === undefined || segments.length === 0) return undefined
    let match: Segment | undefined
    for (const segment of segments) {
      if (segment[0] > column - 1) break
      match = segment
    }
    match ??= segments[0]!
    const source = this.map.sources[match[1]]
    if (source === undefined) return undefined
    return { source: source.replace(/^(\.\.\/)+/, ''), line: match[2] + 1, column: match[3] + 1 }
  }

  /**
   * Rewrites `runtime-tests.js:LINE:COLUMN` locations to their sources and drops
   * frames of Hermes' internal bytecode, which only show Promise machinery.
   */
  symbolicate(stack: string, bundleName = 'runtime-tests.js'): string {
    const location = new RegExp(`${bundleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):(\\d+)`, 'g')
    return stack
      .split('\n')
      .filter((frame) => !/\bInternalBytecode\.js:|^\s*at \S+ \(native\)$/.test(frame))
      .map((frame) =>
        frame.replace(location, (text, line: string, column: string) => {
          const original = this.originalPosition(Number(line), Number(column))
          return original ? `${original.source}:${original.line}:${original.column}` : text
        })
      )
      .join('\n')
  }
}
