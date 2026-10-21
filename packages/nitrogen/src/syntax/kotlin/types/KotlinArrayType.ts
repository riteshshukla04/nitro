import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import type { SourceImport } from '../../SourceFile.js'
import { ArrayType } from '../../types/ArrayType.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxArrayType } from './KotlinCxxArrayType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType, type KotlinTypeOptions } from './KotlinType.js'

export class KotlinArrayType extends ArrayType implements KotlinType {
  override readonly itemType: KotlinType
  readonly jniValueKind = 'object'

  constructor(
    readonly type: ArrayType,
    options: KotlinTypeOptions = {}
  ) {
    const itemType = wrapKotlinType(type.itemType, { config: options.config })
    super(itemType)
    this.itemType = itemType
  }

  getCppConverter(cppType: Type): KotlinCppConverter {
    return new KotlinCxxArrayType(getTypeAs(cppType, ArrayType), this).getConverter()
  }

  get needsKotlinConversion(): boolean {
    return this.itemType.needsKotlinConversion
  }
  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin': {
        if (!this.needsKotlinConversion) return value
        const item = this.itemType.convert('__item', conversion)
        const resultType = conversion.from === 'c++' ? this.type.itemType : this.itemType
        const resultCode = resultType.getCode('kotlin', {
          context: 'type-argument',
        })
        const toArray = this.itemType.kind === 'uint64' && conversion.from === 'kotlin' ? 'toLongArray()' : `toTypedArray<${resultCode}>()`
        return `${value}.map { __item -> ${item} }.${toArray}`
      }
      case 'c++': {
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
    }
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        let jniType: string
        switch (this.itemType.kind) {
          case 'number':
            jniType = 'jni::JArrayDouble'
            break
          case 'boolean':
            jniType = 'jni::JArrayBoolean'
            break
          case 'int64':
            jniType = 'jni::JArrayLong'
            break
          case 'uint64':
            jniType = 'JArrayUInt64'
            break
          default: {
            const item = this.itemType.getCode(language, { ...options, context: 'type-argument' })
            jniType = `jni::JArrayClass<${item}>`
            break
          }
        }
        return getJniReferenceCode(jniType, options)
      }
      case 'kotlin':
        switch (this.itemType.kind) {
          case 'number':
            return 'DoubleArray'
          case 'boolean':
            return 'BooleanArray'
          case 'int64':
          case 'uint64':
            return 'LongArray'
          default: {
            const item = this.itemType.getCode(language, { ...options, context: 'type-argument' })
            return `Array<${item}>`
          }
        }
      case 'swift':
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = this.itemType.getRequiredImports(language)
    switch (language) {
      case 'c++': {
        let jsiConverterHeader: string
        switch (this.itemType.kind) {
          case 'number':
          case 'boolean':
          case 'int64':
          case 'uint64':
            jsiConverterHeader = 'NitroModules/JSIConverter+JPrimitiveArray.hpp'
            break
          default:
            jsiConverterHeader = 'NitroModules/JSIConverter+JArrayClass.hpp'
            break
        }
        imports.push(
          { language: language, declaration: { header: 'NitroModules/JNIConverter+Array.hpp', space: 'system' } },
          { language: language, declaration: { header: jsiConverterHeader, space: 'system' } }
        )
        break
      }
      case 'kotlin':
      case 'swift':
        imports.push(...this.type.getRequiredImports(language))
        break
    }
    return imports
  }
}
