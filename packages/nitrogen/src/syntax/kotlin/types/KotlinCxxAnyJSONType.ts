import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native C++ interop for Kotlin AnyJSON values. */
export class KotlinCxxAnyJSONType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+AnyJSON.hpp', space: 'system' } }],
    }
  }
}
