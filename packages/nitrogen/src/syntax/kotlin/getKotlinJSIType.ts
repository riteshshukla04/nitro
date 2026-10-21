import type { Type } from '../types/Type.js'
import { wrapKotlinType } from './wrapKotlinType.js'

/** Select the JavaScript-facing representation independently of the JNI method ABI. */
export function getKotlinJSIType(type: Type): Type {
  const kotlinType = wrapKotlinType(type)
  return kotlinType.getJSIType?.() ?? type
}
