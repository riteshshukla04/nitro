import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions } from '../../types/Type.js'
import { indent } from '../../../utils.js'
import type { SourceImport } from '../../SourceFile.js'
import { ArrayType } from '../../types/ArrayType.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType } from './KotlinType.js'

export class KotlinArrayType extends ArrayType implements KotlinType {
  override readonly itemType: KotlinType
  readonly jniValueKind = 'wrapper'

  constructor(readonly type: ArrayType) {
    const itemType = wrapKotlinType(type.itemType)
    super(itemType)
    this.itemType = itemType
  }

  get needsKotlinConversion(): boolean {
    return this.itemType.needsKotlinConversion
  }
  /** fbjni arrays of JNI primitives copy whole regions instead of single elements. */
  private get jniPrimitiveArrayType(): string | undefined {
    switch (this.itemType.kind) {
      case 'number':
        return 'jni::JArrayDouble'
      case 'boolean':
        return 'jni::JArrayBoolean'
      case 'int64':
      case 'uint64':
        // ULong is reinterpreted as Long.
        return 'jni::JArrayLong'
      default:
        return undefined
    }
  }
  get jniArrayType(): string {
    const itemType = this.itemType.getCode('c++', { context: 'type-argument' })
    return this.jniPrimitiveArrayType ?? `jni::JArrayClass<${itemType}>`
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
        switch (conversion.from) {
          case 'c++':
            return this.getCppToJniCode(value)
          case 'kotlin':
            return this.getJniToCppCode(value)
        }
    }
  }

  private getCppToJniCode(value: string): string {
    const arrayType = this.jniArrayType
    const arrayReference = this.getCode('c++', { context: 'value' })
    if (this.jniPrimitiveArrayType != null) {
      if (this.itemType.kind === 'boolean' || this.itemType.kind === 'uint64') {
        // vector<bool> is packed, and uint64_t is not JNI's signed jlong.
        const primitive = this.itemType.kind === 'boolean' ? 'jboolean' : 'jlong'
        return `
[&](const auto& __input) {
  size_t __size = __input.size();
  std::vector<${primitive}> __elements;
  __elements.reserve(__size);
  for (auto __element : __input) {
    __elements.push_back(static_cast<${primitive}>(__element));
  }
  ${arrayReference} __array = ${arrayType}::newArray(__size);
  __array->setRegion(0, __size, __elements.data());
  return __array;
}(${value})
`.trim()
      }
      // primitive arrays can be constructed more efficiently with region/batch access.
      // no need to iterate through the entire array.
      return `
[&]() {
  size_t __size = ${value}.size();
  ${arrayReference} __array = ${arrayType}::newArray(__size);
  __array->setRegion(0, __size, ${value}.data());
  return __array;
}()
`.trim()
    }
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
    if (this.jniPrimitiveArrayType != null) {
      if (this.itemType.kind === 'boolean' || this.itemType.kind === 'uint64') {
        const primitive = this.itemType.kind === 'boolean' ? 'jboolean' : 'jlong'
        return `
[&]() {
  size_t __size = ${value}->size();
  std::vector<${primitive}> __elements(__size);
  ${value}->getRegion(0, __size, __elements.data());
  std::vector<${itemType}> __vector;
  __vector.reserve(__size);
  for (auto __element : __elements) {
    __vector.push_back(static_cast<${itemType}>(__element));
  }
  return __vector;
}()
`.trim()
      }
      // primitive arrays can use region/batch access,
      // which we can use to construct the vector directly instead of looping through it.
      return `
[&]() {
  size_t __size = ${value}->size();
  std::vector<${itemType}> __vector(__size);
  ${value}->getRegion(0, __size, __vector.data());
  return __vector;
}()
`.trim()
    }
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
      case 'c++':
        return getJniReferenceCode(this.jniArrayType, options)
      case 'kotlin':
        if (this.itemType.kind === 'uint64') return 'LongArray'
        return super.getCode(language, options)
      default:
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    return [...this.type.getRequiredImports(language), ...this.itemType.getRequiredImports(language)]
  }
}
