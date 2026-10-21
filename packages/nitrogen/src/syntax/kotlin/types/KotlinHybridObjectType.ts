import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions } from '../../types/Type.js'
import { getHybridObjectName } from '../../getHybridObjectName.js'
import type { SourceImport } from '../../SourceFile.js'
import { HybridObjectType } from '../../types/HybridObjectType.js'
import { getJniReferenceCode, type JNINativeRegistration, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinHybridObjectType extends HybridObjectType implements KotlinType {
  readonly jniValueKind = 'wrapper'
  readonly needsKotlinConversion = false

  constructor(readonly type: HybridObjectType) {
    super(type.hybridObjectName, type.platforms, type.baseTypes, type.sourceConfig)
  }

  /** An exact implementation can skip JVM virtual dispatch for its direct members. */
  get canUseNonvirtualJniCalls(): boolean {
    const android = this.platforms.android
    return (
      android?.language === 'kotlin' && android.implementation != null && !android.allowInheritance && !android.allowMultipleImplementations
    )
  }

  /** The C++ class holding the Kotlin instance, e.g. `JHybridImageSpec`. */
  get jniName(): string {
    const name = getHybridObjectName(this.hybridObjectName)
    if (this.sourceConfig.isExternalConfig) {
      // fully qualified name like "margelo::nitro::image::JHybridImageSpec"
      return this.sourceConfig.getCxxNamespace('c++', name.JHybridTSpec)
    }
    return name.JHybridTSpec
  }
  get fromCppReturnType(): string {
    // Converting from C++ returns the global reference the C++ part already holds.
    const jniType = this.getCode('c++', { context: 'type-argument' })
    return `jni::global_ref<${jniType}>`
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    const android = this.platforms.android
    if (android == null) {
      throw new Error(`HybridObject "${this.hybridObjectName}" is not implemented on Android and cannot be referenced from Kotlin.`)
    }
    if (android.language !== 'kotlin') {
      throw new Error(
        `HybridObject "${this.hybridObjectName}" is implemented in ${android.language} on Android, but this reference requires Kotlin. Cross-language HybridObject references are currently supported only in C++ APIs.`
      )
    }

    switch (language) {
      case 'c++':
        return getJniReferenceCode(`${this.jniName}::JavaPart`, options.context)
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
            return `${value}->getJavaPart()`
          case 'kotlin': {
            const name = getHybridObjectName(this.hybridObjectName)
            return `${value}->get${name.JHybridTSpec}()`
          }
        }
    }
  }

  getJniNativeRegistrations(): readonly JNINativeRegistration[] {
    if (this.sourceConfig.isExternalConfig) return []
    const name = getHybridObjectName(this.hybridObjectName)
    return [
      {
        namespace: this.sourceConfig.getCxxNamespace('c++').split('::'),
        className: `${name.JHybridTSpec}::CxxPart`,
        import: {
          language: 'c++',
          declaration: this.sourceConfig.getCxxHeader(`${name.JHybridTSpec}.hpp`, 'private'),
        },
      },
    ]
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = this.type.getRequiredImports(language)
    switch (language) {
      case 'c++': {
        const name = getHybridObjectName(this.hybridObjectName)
        imports.push({
          language: language,
          declaration: this.sourceConfig.getCxxHeader(`${name.JHybridTSpec}.hpp`, 'private'),
        })
        break
      }
    }
    return imports
  }
}
