import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Native conversion for JNI primitives and their boxed Java values. */
export class KotlinCxxPrimitiveType extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Primitives.hpp', space: 'system' } }],
    }
  }
}
