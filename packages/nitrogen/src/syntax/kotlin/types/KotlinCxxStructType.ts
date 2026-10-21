import { capitalizeName } from '../../../utils.js'
import { StructType } from '../../types/StructType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import type { Type } from '../../types/Type.js'
import { createKotlinCxxValueConverter } from '../KotlinCxxValueConverter.js'
import { getKotlinConverter, type KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'
import type { KotlinStructType } from './KotlinStructType.js'

/** On-demand native C++ interop for a Kotlin data class. */
export class KotlinCxxStructType extends KotlinCxxType {
  constructor(
    cppType: Type,
    override readonly kotlinType: KotlinStructType
  ) {
    super(cppType, kotlinType)
  }

  getConverter(): KotlinCppConverter {
    const cppType = getTypeAs(this.cppType, StructType)
    const fields = cppType.properties.map((property) => {
      const kotlinProperty = this.kotlinType.properties.find((candidate) => candidate.name === property.name)
      if (kotlinProperty == null) throw new Error(`Missing Kotlin property ${this.kotlinType.structName}.${property.name}`)
      return { cpp: property, kotlin: kotlinProperty.type }
    })
    const cppCode = cppType.getCode('c++', { context: 'value', fullyQualified: true })
    const jniClass = this.kotlinType.getCode('c++', { context: 'type-argument', fullyQualified: true })
    const toJNIFields = fields.map(({ cpp, kotlin }) => {
      const converter = getKotlinConverter({ cppType: cpp, kotlinType: kotlin })
      return `${converter}::toJNI(value.${cpp.escapedName})`
    })
    const fromJNIFields = fields.map(({ cpp, kotlin }) => {
      const converter = getKotlinConverter({ cppType: cpp, kotlinType: kotlin })
      return `${converter}::fromJNI(value->get${capitalizeName(cpp.escapedName)}())`
    })
    const cppToKotlinConverterCode = `
return ${jniClass}::create(${toJNIFields.join(', ')});
`.trim()
    const kotlinToCppConverterCode = `
return ${cppCode}(${fromJNIFields.join(', ')});
`.trim()
    const dependencies = fields.map(({ cpp, kotlin }) => kotlin.getCppConverter?.(cpp))
    return createKotlinCxxValueConverter({
      name: cppType.cppName,
      cppType: cppType,
      kotlinType: this.kotlinType,
      toJNI: cppToKotlinConverterCode,
      fromJNI: kotlinToCppConverterCode,
      dependencies: dependencies.filter((dependency) => dependency != null),
    })
  }
}
