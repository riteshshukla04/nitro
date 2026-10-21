import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceImport } from '../../SourceFile.js'
import { AnyJSONType } from '../../types/AnyJSONType.js'
import type { GetCodeOptions } from '../../types/Type.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

/** JSON crosses JNI as its serialized representation. */
export class KotlinAnyJSONType extends AnyJSONType implements KotlinType {
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return getJniReferenceCode('JAnyJSON', options)
      case 'swift':
      case 'kotlin':
        return super.getCode(language, options)
    }
  }

  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin':
        return value
      case 'c++':
        switch (conversion.from) {
          case 'c++':
            return `JAnyJSON::create(${value})`
          case 'kotlin':
            return `${value}->toCpp()`
        }
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = super.getRequiredImports(language)
    switch (language) {
      case 'c++':
        imports.push({
          language: language,
          declaration: { header: 'NitroModules/JAnyJSON.hpp', space: 'system' },
        })
        break
    }
    return imports
  }
}
