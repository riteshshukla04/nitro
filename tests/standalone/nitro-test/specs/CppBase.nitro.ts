import { Android, iOS } from 'nitro-core'
import type { HybridObject } from 'nitro-core'
import type { Size, SizeUnit } from './Base.nitro'

export * from '#nitro/CppBase'

@iOS({
  language: 'c++',
  implementation: {
    className: 'HybridCppBase',
    include: '"HybridCppBase.hpp"',
  },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
@Android({
  language: 'c++',
  implementation: {
    className: 'HybridCppBase',
    include: '"HybridCppBase.hpp"',
  },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
export declare class CppBase extends HybridObject {
  constructor()
  readonly baseValue: number
  bounceSize(size: Size): Size
  bounceSizeUnit(unit: SizeUnit): SizeUnit
  mapSize(size: Size, callback: (size: Size) => Size): Promise<Size>
}
