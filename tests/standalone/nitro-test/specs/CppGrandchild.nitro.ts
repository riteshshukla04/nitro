import { iOS } from 'nitro-core'
import type { CppChild } from './CppChild.nitro'

export * from '#nitro/CppGrandchild'

@iOS({
  language: 'c++',
  implementation: {
    className: 'HybridCppGrandchild',
    include: '"HybridCppGrandchild.hpp"',
  },
})
export declare class CppGrandchild extends CppChild {
  constructor()
  readonly grandchildValue: number
}
