import { capitalizeName, indent } from '../../utils.js'
import { createFileMetadataString } from '../helpers.js'
import type { SourceFile } from '../SourceFile.js'
import type { KotlinStructType } from './types/KotlinStructType.js'
import { getImportCode, getImportsCode } from '../getImportCode.js'

export function createKotlinFallbackStruct(structType: KotlinStructType): SourceFile[] {
  const publicType = structType.type
  const packageName = structType.config.getAndroidPackage('java/kotlin')

  const properties = structType.properties
    .map((p) => {
      const type = p.getCode('kotlin', { context: 'property' })
      return `
@DoNotStrip
@Keep
val ${p.escapedName}: ${type}
`.trim()
    })
    .join(',\n')

  const cxxCreateFunctionParameters = structType.properties
    .map((p) => {
      const type = p.getCode('kotlin', { context: 'parameter' })
      return `${p.escapedName}: ${type}`
    })
    .join(', ')
  const cxxCreateFunctionForward = structType.properties.map((p) => p.escapedName).join(', ')

  const kotlinPropertyImports = publicType.properties.flatMap((type) => type.getRequiredImports('kotlin'))
  const extraImports = getImportsCode(kotlinPropertyImports)

  const secondaryConstructor = createKotlinConstructor(structType)

  const equalityComparators = structType.properties.map((p) => `Objects.deepEquals(this.${p.escapedName}, other.${p.escapedName})`)
  const propertiesList = structType.properties.map((p) => p.escapedName).join(',\n')

  const code = `
${createFileMetadataString(`${structType.structName}.kt`)}

package ${packageName}

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import java.util.Objects
${extraImports}

/**
 * Represents the JavaScript object/struct "${structType.structName}".
 */
@DoNotStrip
@Keep
data class ${structType.structName}(
  ${indent(properties, '  ')}
) {
  ${indent(secondaryConstructor, '  ')}

  override fun equals(other: Any?): Boolean {
    if (this === other) return true
    if (other !is ${structType.structName}) return false
    return ${equalityComparators.join(`\n      && `)}
  }

  override fun hashCode(): Int {
    return arrayOf<Any?>(
      ${indent(propertiesList, '      ')}
    ).contentDeepHashCode()
  }

  companion object {
    /**
     * Constructor called from C++
     */
    @DoNotStrip
    @Keep
    @Suppress("unused")
    @JvmStatic
    private fun fromCpp(${cxxCreateFunctionParameters}): ${structType.structName} {
      return ${structType.structName}(${cxxCreateFunctionForward})
    }
  }
}
  `.trim()

  const cxxNamespace = structType.config.getCxxNamespace('c++')
  const jniClassDescriptor = structType.config.getAndroidPackage('c++/jni', structType.structName)
  const jniStructInitializerBody = createJNIStructInitializer(structType)
  const cppStructInitializerBody = createCppStructInitializer({ cppValueName: 'value', structType: structType })
  const cppReturnType = publicType.getCode('c++', { context: 'return' })
  const cppParameterType = publicType.getCode('c++', { context: 'parameter' })
  const nativeImports = publicType.getRequiredImports('c++')
  const propertyImports = structType.properties.flatMap((property) => property.getRequiredImports('c++'))
  const implementationIncludes = getImportsCode(
    [...nativeImports, ...propertyImports, ...structType.getCppConverterDependencies().imports],
    'implementation'
  )
  const publicTypeInclude = getImportsCode(nativeImports, 'declaration')
  const jniTypeInclude = getImportCode({
    language: 'c++',
    declaration: structType.config.getCxxHeader(`${structType.jniName}.hpp`, 'private'),
  })

  const fbjniCode = `
${createFileMetadataString(`${structType.jniName}.hpp`)}

#pragma once

#include <fbjni/fbjni.h>
${publicTypeInclude}

namespace ${cxxNamespace} {

  namespace jni = facebook::jni;

  /**
   * The C++ JNI bridge between the C++ struct "${structType.structName}" and the Kotlin data class "${structType.structName}".
   */
  struct ${structType.jniName} final : public jni::JavaClass<${structType.jniName}> {
  public:
    static constexpr auto kJavaDescriptor = "L${jniClassDescriptor};";

  public:
    /**
     * Convert this Java/Kotlin-based struct to the C++ struct ${structType.structName} by copying all values to C++.
     */
    [[maybe_unused]]
    [[nodiscard]]
    ${cppReturnType} toCpp() const;

  public:
    /**
     * Create a Java/Kotlin-based struct by copying all values from the given C++ struct to Java.
     */
    [[maybe_unused]]
    static jni::local_ref<${structType.jniName}::javaobject> fromCpp(${cppParameterType} value);
  };

} // namespace ${cxxNamespace}
  `.trim()

  const fbjniImplementationCode = `
${createFileMetadataString(`${structType.jniName}.cpp`)}

${jniTypeInclude}

${implementationIncludes}

namespace ${cxxNamespace} {

  ${cppReturnType} ${structType.jniName}::toCpp() const {
    ${indent(jniStructInitializerBody, '    ')}
  }

  jni::local_ref<${structType.jniName}::javaobject> ${structType.jniName}::fromCpp(${cppParameterType} value) {
    ${indent(cppStructInitializerBody, '    ')}
  }

} // namespace ${cxxNamespace}
  `.trim()

  const files: SourceFile[] = []
  files.push({
    content: code,
    language: 'kotlin',
    name: `${structType.structName}.kt`,
    subdirectory: structType.config.getAndroidPackageDirectory(),
    platform: 'android',
  })
  files.push({
    content: fbjniCode,
    language: 'c++',
    name: `${structType.jniName}.hpp`,
    subdirectory: [],
    platform: 'android',
  })
  files.push({
    content: fbjniImplementationCode,
    language: 'c++',
    name: `${structType.jniName}.cpp`,
    subdirectory: [],
    platform: 'android',
  })
  return files
}

