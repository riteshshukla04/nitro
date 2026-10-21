import type { KotlinTypeOptions } from './types/KotlinType.js'
import type { Type } from '../types/Type.js'
import { wrapKotlinType } from './wrapKotlinType.js'

/** Select the JavaScript-facing representation independently of the JNI method ABI. */
export function getKotlinJSIType(type: Type, options: KotlinTypeOptions = {}): Type {
  const kotlinType = wrapKotlinType(type, options)
  return kotlinType.getJSIType?.() ?? type
}
