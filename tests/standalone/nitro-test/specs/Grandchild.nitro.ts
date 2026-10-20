import { iOS } from 'nitro-core'
import type { Child } from './Child.nitro'

export * from '#nitro/Grandchild'

@iOS({ language: 'swift', implementation: { className: 'HybridGrandchild' } })
export declare class Grandchild extends Child {
  constructor()
  readonly grandchildValue: number
}
