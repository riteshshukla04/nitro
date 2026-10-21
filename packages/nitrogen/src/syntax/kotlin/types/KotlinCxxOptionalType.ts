import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { OptionalType } from '../../types/OptionalType.js'
import type { KotlinOptionalType } from './KotlinOptionalType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion is requested separately from direct JNI/JSI bindings. */
export class KotlinCxxOptionalType extends KotlinCxxType {
  constructor(
    readonly cppOptionalType: OptionalType,
    readonly kotlinOptionalType: KotlinOptionalType
  ) {
    super(cppOptionalType, kotlinOptionalType)
  }

  getConverter(): KotlinCppConverter {
    const dependencies = combineKotlinCppConverters([
      this.kotlinOptionalType.wrappingType.getCppConverter(this.cppOptionalType.wrappingType),
    ])
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Optional.hpp', space: 'system' } },
      ],
    }
  }
}
