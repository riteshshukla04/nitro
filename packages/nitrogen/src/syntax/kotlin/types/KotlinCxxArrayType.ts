import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { ArrayType } from '../../types/ArrayType.js'
import type { KotlinArrayType } from './KotlinArrayType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion is requested separately from direct JNI/JSI bindings. */
export class KotlinCxxArrayType extends KotlinCxxType {
  constructor(
    readonly cppArrayType: ArrayType,
    readonly kotlinArrayType: KotlinArrayType
  ) {
    super(cppArrayType, kotlinArrayType)
  }

  getConverter(): KotlinCppConverter {
    const dependencies = combineKotlinCppConverters([this.kotlinArrayType.itemType.getCppConverter?.(this.cppArrayType.itemType)])
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Array.hpp', space: 'system' } },
      ],
    }
  }
}
