import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Explicit native C++ interop for unsigned scalars and their boxed Java carrier. */
export class KotlinCxxUInt64Type extends KotlinCxxType {
  getConverter(): KotlinCppConverter {
    return {
      files: [],
      imports: [{ language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Primitives.hpp', space: 'system' } }],
    }
  }
}
