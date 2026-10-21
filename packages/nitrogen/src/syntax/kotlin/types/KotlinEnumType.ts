import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import { EnumType } from '../../types/EnumType.js'
import { createKotlinEnum } from '../KotlinEnum.js'
import { KotlinCxxEnumType } from './KotlinCxxEnumType.js'
import { getKotlinConverter, type KotlinCppConverter } from '../KotlinConverter.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinEnumType extends EnumType implements KotlinType {
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  constructor(
    readonly type: EnumType,
    readonly config: NitroConfig = NitroConfig.current
  ) {
    super(type)
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxEnumType(cppType, this).getConverter()
  }

  getJSIType(): this {
    return this
  }

  get jniName(): string {
    return `J${this.enumName}`
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        let name = this.jniName
        if (options.fullyQualified || this.config.isExternalConfig) name = this.config.getCxxNamespace('c++', name)
        return getJniReferenceCode(name, options)
      }
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
            return `${getKotlinConverter({ cppType: this.type, kotlinType: this })}::toJNI(${value})`
          case 'kotlin':
            return `${getKotlinConverter({ cppType: this.type, kotlinType: this })}::fromJNI(${value})`
        }
    }
  }

  override getExtraFiles(): SourceFile[] {
    if (this.config.isExternalConfig) return []
    return createKotlinEnum(this)
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++':
        return [{ language: 'c++', declaration: this.config.getCxxHeader(`${this.jniName}.hpp`, 'private') }]
      case 'kotlin':
        if (this.config.isExternalConfig) {
          return [{ language: 'kotlin', name: `${this.config.getAndroidPackage('java/kotlin')}.${this.enumName}` }]
        }
        return []
      default:
        return super.getRequiredImports(language)
    }
  }
}
