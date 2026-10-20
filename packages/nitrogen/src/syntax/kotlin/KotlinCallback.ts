import { NitroConfig } from '../../config/NitroConfig.js'
import { indent } from '../../utils.js'
import { createFileMetadataString, isNotDuplicate } from '../helpers.js'
import type { SourceFile } from '../SourceFile.js'
import type { KotlinCallbackType } from './types/KotlinCallbackType.js'
import { getImportCode, getImportsCode } from '../getImportCode.js'
import { CallbackType } from '../types/CallbackType.js'

export function createKotlinCallback(callbackType: KotlinCallbackType): SourceFile[] {
  const publicType = callbackType.type
  const name = callbackType.specializationName
  const jniName = callbackType.jniName
  const packageName = NitroConfig.current.getAndroidPackage('java/kotlin')
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

  const jniInterfaceDescriptor = NitroConfig.current.getAndroidPackage('c++/jni', name)
  const jniClassDescriptor = NitroConfig.current.getAndroidPackage('c++/jni', `${name}_cxx`)
  const returnType = callbackType.returnType
  const cxxNamespace = NitroConfig.current.getCxxNamespace('c++')
  const typename = publicType.getCode('c++', { context: 'value' })
  // Inline and owning variants of a signature share this file, so it always
  // accepts an `InlineCallback` and escapes it into the callback it holds.
  const inlineType = new CallbackType(publicType.returnType, publicType.parameters, true)
  const inlineParameterType = inlineType.getCode('c++', {
    context: 'parameter',
  })

  // call() Java -> C++
  const cppParams = callbackType.parameters.map((p) => {
    const type = p.getCode('c++', { context: 'parameter' })
    return `${type} ${p.escapedName}`
  })
  const paramsForward = callbackType.parameters.map((p) => p.convert(p.escapedName, { from: 'kotlin', to: 'c++', in: 'c++' }))

  // call() C++ -> Java
  const jniParams = publicType.parameters.map((p) => {
    const type = p.getCode('c++', { context: 'parameter' })
    return `${type} ${p.escapedName}`
  })
  const jniParamsForward = [
    'self()',
    ...callbackType.parameters.map((p) => p.convert(p.escapedName, { from: 'c++', to: 'kotlin', in: 'c++' })),
  ]
  const jniReturnType = returnType.getCode('c++', {
    context: 'return',
  })
  const jniParamTypes = callbackType.parameters.map((p) => {
    const type = p.getCode('c++', { context: 'parameter' })
    return `${type} /* ${p.escapedName} */`
  })
  const jniSignature = `${jniReturnType}(${jniParamTypes.join(', ')})`

  let cppCallBody: string
  let jniCallBody: string
  if (returnType.kind === 'void') {
    // It returns void
    cppCallBody = `
if (_isInline) {
  _callback.callSync(${paramsForward.join(', ')});
} else {
  _callback.callAndForget(${paramsForward.join(', ')});
}
`.trim()
    jniCallBody = `
static const auto __method = javaClassStatic()->getMethod<${jniSignature}>("invoke_jni");
__method(${jniParamsForward.join(', ')});
    `.trim()
  } else {
    // It returns a type!
    const cppResultType = publicType.returnType.getCode('c++', {
      context: 'value',
    })
    const jniResult = returnType.convert('__result', {
      from: 'c++',
      to: 'kotlin',
      in: 'c++',
    })
    const cppResult = returnType.convert('__result', {
      from: 'kotlin',
      to: 'c++',
      in: 'c++',
    })
    cppCallBody = `
${cppResultType} __result = _callback.callSync(${paramsForward.join(', ')});
return ${jniResult};
`.trim()
    jniCallBody = `
static const auto __method = javaClassStatic()->getMethod<${jniSignature}>("invoke_jni");
auto __result = __method(${jniParamsForward.join(', ')});
return ${cppResult};
    `.trim()
  }

  const fbjniReturnType = returnType.fromCppReturnType ?? returnType.getCode('c++', { context: 'return' })
  const cppReturnType = publicType.returnType.getCode('c++', {
    context: 'return',
  })
  const kotlinCallbackType = publicType.getCode('kotlin', { context: 'value' })

  const imports = [
    ...inlineType.getRequiredImports('c++'),
    ...returnType.getRequiredImports('c++'),
    ...callbackType.parameters.flatMap((p) => p.getRequiredImports('c++')),
  ]
  const declarationIncludes = imports.map((i) => getImportCode(i, 'declaration')).filter(isNotDuplicate)
  const implementationIncludes = getImportsCode(
    [
      {
        language: 'c++',
        declaration: NitroConfig.current.getCxxHeader(`${jniName}.hpp`, 'private'),
      },
      ...imports,
    ],
    'implementation'
  )

  const fbjniCode = `
${createFileMetadataString(`${jniName}.hpp`)}

#pragma once

#include <fbjni/fbjni.h>
#include <functional>

${declarationIncludes.join('\n')}

namespace ${cxxNamespace} {

  namespace jni = facebook::jni;

  /**
   * Represents the Java/Kotlin callback \`${kotlinCallbackType}\`.
   * This can be passed around between C++ and Java/Kotlin.
   */
  struct ${jniName} : public jni::JavaClass<${jniName}> {
  public:
    static constexpr auto kJavaDescriptor = "L${jniInterfaceDescriptor};";

  public:
    /**
     * Invokes the callback this \`${jniName}\` instance holds through JNI.
     */
    ${cppReturnType} invoke(${jniParams.join(', ')}) const;
  };

  /**
   * An implementation of ${name} that is backed by a C++ implementation (using \`Callback<...>\`)
   */
  class ${jniName}_cxx final : public jni::HybridClass<${jniName}_cxx, ${jniName}> {
  public:
    static jni::local_ref<${jniName}::javaobject> fromCpp(const ${typename}& callback);
    static jni::local_ref<${jniName}::javaobject> fromCpp(${inlineParameterType} callback);

  public:
    /**
     * Invokes the C++ \`Callback<...>\` this \`${jniName}_cxx\` instance holds.
     */
    ${fbjniReturnType} invoke_cxx(${cppParams.join(', ')});

  public:
    [[nodiscard]]
    inline const ${typename}& getCallback() const {
      return _callback;
    }

  public:
    static constexpr auto kJavaDescriptor = "L${jniClassDescriptor};";
    static void registerNatives();

  private:
    explicit ${jniName}_cxx(const ${typename}& callback, bool isInline);

  private:
    friend HybridBase;
    ${typename} _callback;
    bool _isInline;
  };

} // namespace ${cxxNamespace}
  `.trim()

  const fbjniImplementationCode = `
${createFileMetadataString(`${jniName}.cpp`)}

${implementationIncludes}

namespace ${cxxNamespace} {

  ${cppReturnType} ${jniName}::invoke(${jniParams.join(', ')}) const {
    ${indent(jniCallBody, '    ')}
  }

  jni::local_ref<${jniName}::javaobject> ${jniName}_cxx::fromCpp(const ${typename}& callback) {
    return newObjectCxxArgs(callback, false);
  }

  jni::local_ref<${jniName}::javaobject> ${jniName}_cxx::fromCpp(${inlineParameterType} callback) {
    return newObjectCxxArgs(callback.escape(), true);
  }

  ${fbjniReturnType} ${jniName}_cxx::invoke_cxx(${cppParams.join(', ')}) {
    ${indent(cppCallBody, '    ')}
  }

  void ${jniName}_cxx::registerNatives() {
    registerHybrid({makeNativeMethod("invoke_cxx", ${jniName}_cxx::invoke_cxx)});
  }

  ${jniName}_cxx::${jniName}_cxx(const ${typename}& callback, bool isInline): _callback(callback), _isInline(isInline) { }

} // namespace ${cxxNamespace}
  `.trim()

  const files: SourceFile[] = []
  files.push({
    content: kotlinCode,
    language: 'kotlin',
    name: `${name}.kt`,
    subdirectory: NitroConfig.current.getAndroidPackageDirectory(),
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
    jniNativeRegistrations: [
      {
        namespace: cxxNamespace.split('::'),
        className: `${jniName}_cxx`,
        import: {
          language: 'c++',
          declaration: NitroConfig.current.getCxxHeader(`${jniName}.hpp`, 'private'),
        },
      },
    ],
    language: 'c++',
    name: `${jniName}.cpp`,
    subdirectory: [],
    platform: 'android',
  })
  return files
}
