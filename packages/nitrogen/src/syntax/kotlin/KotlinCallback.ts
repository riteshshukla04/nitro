import { indent } from '../../utils.js'
import { createFileMetadataString, isNotDuplicate } from '../helpers.js'
import type { SourceFile } from '../SourceFile.js'
import type { KotlinCallbackType } from './types/KotlinCallbackType.js'
import { getImportCode, getImportsCode } from '../getImportCode.js'

export function createKotlinCallback(callbackType: KotlinCallbackType): SourceFile[] {
  const publicType = callbackType.type
  const name = callbackType.specializationName
  const jniName = callbackType.jniName
  const packageName = callbackType.config.getAndroidPackage('java/kotlin')
  const kotlinReturnType = publicType.returnType.getCode('kotlin', {
    context: 'return',
  })
  const kotlinParams = publicType.parameters.map((p) => {
    const type = p.getCode('kotlin', { context: 'parameter' })
    return `${p.escapedName}: ${type}`
  })
  const kotlinParamTypes = publicType.parameters.map((p) => p.getCode('kotlin', { context: 'parameter' }))
  const kotlinParamsForward = publicType.parameters.map((p) => p.escapedName)
  const lambdaSignature = `(${kotlinParamTypes.join(', ')}) -> ${kotlinReturnType}`

  const bridgeReturnType = callbackType.returnType.getCode('kotlin', {
    context: 'return',
  })
  const bridgeParams = callbackType.parameters.map((p) => `${p.escapedName}: ${p.getCode('kotlin', { context: 'parameter' })}`)
  const toBridgeArguments = callbackType.parameters.map((p) => p.convert(p.escapedName, { from: 'kotlin', to: 'c++', in: 'kotlin' }))
  const fromBridgeArguments = callbackType.parameters.map((p) => p.convert(p.escapedName, { from: 'c++', to: 'kotlin', in: 'kotlin' }))
  const invokeNative = `invoke_cxx(${toBridgeArguments.join(', ')})`
  const invokeKotlin = `invoke(${fromBridgeArguments.join(', ')})`
  const nativeResult = callbackType.returnType.convert('__result', {
    from: 'c++',
    to: 'kotlin',
    in: 'kotlin',
  })
  const kotlinResult = callbackType.returnType.convert('__result', {
    from: 'kotlin',
    to: 'c++',
    in: 'kotlin',
  })
  let kotlinToCppBody: string
  let cppToKotlinBody: string
  if (publicType.returnType.kind === 'void') {
    kotlinToCppBody = invokeNative
    cppToKotlinBody = invokeKotlin
  } else {
    kotlinToCppBody = `
val __result = ${invokeNative}
return ${nativeResult}
`.trim()
    cppToKotlinBody = `
val __result = ${invokeKotlin}
return ${kotlinResult}
`.trim()
  }

  const extraImports = publicType
    .getRequiredImports('kotlin')
    .map((i) => getImportCode(i))
    .filter(isNotDuplicate)

  const kotlinCode = `
${createFileMetadataString(`${name}.kt`)}

package ${packageName}

import androidx.annotation.Keep
import com.facebook.jni.HybridData
import com.facebook.proguard.annotations.DoNotStrip
${extraImports.join('\n')}

/**
 * Represents the JavaScript callback \`${publicType.jsName}\`.
 * This can be either implemented in C++ (in which case it might be a callback coming from JS),
 * or in Kotlin/Java (in which case it is a native callback).
 */
@DoNotStrip
@Keep
@Suppress("ClassName", "RedundantUnitReturnType")
fun interface ${name}: ${lambdaSignature} {
  /**
   * Call the given JS callback.
   * @throws Throwable if the JS function itself throws an error, or if the JS function/runtime has already been deleted.
   */
  @DoNotStrip
  @Keep
  override fun invoke(${kotlinParams.join(', ')}): ${kotlinReturnType}

  // JNI uses this signature to avoid erased FunctionN and unsigned value types.
  @DoNotStrip
  @Keep
  fun invoke_jni(${bridgeParams.join(', ')}): ${bridgeReturnType} {
    ${indent(cppToKotlinBody, '    ')}
  }
}

/**
 * Represents the JavaScript callback \`${publicType.jsName}\`.
 * This is implemented in C++, via a \`Callback<...>\`.
 * The callback might be coming from JS.
 */
@DoNotStrip
@Keep
@Suppress(
  "KotlinJniMissingFunction", "unused",
  "RedundantSuppression", "RedundantUnitReturnType", "FunctionName",
  "ConvertSecondaryConstructorToPrimary", "ClassName", "LocalVariableName",
)
class ${name}_cxx: ${name} {
  @DoNotStrip
  @Keep
  private val mHybridData: HybridData

  @DoNotStrip
  @Keep
  private constructor(hybridData: HybridData) {
    mHybridData = hybridData
  }

  @DoNotStrip
  @Keep
  override fun invoke(${kotlinParams.join(', ')}): ${kotlinReturnType} {
    ${indent(kotlinToCppBody, '    ')}
  }

  @DoNotStrip
  @Keep
  private external fun invoke_cxx(${bridgeParams.join(', ')}): ${bridgeReturnType}
}

/**
 * Represents the JavaScript callback \`${publicType.jsName}\`.
 * This is implemented in Java/Kotlin, via a \`${lambdaSignature}\`.
 * The callback is always coming from native.
 */
@DoNotStrip
@Keep
@Suppress("ClassName", "RedundantUnitReturnType", "unused")
class ${name}_java(private val callback: ${lambdaSignature}): ${name} {
  @DoNotStrip
  @Keep
  override fun invoke(${kotlinParams.join(', ')}): ${kotlinReturnType} {
    return this.callback(${kotlinParamsForward.join(', ')})
  }
}
  `.trim()

  const jniInterfaceDescriptor = callbackType.config.getAndroidPackage('c++/jni', name)
  const jniClassDescriptor = callbackType.config.getAndroidPackage('c++/jni', `${name}_cxx`)
  const returnType = callbackType.returnType
  const cxxNamespace = callbackType.config.getCxxNamespace('c++')
  const valueReturnType = returnType.getCode('c++', { context: 'value', fullyQualified: true, representation: 'jsi' })
  const valueParameters = callbackType.parameters.map((p) =>
    p.type.getCode('c++', { context: 'value', fullyQualified: true, representation: 'jsi' })
  )
  const valueSignature = `${valueReturnType}(${valueParameters.join(', ')})`
  const retainedReturnType = `JNIRetainedValue<${valueReturnType}>::Type`
  const retainedParameters = callbackType.parameters.map((p) => {
    const type = p.type.getCode('c++', { context: 'value', fullyQualified: true, representation: 'jsi' })
    return `JNIRetainedValue<${type}>::Type ${p.escapedName}`
  })
  const nativeParams = callbackType.parameters.map((p) => `${p.getCode('c++', { context: 'parameter' })} ${p.escapedName}`)
  const paramsForward = callbackType.parameters.map((p) => p.escapedName)
  const jniParamsForward = callbackType.parameters.map((p) => {
    const type = p.type.getCode('c++', { context: 'value', fullyQualified: true, representation: 'jsi' })
    return `JNIRetainedValue<${type}>::borrow(${p.escapedName})`
  })
  const jniReturnType = returnType.getCode('c++', { context: 'return' })
  const jniParamTypes = callbackType.parameters.map((p) => p.getCode('c++', { context: 'parameter' }))
  const jniSignature = `${jniReturnType}(${jniParamTypes.join(', ')})`
  let invokeCode: string
  if (returnType.kind === 'void') {
    const argumentsCode = ['self()', ...jniParamsForward].join(', ')
    invokeCode = `
__method(${argumentsCode});
`.trim()
  } else {
    const argumentsCode = ['self()', ...jniParamsForward].join(', ')
    invokeCode = `
auto result = __method(${argumentsCode});
return JNIRetainedValue<${valueReturnType}>::retain(result);
`.trim()
  }
  const imports = [...returnType.getRequiredImports('c++'), ...callbackType.parameters.flatMap((p) => p.getRequiredImports('c++'))]
  const declarationIncludes = getImportsCode(imports, 'declaration')
  const implementationIncludes = getImportsCode(
    [{ language: 'c++', declaration: callbackType.config.getCxxHeader(`${jniName}.hpp`, 'private') }, ...imports],
    'implementation'
  )
  const fbjniCode = `
${createFileMetadataString(`${jniName}.hpp`)}

#pragma once

#include <NitroModules/JNICallback.hpp>
#include <NitroModules/JSIConverter+JNICallback.hpp>
${declarationIncludes}

namespace ${cxxNamespace} {

  namespace jni = facebook::jni;

  class ${jniName}_cxx;

  struct ${jniName} : jni::JavaClass<${jniName}> {
    static constexpr auto kJavaDescriptor = "L${jniInterfaceDescriptor};";
    using CxxPart = ${jniName}_cxx;
    using NativeSignature = JNICallbackState<${valueSignature}>::Signature;

    ${retainedReturnType} invoke(${retainedParameters.join(', ')}) const;
  };

  class ${jniName}_cxx final : public jni::HybridClass<${jniName}_cxx, ${jniName}> {
  public:
    using CallbackType = Callback<${jniName}::NativeSignature>;
    static constexpr auto kJavaDescriptor = "L${jniClassDescriptor};";

    static jni::local_ref<${jniName}> create(CallbackType callback, bool isInline);
    ${jniReturnType} invoke_cxx(${nativeParams.join(', ')});
    const CallbackType& getCallback() const { return _state.getCallback(); }
    static void registerNatives();

  private:
    friend HybridBase;
    explicit ${jniName}_cxx(CallbackType callback, bool isInline);
    JNICallbackState<${valueSignature}> _state;
  };

} // namespace ${cxxNamespace}
`.trim()

  const fbjniImplementationCode = `
${createFileMetadataString(`${jniName}.cpp`)}

${implementationIncludes}

namespace ${cxxNamespace} {

  ${retainedReturnType} ${jniName}::invoke(${retainedParameters.join(', ')}) const {
    static const auto __method = javaClassStatic()->getMethod<${jniSignature}>("invoke_jni");
    ${indent(invokeCode, '    ')}
  }

  jni::local_ref<${jniName}> ${jniName}_cxx::create(CallbackType callback, bool isInline) {
    return newObjectCxxArgs(std::move(callback), isInline);
  }

  ${jniReturnType} ${jniName}_cxx::invoke_cxx(${nativeParams.join(', ')}) {
    return _state.invoke(${paramsForward.join(', ')});
  }

  void ${jniName}_cxx::registerNatives() {
    registerHybrid({makeNativeMethod("invoke_cxx", ${jniName}_cxx::invoke_cxx)});
  }

  ${jniName}_cxx::${jniName}_cxx(CallbackType callback, bool isInline) : _state(std::move(callback), isInline) {}

} // namespace ${cxxNamespace}
`.trim()

  const files: SourceFile[] = []
  files.push({
    content: kotlinCode,
    language: 'kotlin',
    name: `${name}.kt`,
    subdirectory: callbackType.config.getAndroidPackageDirectory(),
    platform: 'android',
  })
  files.push({
    content: fbjniCode,
    language: 'c++',
    name: `${jniName}.hpp`,
    subdirectory: [],
    platform: 'android',
  })
  files.push({
    content: fbjniImplementationCode,
    language: 'c++',
    name: `${jniName}.cpp`,
    subdirectory: [],
    platform: 'android',
  })
  return files
}
