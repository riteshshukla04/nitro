import type { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import type { GetCodeOptions, Type, TypeKind } from '../../types/Type.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import { convertJniValue, type KotlinType } from './KotlinType.js'

/** A direct JNI value retained across native threads and Fabric props snapshots. */
export class KotlinStoredType implements Type {
  readonly type: KotlinType

  constructor(type: Type, config: NitroConfig) {
    this.type = wrapKotlinType(type, { config: config })
  }

  get kind(): TypeKind {
    return this.type.kind
  }

  get isEquatable(): boolean {
    return this.type.isEquatable
  }

  getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        if (this.type.jniValueKind === 'primitive') {
          return this.type.getCode(language, options)
        }
        const jniClass = this.type.getCode(language, { ...options, context: 'type-argument' })
        let storedType: string
        if (this.type.hasStaticJNIReference) {
          storedType = `jni::alias_ref<${jniClass}>`
        } else {
          storedType = `jni::global_ref<${jniClass}>`
        }
        if (options.context === 'parameter') return `const ${storedType}&`
        return storedType
      }
      default:
        return this.type.getCode(language, options)
    }
  }

  /** Borrow an object, or adapt a scalar whose JavaScript ABI differs from JNI. */
  getJniValue(value: string): string {
    if (this.type.jniValueKind === 'object') return `${value}.get()`
    return convertJniValue(this.type, value, 'to-jni')
  }

  getExtraFiles(): SourceFile[] {
    return this.type.getExtraFiles()
  }

  getRequiredImports(language: Language): SourceImport[] {
    const imports = this.type.getRequiredImports(language)
    switch (language) {
      case 'c++':
        if (this.type.jniValueKind === 'object') {
          imports.push({
            language: language,
            declaration: { header: 'NitroModules/JSIConverter+JNIGlobalRef.hpp', space: 'system' },
          })
        }
        break
      default:
        break
    }
    return imports
  }
}
