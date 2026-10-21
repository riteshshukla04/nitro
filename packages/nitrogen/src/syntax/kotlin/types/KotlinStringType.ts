import { KotlinCxxStringType } from './KotlinCxxStringType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import type { Type } from '../../types/Type.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions } from '../../types/Type.js'
import { StringType } from '../../types/StringType.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'
import type { SourceImport } from '../../SourceFile.js'

export class KotlinStringType extends StringType implements KotlinType {
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxStringType(cppType, this).getConverter()
  }

  getJSIType(): this {
    return this
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return getJniReferenceCode('jni::JString', options)
      default:
        return super.getCode(language, options)
    }
  }

  convert(value: string, { from, in: language }: KotlinConversion): string {
    switch (language) {
      case 'kotlin':
        return value
      case 'c++':
        switch (from) {
          case 'c++':
            return `JNIConverter<std::string, jni::local_ref<jni::JString>>::toJNI(${value})`
          case 'kotlin':
            return `JNIConverter<std::string, jni::local_ref<jni::JString>>::fromJNI(${value})`
        }
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++':
        return [
          { language: language, declaration: { header: 'NitroModules/JNIConverter+String.hpp', space: 'system' } },
          { language: language, declaration: { header: 'NitroModules/JSIConverter+JString.hpp', space: 'system' } },
        ]
      default:
        return super.getRequiredImports(language)
    }
  }
}
