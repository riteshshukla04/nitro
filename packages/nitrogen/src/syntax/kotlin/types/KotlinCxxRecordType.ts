import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { RecordType } from '../../types/RecordType.js'
import type { KotlinRecordType } from './KotlinRecordType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion is requested separately from direct JNI/JSI bindings. */
export class KotlinCxxRecordType extends KotlinCxxType {
  constructor(
    readonly cppRecordType: RecordType,
    readonly kotlinRecordType: KotlinRecordType
  ) {
    super(cppRecordType, kotlinRecordType)
  }

  getConverter(): KotlinCppConverter {
    const dependencies = combineKotlinCppConverters([
      this.kotlinRecordType.keyType.getCppConverter(this.cppRecordType.keyType),
      this.kotlinRecordType.valueType.getCppConverter(this.cppRecordType.valueType),
    ])
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Map.hpp', space: 'system' } },
      ],
    }
  }
}
