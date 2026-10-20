import { Android, iOS, type HybridObject } from 'nitro-core'

export * from '#nitro/Example'

@Android({
  language: 'kotlin',
  implementation: { className: 'HybridExample' },
})
@iOS({
  language: 'swift',
  implementation: { className: 'HybridExample' },
})
export declare class Example extends HybridObject {
  constructor()

  add(a: number, b: number): number
}
