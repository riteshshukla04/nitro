import type { KotlinCppConverter } from '../KotlinConverter.js'
import { VoidType } from '../../types/VoidType.js'
import type { KotlinConversion, KotlinType } from './KotlinType.js'

export class KotlinVoidType extends VoidType implements KotlinType {
  readonly jniValueKind = 'primitive'
  readonly needsKotlinConversion = false

  getCppConverter(): KotlinCppConverter {
    return { files: [], imports: [] }
  }

  convert(value: string, _conversion: KotlinConversion): string {
    return value
  }
}
