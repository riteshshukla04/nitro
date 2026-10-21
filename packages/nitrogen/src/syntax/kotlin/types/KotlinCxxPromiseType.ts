import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { PromiseType } from '../../types/PromiseType.js'
import type { KotlinPromiseType } from './KotlinPromiseType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ Promise conversion delegates result and listener ownership to the runtime. */
export class KotlinCxxPromiseType extends KotlinCxxType {
  constructor(
    readonly cppPromiseType: PromiseType,
    readonly kotlinPromiseType: KotlinPromiseType
  ) {
    super(cppPromiseType, kotlinPromiseType)
  }

  getConverter(): KotlinCppConverter {
    const dependencies = combineKotlinCppConverters([
      this.kotlinPromiseType.resultingType.getCppConverter(this.cppPromiseType.resultingType),
    ])
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Promise.hpp', space: 'system' } },
      ],
    }
  }
}
