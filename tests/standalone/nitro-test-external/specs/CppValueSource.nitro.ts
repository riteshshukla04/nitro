import { Android, iOS } from 'nitro-core'
import type { HybridObject } from 'nitro-core'

export * from '#nitro/CppValueSource'

export enum CppOnlyValueKind {
  First = 0,
  Second = 3,
}

export interface CppOnlyValue {
  label: string
  kind: CppOnlyValueKind
}

// This package generates these values only for C++. Swift consumers must
// generate their own Swift value types instead of importing nonexistent ones.
@iOS({ language: 'c++', allowMultipleImplementations: true })
@Android({ language: 'c++', allowMultipleImplementations: true })
export declare class CppValueSource extends HybridObject {
  readonly value: CppOnlyValue
}
