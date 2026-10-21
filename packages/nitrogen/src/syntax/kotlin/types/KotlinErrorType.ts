import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import type { SourceImport } from '../../SourceFile.js'
import { ErrorType } from '../../types/ErrorType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxErrorType } from './KotlinCxxErrorType.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinErrorType extends ErrorType implements KotlinType {
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  getJSIType(): this {
    return this
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxErrorType(cppType, this).getConverter()
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return getJniReferenceCode('jni::JThrowable', options)
      case 'kotlin':
      case 'swift':
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
            return `JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::toJNI(${value})`
          case 'kotlin':
            return `JNIConverter<std::exception_ptr, jni::local_ref<jni::JThrowable>>::fromJNI(${value})`
        }
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = super.getRequiredImports(language)
    switch (language) {
      case 'c++':
        imports.push(
          { language: language, declaration: { header: 'NitroModules/JNIConverter+Error.hpp', space: 'system' } },
          { language: language, declaration: { header: 'NitroModules/JSIConverter+JThrowable.hpp', space: 'system' } }
        )
        break
      case 'kotlin':
      case 'swift':
        break
    }
    return imports
  }
}
