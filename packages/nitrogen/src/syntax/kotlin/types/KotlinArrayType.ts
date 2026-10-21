import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import { indent } from '../../../utils.js'
import type { SourceImport } from '../../SourceFile.js'
import { ArrayType } from '../../types/ArrayType.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxArrayType } from './KotlinCxxArrayType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinArrayType extends ArrayType implements KotlinType {
  override readonly itemType: KotlinType
  readonly jniValueKind = 'wrapper'

  constructor(readonly type: ArrayType) {
    const itemType = wrapKotlinType(type.itemType)
    super(itemType)
    this.itemType = itemType
  }

  private get canConvertDirectly(): boolean {
    switch (this.itemType.kind) {
      case 'number':
      case 'boolean':
      case 'int64':
      case 'uint64':
        return true
      default:
        return this.itemType.getJSIType?.() != null
    }
  }

  getJSIType(): this | undefined {
    if (!this.canConvertDirectly) return undefined
    return this
  }

  getCppConverter(cppType: Type): KotlinCppConverter | undefined {
    if (!this.canConvertDirectly) return undefined
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
      case 'c++':
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
          case 'c++':
            return this.getCppToJniCode(value)
          case 'kotlin':
            return this.getJniToCppCode(value)
        }
    }
  }

  private getCppToJniCode(value: string): string {
    const arrayType = this.getCode('c++', { context: 'type-argument' })
    const arrayReference = this.getCode('c++', { context: 'value' })
    // other arrays need to loop through.
    // we wrap the lambda with a parameter (`__input`) so that nested arrays
    // don't end up shadowing `__element` in their own initializers
    // (which would be `const auto& __element = __element[__i]`,
    //  an invalid self-referential `auto`-type deduction).
    // `auto&&` is a forwarding reference so it binds to both const and
    // non-const inputs across nesting levels.
    const jniElement = this.itemType.convert('__element', {
      from: 'c++',
      to: 'kotlin',
      in: 'c++',
    })
    let jniObject: string
    switch (this.itemType.jniValueKind) {
      case 'pointer':
        jniObject = '__elementJni.get()'
        break
      case 'primitive':
      case 'wrapper':
        jniObject = '*__elementJni'
        break
    }
    return `
[&](auto&& __input) {
  size_t __size = __input.size();
  ${arrayReference} __array = ${arrayType}::newArray(__size);
  for (size_t __i = 0; __i < __size; __i++) {
    const auto& __element = __input[__i];
    auto __elementJni = ${indent(jniElement, '    ')};
    __array->setElement(__i, ${jniObject});
  }
  return __array;
}(${value})
`.trim()
  }

  private getJniToCppCode(value: string): string {
    const itemType = this.type.itemType.getCode('c++', {
      context: 'type-argument',
    })
    // other arrays need to loop through.
    // we wrap the lambda with a parameter (`__input`) so that nested arrays
    // don't end up shadowing `__element` in their own initializers
    // (which would be `auto __element = __element->getElement(__i)`,
    //  an invalid self-referential `auto`-type deduction).
    // `auto&&` is a forwarding reference so it binds to both const and
    // non-const inputs across nesting levels (and to JNI `local_ref`s,
    // which expose non-const `getElement(...)`).
    const cppElement = this.itemType.convert('__element', {
      from: 'kotlin',
      to: 'c++',
      in: 'c++',
    })
    return `
[&](auto&& __input) {
  size_t __size = __input->size();
  std::vector<${itemType}> __vector;
  __vector.reserve(__size);
  for (size_t __i = 0; __i < __size; __i++) {
    auto __element = __input->getElement(__i);
    __vector.push_back(${indent(cppElement, '    ')});
  }
  return __vector;
}(${value})
`.trim()
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
    const imports = [...this.type.getRequiredImports(language), ...this.itemType.getRequiredImports(language)]
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
        if (this.canConvertDirectly) {
          imports.push(
            { language: language, declaration: { header: 'NitroModules/JNIConverter+Array.hpp', space: 'system' } },
            { language: language, declaration: { header: jsiConverterHeader, space: 'system' } }
          )
        }
        break
      }
      case 'kotlin':
      case 'swift':
        break
    }
    return imports
  }
}
