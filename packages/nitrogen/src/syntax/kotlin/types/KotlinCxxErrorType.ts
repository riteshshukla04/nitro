import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion for Kotlin Error values. */
export class KotlinCxxErrorType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Error.hpp', space: 'system' } }],
    }
  }
}