function createKotlinConstructor(structType: KotlinStructType): string {
  const needsKotlinConversion = structType.properties.some((p) => p.needsKotlinConversion)
  if (needsKotlinConversion) {
    const kotlinParams = structType.type.properties.map((p) => {
      const type = p.getCode('kotlin', { context: 'parameter' })
      return `${p.escapedName}: ${type}`
    })
    const paramsForward = structType.properties.map((p) => p.convert(p.escapedName, { from: 'kotlin', to: 'c++', in: 'kotlin' }))
    return `
/**
 * Create a new instance of ${structType.structName} from Kotlin
 */
constructor(${kotlinParams.join(', ')}):
       this(${paramsForward.join(', ')})
      `.trim()
  } else {
    return `/* primary constructor */`
  }
}

function createJNIStructInitializer(structType: KotlinStructType): string {
  const lines: string[] = ['static const auto clazz = javaClassStatic();']
  for (const prop of structType.properties) {
    const fieldName = `field${capitalizeName(prop.escapedName)}`
    const signatureType = prop.getCode('c++', { context: 'property' })
    const valueType = prop.getCode('c++', { context: 'value' })
    lines.push(`static const auto ${fieldName} = clazz->getField<${signatureType}>("${prop.escapedName}");`)
    lines.push(`${valueType} ${prop.escapedName} = this->getFieldValue(${fieldName});`)
  }

  const propsForward = structType.properties.map((p) => p.convert(p.escapedName, { from: 'kotlin', to: 'c++', in: 'c++' }))
  const cppType = structType.type.getCode('c++', { context: 'value' })
  lines.push(`return ${cppType}(`)
  lines.push(`  ${indent(propsForward.join(',\n'), '  ')}`)
  lines.push(`);`)
  return lines.join('\n')
}

interface CppStructInitializerOptions {
  cppValueName: string
  structType: KotlinStructType
}

function createCppStructInitializer({ cppValueName, structType }: CppStructInitializerOptions): string {
  const jniTypes = structType.properties.map((p) => p.getCode('c++', { context: 'parameter' })).join(', ')
  const params = structType.properties
    .map((p) =>
      p.convert(`${cppValueName}.${p.escapedName}`, {
        from: 'c++',
        to: 'kotlin',
        in: 'c++',
      })
    )
    .join(',\n')

  return `
using JSignature = ${structType.jniName}(${jniTypes});
static const auto clazz = javaClassStatic();
static const auto create = clazz->getStaticMethod<JSignature>("fromCpp");
return create(
  clazz,
  ${indent(params, '  ')}
);
  `.trim()
}
