import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ conversion for Kotlin ArrayBuffer values. */
export class KotlinCxxArrayBufferType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+ArrayBuffer.hpp', space: 'system' } }],
    }
  }
}
