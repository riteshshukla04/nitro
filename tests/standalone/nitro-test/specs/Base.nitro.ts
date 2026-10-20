import { Android, iOS } from 'nitro-core'
import type { HybridObject } from 'nitro-core'
import type { SomeExternalObject } from 'nitro-test-external'

export * from '#nitro/Base'

export enum SizeUnit {
  Points = 1,
  Pixels = 2,
}

export interface Size {
  width: number
  height: number
  unit: SizeUnit
}

@iOS({
  language: 'swift',
  implementation: { className: 'HybridBase' },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
@Android({
  language: 'kotlin',
  implementation: { className: 'HybridBase' },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
export declare class Base extends HybridObject {
  constructor()
  static createAlternativeBase(): Base
  static createInternalExternalObject(): SomeExternalObject
  readonly baseValue: number
  bounceSize(size: Size): Size
  bounceSizeUnit(unit: SizeUnit): SizeUnit
  mapSize(size: Size, callback: (size: Size) => Size): Promise<Size>
}
