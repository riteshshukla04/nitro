import type { Language } from '../../../getPlatformSpecs.js'
import type { GetCodeOptions, Type } from '../../types/Type.js'
import { indent } from '../../../utils.js'
import type { SourceImport } from '../../SourceFile.js'
import { PromiseType } from '../../types/PromiseType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxPromiseType } from './KotlinCxxPromiseType.js'
import { wrapKotlinType } from '../wrapKotlinType.js'
import { getJniReferenceCode, type KotlinConversion, type KotlinType, type KotlinTypeOptions } from './KotlinType.js'

export class KotlinPromiseType extends PromiseType implements KotlinType {
  override readonly resultingType: KotlinType
  readonly jniValueKind = 'wrapper'
  get needsKotlinConversion(): boolean {
    return this.resultingType.needsKotlinConversion
  }

  constructor(
    readonly type: PromiseType,
    options: KotlinTypeOptions = {}
  ) {
    // JNI resolves promises with objects, so primitive results are boxed.
    const resultingType = wrapKotlinType(type.resultingType, { boxed: true, config: options.config })
    super(resultingType)
    this.resultingType = resultingType
  }

  private get canConvertDirectly(): boolean {
    return this.resultingType.kind === 'void' || this.resultingType.getJSIType?.() != null
  }

  getJSIType(): this | undefined {
    if (!this.canConvertDirectly) return undefined
    return this
  }

  getCppConverter(cppType: Type): KotlinCppConverter | undefined {
    if (!this.canConvertDirectly) return undefined
    return new KotlinCxxPromiseType(getTypeAs(cppType, PromiseType), this).getConverter()
  }

  convert(value: string, conversion: KotlinConversion): string {
    switch (conversion.in) {
      case 'kotlin': {
        if (!this.needsKotlinConversion) return value
        const resultingType = conversion.from === 'c++' ? this.type.resultingType : this.resultingType
        const resultType = resultingType.getCode('kotlin', {
          context: 'type-argument',
        })
        const result = this.resultingType.convert('__result', conversion)
        return `${value}.let { __source -> Promise<${resultType}>().also { __promise -> __source.then { __result -> __promise.resolve(${result}) }.catch { __promise.reject(it) } } }`
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
    let resolveListenerCode: string
    if (this.resultingType.kind === 'void') {
      // void: resolve()
      resolveListenerCode = `
${value}.addOnResolvedListener([=]() {
  jni::ThreadScope::WithClassLoader([&] {
    __promise->resolve(JUnit::instance());
  });
});
`.trim()
    } else {
      // T: resolve(T)
      const resolvingType = this.type.resultingType.getCode('c++', {
        context: 'type-argument',
      })
      const jniResult = this.resultingType.convert('__result', {
        from: 'c++',
        to: 'kotlin',
        in: 'c++',
      })
      const jniResultType = this.resultingType.fromCppReturnType ?? this.resultingType.getCode('c++', { context: 'return' })
      resolveListenerCode = `
${value}.addOnResolvedListener([=](const ${resolvingType}& __result) {
  jni::ThreadScope::WithClassLoader([&] {
    std::optional<${jniResultType}> __converted;
    try {
      __converted.emplace(${indent(jniResult, '      ')});
    } catch (...) {
      __promise->reject(std::current_exception());
      return;
    }
    __promise->resolve(*__converted);
  });
});
`.trim()
    }
    return `
[&]() {
  jni::local_ref<JPromise::JavaPart> __localPromise = JPromise::create();
  auto __promise = JNISharedPtr::make_shared_from_jni<JPromise>(jni::make_global(__localPromise));
  ${indent(resolveListenerCode, '  ')}
  ${value}.addOnRejectedListener([=](const std::exception_ptr& __error) {
    jni::ThreadScope::WithClassLoader([&] {
      __promise->reject(__error);
    });
  });
  return __localPromise;
}()
`.trim()
  }
  private getJniToCppCode(value: string): string {
    const actualCppType = this.type.resultingType.getCode('c++', {
      context: 'type-argument',
    })
    let resolveListenerCode: string
    if (this.resultingType.kind === 'void') {
      // it's a Promise<void>
      resolveListenerCode = `
${value}->cthis()->addOnResolvedListener([=](const jni::alias_ref<jni::JObject>& /* unit */) {
  __promise.resolve();
});
`.trim()
    } else {
      // it's a Promise<T>
      const jniResultType = this.resultingType.getCode('c++', {
        context: 'type-argument',
      })
      const cppResult = this.resultingType.convert('__result', {
        from: 'kotlin',
        to: 'c++',
        in: 'c++',
      })
      resolveListenerCode = `
${value}->cthis()->addOnResolvedListener([=](const jni::alias_ref<jni::JObject>& __boxedResult) {
  std::optional<${actualCppType}> __converted;
  try {
    auto __result = jni::static_ref_cast<${jniResultType}>(__boxedResult);
    __converted.emplace(${indent(cppResult, '    ')});
  } catch (...) {
    __promise.reject(std::current_exception());
    return;
  }
  __promise.resolve(std::move(*__converted));
});
`.trim()
    }
    return `
[&]() {
  auto __promise = Promise<${actualCppType}>::pending();
  ${indent(resolveListenerCode, '  ')}
  ${value}->cthis()->addOnRejectedListener([=](const jni::alias_ref<jni::JThrowable>& __throwable) {
    jni::JniException __jniError(__throwable);
    __promise.reject(std::make_exception_ptr(__jniError));
  });
  return __promise;
}()
`.trim()
  }
  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        if (!this.canConvertDirectly) return getJniReferenceCode('JPromise::JavaPart', options)
        const result = this.resultingType.getCode(language, { ...options, context: 'value' })
        return getJniReferenceCode(`JTypedPromise<${result}>`, options)
      }
      case 'kotlin':
        return super.getCode(language, options)
      case 'swift':
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    const imports = this.type.getRequiredImports(language)
    switch (language) {
      case 'c++':
        if (this.canConvertDirectly) {
          imports.push(
            { language: language, declaration: { header: 'NitroModules/JNIConverter+Promise.hpp', space: 'system' } },
            { language: language, declaration: { header: 'NitroModules/JSIConverter+JTypedPromise.hpp', space: 'system' } }
          )
          break
        }
        imports.push(
          { language: language, declaration: { header: 'optional', space: 'system' } },
          {
            language: language,
            declaration: { header: 'NitroModules/JPromise.hpp', space: 'system' },
          },
          {
            language: language,
            declaration: {
              header: 'NitroModules/JNISharedPtr.hpp',
              space: 'system',
            },
          }
        )
        if (this.resultingType.kind === 'void') {
          // Promise<void> resolves with JUnit
          imports.push({
            language: language,
            declaration: { header: 'NitroModules/JUnit.hpp', space: 'system' },
          })
        }
        break
    }
    imports.push(...this.resultingType.getRequiredImports(language))
    return imports
  }
}
