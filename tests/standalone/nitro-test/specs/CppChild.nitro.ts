import { iOS } from 'nitro-core'
import type { CppBase } from './CppBase.nitro'
import type { NamedVariant } from './TestObject.nitro'

export * from '#nitro/CppChild'

@iOS({
  language: 'c++',
  implementation: {
    className: 'HybridCppChild',
    include: '"HybridCppChild.hpp"',
  },
  allowMultipleImplementations: true,
  allowInheritance: true,
})
export declare class CppChild extends CppBase {
  constructor()
  readonly childValue: number
  bounceVariant(variant: NamedVariant): NamedVariant
}
