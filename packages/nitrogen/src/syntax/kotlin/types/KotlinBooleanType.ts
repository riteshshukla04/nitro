import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceImport } from '../../SourceFile.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import { BooleanType } from '../../types/BooleanType.js'
import { KotlinCxxPrimitiveType } from './KotlinCxxPrimitiveType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { getJniPrimitiveCode, type JniValueKind, type KotlinConversion, type KotlinType, type KotlinTypeOptions } from './KotlinType.js'

export class KotlinBooleanType extends BooleanType implements KotlinType {
  readonly needsKotlinConversion = false
  readonly boxed: boolean

  constructor({ boxed }: KotlinTypeOptions = {}) {
    super()
    this.boxed = boxed === true
  }

  get jniValueKind(): JniValueKind {
    return this.boxed ? 'object' : 'primitive'
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxPrimitiveType(cppType, this).getConverter()
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return getJniPrimitiveCode('jboolean', options, { boxedType: 'jni::JBoolean', boxed: this.boxed })
      case 'kotlin':
      case 'swift':
        return super.getCode(language, options)
    }
  }

  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin':
        return value
      case 'c++': {
        const jniType = this.getCode('c++', { context: 'value' })
        const converter = `JNIConverter<bool, ${jniType}>`
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
