import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import type { SourceImport } from '../../SourceFile.js'
import { OptionalType } from '../../types/OptionalType.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxOptionalType } from './KotlinCxxOptionalType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import { getJniReferenceCode, type JniValueKind, type KotlinConversion, type KotlinType } from './KotlinType.js'

/** JNI represents an optional as a nullable reference to its boxed value. */
export class KotlinOptionalType extends OptionalType implements KotlinType {
  override readonly wrappingType: KotlinType

  constructor(readonly type: OptionalType) {
    const wrappingType = wrapKotlinType(type.wrappingType, { boxed: true })
    super(wrappingType)
    this.wrappingType = wrappingType
  }

  get jniValueKind(): JniValueKind {
    return this.wrappingType.jniValueKind
  }
  private get canConvertDirectly(): boolean {
    return this.wrappingType.jniValueKind === 'wrapper' && this.wrappingType.getJSIType?.() != null
  }

  getJSIType(): this | undefined {
    if (!this.canConvertDirectly) return undefined
    return this
  }

  getCppConverter(cppType: Type): KotlinCppConverter | undefined {
    if (!this.canConvertDirectly) return undefined
    return new KotlinCxxOptionalType(getTypeAs(cppType, OptionalType), this).getConverter()
  }

  get needsKotlinConversion(): boolean {
    return this.wrappingType.needsKotlinConversion
  }
  get fromCppReturnType(): string | undefined {
    if (this.canConvertDirectly) return undefined
    return this.wrappingType.fromCppReturnType
  }
  /** Callbacks cross JNI as named interfaces, which need no braces. */
  override get needsBraces(): boolean {
    return false
  }

  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin': {
        if (!this.needsKotlinConversion) return value
        const wrappedValue = this.wrappingType.convert('it', conversion)
        return `${value}?.let { ${wrappedValue} }`
      }
      case 'c++': {
        if (this.canConvertDirectly) {
          const cppType = this.type.getCode('c++', { context: 'value' })
          const jniType = this.getCode('c++', { context: 'value' })
          const converter = `JNIConverter<${cppType}, ${jniType}>`
          switch (conversion.from) {
            case 'c++':
              return `${converter}::toJNI(${value})`
            case 'kotlin':
              return `${converter}::fromJNI(${value})`
          }
        }
        switch (conversion.from) {
          case 'c++': {
            const jniValue = this.wrappingType.convert(`${value}.value()`, conversion)
            return `${value}.has_value() ? ${jniValue} : nullptr`
          }
          case 'kotlin': {
            const cppValue = this.wrappingType.convert(value, conversion)
            return `${value} != nullptr ? std::make_optional(${cppValue}) : std::nullopt`
          }
        }
      }
    }
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        if (!this.canConvertDirectly) return this.wrappingType.getCode(language, options)
        const wrapping = this.wrappingType.getCode(language, { ...options, context: 'type-argument' })
        return getJniReferenceCode(`JOptional<${wrapping}>`, options)
      }
      default:
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = [...this.type.getRequiredImports(language), ...this.wrappingType.getRequiredImports(language)]
    switch (language) {
      case 'c++':
        if (this.canConvertDirectly) {
          imports.push(
            { language: language, declaration: { header: 'NitroModules/JNIConverter+Optional.hpp', space: 'system' } },
            { language: language, declaration: { header: 'NitroModules/JSIConverter+JOptional.hpp', space: 'system' } }
          )
        }
        break
      case 'kotlin':
      case 'swift':
        break
    }
    return imports
  }
}
