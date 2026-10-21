import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceImport } from '../../SourceFile.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import { UInt64Type } from '../../types/UInt64Type.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxPrimitiveType } from './KotlinCxxPrimitiveType.js'
import { getJniPrimitiveCode, type JniValueKind, type KotlinConversion, type KotlinType, type KotlinTypeOptions } from './KotlinType.js'

/** JNI carries ULong bits as Long; the boxed facade preserves unsigned JS semantics. */
export class KotlinUInt64Type extends UInt64Type implements KotlinType {
  readonly needsKotlinConversion = true
  readonly boxed: boolean

  constructor({ boxed }: KotlinTypeOptions = {}) {
    super()
    this.boxed = boxed === true
  }

  get jniValueKind(): JniValueKind {
    return this.boxed ? 'wrapper' : 'primitive'
  }

  getJSIType(): this | undefined {
    // A raw jlong also represents signed Int64. Keep UInt64 as a native scalar.
    if (!this.boxed) return undefined
    return this
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxPrimitiveType(cppType, this).getConverter()
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return getJniPrimitiveCode('jlong', options, { boxedType: 'JUInt64', boxed: this.boxed })
      case 'kotlin':
        return 'Long'
      case 'swift':
        return super.getCode(language, options)
    }
  }

  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin':
        return conversion.from === 'kotlin' ? `${value}.toLong()` : `${value}.toULong()`
      case 'c++': {
        const jniType = this.getCode('c++', { context: 'value' })
        const converter = `JNIConverter<uint64_t, ${jniType}>`
        switch (conversion.from) {
          case 'c++':
            return `${converter}::toJNI(${value})`
          case 'kotlin':
            return `${converter}::fromJNI(${value})`
        }
      }
    }
  }

  override getRequiredImports(language: Language = 'c++'): SourceImport[] {
    const imports = super.getRequiredImports()
    switch (language) {
      case 'c++':
        imports.push(
          { language: language, declaration: { header: 'NitroModules/JUInt64.hpp', space: 'system' } },
          { language: language, declaration: { header: 'NitroModules/JNIConverter+Primitives.hpp', space: 'system' } },
          { language: language, declaration: { header: 'NitroModules/JSIConverter+JNIPrimitives.hpp', space: 'system' } }
        )
        break
      case 'kotlin':
      case 'swift':
        break
    }
    return imports
  }
}
