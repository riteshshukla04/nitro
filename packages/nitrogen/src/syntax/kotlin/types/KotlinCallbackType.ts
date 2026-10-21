import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import type { Type } from '../../types/Type.js'
import { KotlinCxxCallbackType } from './KotlinCxxCallbackType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { getKotlinConverter } from '../KotlinConverter.js'
import { CallbackType } from '../../types/CallbackType.js'
import { createKotlinCallback } from '../KotlinCallback.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import { KotlinNamedType } from './KotlinNamedType.js'
import {
  getJniReferenceCode,
  type GetKotlinCodeOptions,
  type JNINativeRegistration,
  type KotlinConversion,
  type KotlinType,
} from './KotlinType.js'

/**
 * JNI represents a callback as a Kotlin `fun interface`.
 * C++ callbacks implement it in `<name>_cxx`, and Kotlin lambdas in `<name>_java`.
 */
export class KotlinCallbackType extends CallbackType implements KotlinType {
  override readonly returnType: KotlinType
  override readonly parameters: KotlinNamedType[]
  readonly jniValueKind = 'object'
  readonly needsKotlinConversion = true

  constructor(
    readonly type: CallbackType,
    readonly config: NitroConfig = NitroConfig.current
  ) {
    const returnType = wrapKotlinType(type.returnType, { config: config })
    const parameters = type.parameters.map((p) => new KotlinNamedType(p.name, wrapKotlinType(p, { config: config })))
    super(returnType, parameters, type.isInline)
    this.returnType = returnType
    this.parameters = parameters
  }

  /** The interface name, derived from the C++ callback signature. */
  override get specializationName(): string {
    return this.type.specializationName
  }
  override get jsName(): string {
    return this.type.jsName
  }
  get jniName(): string {
    return `J${this.specializationName}`
  }

  convert(value: string, { from, in: language }: KotlinConversion): string {
    switch (language) {
      case 'kotlin':
        if (from === 'kotlin') {
          return `${value}.let { if (it is ${this.specializationName}) it else ${this.specializationName}_java(it) }`
        }
        return value
      case 'c++': {
        const converter = getKotlinConverter({ cppType: this.type, kotlinType: this })
        switch (from) {
          case 'c++':
            return `${converter}::toJNI(${value})`
          case 'kotlin':
            return `${converter}::fromJNI(${value})`
        }
      }
    }
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxCallbackType(getTypeAs(cppType, CallbackType), this).getConverter()
  }

  override getCode(language: Language, options: GetKotlinCodeOptions): string {
    switch (language) {
      case 'c++': {
        const jniClass = this.config.getCxxNamespace('c++', this.jniName)
        if (this.isBorrowed(options)) {
          // Kotlin can retain the callback, but JS Inline calls must stay synchronous.
          return getJniReferenceCode(`margelo::nitro::JInlineCallback<${jniClass}>`, options)
        }
        return getJniReferenceCode(jniClass, options)
      }
      case 'kotlin':
        return this.specializationName
      default:
        return super.getCode(language, options)
    }
  }

  getJniCode(options: GetKotlinCodeOptions): string {
    const jniClass = this.config.getCxxNamespace('c++', this.jniName)
    return getJniReferenceCode(jniClass, options)
  }

  getJniNativeRegistrations(): readonly JNINativeRegistration[] {
    if (this.config.isExternalConfig) return []
    return [
      {
        namespace: this.config.getCxxNamespace('c++').split('::'),
        className: `${this.jniName}_cxx`,
        import: {
          language: 'c++',
          declaration: this.config.getCxxHeader(`${this.jniName}.hpp`, 'private'),
        },
      },
    ]
  }

  override getExtraFiles(): SourceFile[] {
    if (this.config.isExternalConfig) return []
    return [
      ...this.returnType.getExtraFiles(),
      ...this.parameters.flatMap((parameter) => parameter.getExtraFiles()),
      ...createKotlinCallback(this),
    ]
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports: SourceImport[] = []
    switch (language) {
      case 'kotlin':
      case 'swift':
        imports.push(...this.type.getRequiredImports(language))
        break
      case 'c++':
        break
    }
    switch (language) {
      case 'c++':
        imports.push(
          {
            language: language,
            declaration: this.config.getCxxHeader(`${this.jniName}.hpp`, 'private'),
          },
          {
            language: language,
            declaration: {
              header: 'NitroModules/JNIConverter+Callback.hpp',
              space: 'system',
            },
          }
        )
        if (this.isInline) {
          imports.push({
            language: language,
            declaration: { header: 'NitroModules/JSIConverter+JInlineCallback.hpp', space: 'system' },
          })
        }
        break
    }
    imports.push(...this.returnType.getRequiredImports(language), ...this.parameters.flatMap((p) => p.getRequiredImports(language)))
    return imports
  }
}
