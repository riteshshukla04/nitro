import { EnumType } from '../../types/EnumType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import type { Type } from '../../types/Type.js'
import { createKotlinCxxValueConverter } from '../KotlinCxxValueConverter.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'
import type { KotlinEnumType } from './KotlinEnumType.js'

/** On-demand native C++ interop for a Kotlin enum. */
export class KotlinCxxEnumType extends KotlinCxxType {
  constructor(
    cppType: Type,
    override readonly kotlinType: KotlinEnumType
  ) {
    super(cppType, kotlinType)
  }

  getConverter(): KotlinCppConverter {
    const cppType = getTypeAs(this.cppType, EnumType)
    const cppCode = cppType.getCode('c++', { context: 'value', fullyQualified: true })
    const jniClass = this.kotlinType.getCode('c++', { context: 'type-argument', fullyQualified: true })
    const cppToKotlinConverterCode = `
return ${jniClass}::fromValue(static_cast<int32_t>(value));
`.trim()
    const kotlinToCppConverterCode = `
return static_cast<${cppCode}>(value->value());
`.trim()
    return createKotlinCxxValueConverter({
      name: cppType.enumName,
      cppType: cppType,
      kotlinType: this.kotlinType,
      toJNI: cppToKotlinConverterCode,
      fromJNI: kotlinToCppConverterCode,
    })
  }
}
