import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import { StructType } from '../../types/StructType.js'
import { createKotlinStruct } from '../KotlinStruct.js'
import { createKotlinFallbackStruct } from '../KotlinFallbackStruct.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import { KotlinNamedType } from './KotlinNamedType.js'
import { KotlinCxxStructType } from './KotlinCxxStructType.js'
import { combineKotlinCppConverters, getKotlinConverter, type KotlinCppConverter } from '../KotlinConverter.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinStructType extends StructType implements KotlinType {
  override readonly properties: KotlinNamedType[]
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  constructor(
    readonly type: StructType,
    readonly config: NitroConfig = NitroConfig.current
  ) {
    const properties = type.properties.map((p) => new KotlinNamedType(p.name, wrapKotlinType(p, { config: config })))
    super(type.structName, properties, type.sourceConfig)
    this.properties = properties
  }

  getCppConverter(cppType: Type): KotlinCppConverter | undefined {
    if (!this.canConvertDirectly) return undefined
    return new KotlinCxxStructType(cppType, this).getConverter()
  }

  private get canConvertDirectly(): boolean {
    return this.properties.every((property) => property.type.jniValueKind === 'primitive' || property.type.getJSIType?.() != null)
  }

  getCppConverterDependencies(): KotlinCppConverter {
    const dependencies = this.properties.map((property, index) => {
      const original = this.type.properties[index]
      if (original == null) throw new Error('Mismatched struct property count')
      return property.type.getCppConverter?.(original)
    })
    return combineKotlinCppConverters(dependencies)
  }

  getJSIType(): this | undefined {
    if (!this.canConvertDirectly) return undefined
    return this
  }

  get jniName(): string {
    return `J${this.structName}`
  }

  convert(value: string, { from, in: language }: KotlinConversion): string {
    switch (language) {
      case 'kotlin':
        return value
      case 'c++':
        if (!this.canConvertDirectly) return from === 'c++' ? `${this.jniName}::fromCpp(${value})` : `${value}->toCpp()`
        switch (from) {
          case 'c++':
            return `${getKotlinConverter({ cppType: this.type, kotlinType: this })}::toJNI(${value})`
          case 'kotlin':
            return `${getKotlinConverter({ cppType: this.type, kotlinType: this })}::fromJNI(${value})`
        }
    }
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

  override getExtraFiles(): SourceFile[] {
    if (this.config.isExternalConfig) return []
    if (!this.canConvertDirectly) {
      return [
        ...this.properties.flatMap((property) => property.getExtraFiles()),
        ...this.getCppConverterDependencies().files,
        ...createKotlinFallbackStruct(this),
      ]
    }
    return [...this.properties.flatMap((p) => p.getExtraFiles()), ...createKotlinStruct(this)]
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++': {
        const imports: SourceImport[] = [{ language: 'c++', declaration: this.config.getCxxHeader(`${this.jniName}.hpp`, 'private') }]
        if (!this.canConvertDirectly) imports.push(...this.type.getRequiredImports(language), ...this.getCppConverterDependencies().imports)
        return imports
      }
      case 'kotlin':
        if (this.config.isExternalConfig) {
          return [{ language: 'kotlin', name: `${this.config.getAndroidPackage('java/kotlin')}.${this.structName}` }]
        }
        return []
      default:
        return super.getRequiredImports(language)
    }
  }
}
