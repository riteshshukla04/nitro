import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion for Kotlin Null values. */
export class KotlinCxxNullType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Null.hpp', space: 'system' } }],
    }
  }
}
