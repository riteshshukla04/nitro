import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { VariantType } from '../../types/VariantType.js'
import type { KotlinVariantType } from './KotlinVariantType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native variant conversion is requested separately from direct JNI/JSI bindings. */
export class KotlinCxxVariantType extends KotlinCxxType {
  constructor(
    readonly cppVariantType: VariantType,
    readonly kotlinVariantType: KotlinVariantType
  ) {
    super(cppVariantType, kotlinVariantType)
  }

  getConverter(): KotlinCppConverter {
    const childConverters = this.cppVariantType.variants.map((cppType, index) => {
      const kotlinType = this.kotlinVariantType.variants[index]
      if (kotlinType == null) throw new Error(`Missing Kotlin case ${index} in ${this.kotlinVariantType.name}.`)
      return kotlinType.getCppConverter(cppType)
    })
    const dependencies = combineKotlinCppConverters(childConverters)
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Variant.hpp', space: 'system' } },
      ],
    }
  }
}
