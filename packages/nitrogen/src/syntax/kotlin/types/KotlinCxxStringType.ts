import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ interop for Kotlin String values. */
export class KotlinCxxStringType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+String.hpp', space: 'system' } }],
    }
  }
}
