import { NitroConfig } from '../../config/NitroConfig.js'
import { indent } from '../../utils.js'
import { ForeignHybridObjectType } from '../c++/ForeignHybridObjectType.js'
import { getCppHybridObjectAdapterNames } from '../c++/CppHybridObjectAdapterNames.js'
import { getImportsCode } from '../getImportCode.js'
import { getReferencedTypes } from '../getReferencedTypes.js'
import { createFileMetadataString } from '../helpers.js'
import type { SourceFile, SourceImport } from '../SourceFile.js'
import { EnumType } from '../types/EnumType.js'
import { StructType } from '../types/StructType.js'
import type { Type, TypeContext } from '../types/Type.js'
import { getKotlinNativeType } from './getKotlinNativeType.js'
import { KotlinNativeStructType } from './types/KotlinNativeStructType.js'

interface KotlinNativeConverterOptions {
  cppType: Type
  context?: TypeContext
  nativeConfig?: NitroConfig
}

/** Explicit public/private type pair for a native boundary conversion. */
export function getKotlinNativeConverter({
  cppType,
  context = 'value',
  nativeConfig = NitroConfig.current,
}: KotlinNativeConverterOptions): string {
  const nativeType = getKotlinNativeType(cppType, nativeConfig)
  const cppCode = cppType.getCode('c++', { context: context, fullyQualified: true })
  const nativeCode = nativeType.getCode('c++', { context: context, fullyQualified: true })
  return `JNIConverter<${cppCode}, ${nativeCode}>`
}

interface KotlinNativeConverterFiles {
  files: SourceFile[]
  imports: SourceImport[]
}

const runtimeImport: SourceImport = {
  language: 'c++',
  declaration: { header: 'NitroModules/JNIConverter.hpp', space: 'system' },
}

function getConverterFileName(type: ForeignHybridObjectType | StructType | EnumType, nativeConfig: NitroConfig): string {
  if (type instanceof ForeignHybridObjectType) {
    return `${getCppHybridObjectAdapterNames(type).fileName}+Kotlin`
  }
  if (type instanceof EnumType) return `${type.enumName}+Kotlin+${nativeConfig.getAndroidCxxLibName()}`
  return `${type.cppName}+Kotlin+${nativeConfig.getAndroidCxxLibName()}`
}

function isSpecialized(type: Type, nativeConfig: NitroConfig): type is ForeignHybridObjectType | StructType | EnumType {
  return (
    type instanceof ForeignHybridObjectType ||
    (type instanceof StructType && !(type instanceof KotlinNativeStructType)) ||
    (type instanceof EnumType && nativeConfig.isExternalConfig)
  )
}

/** Native-only conversion files. This does not emit JNI bindings or JSI conversions. */
export function createKotlinNativeConverters(type: Type, nativeConfig: NitroConfig = NitroConfig.current): KotlinNativeConverterFiles {
  const referencedTypes = getReferencedTypes(type)
  const specializations = referencedTypes.filter((item) => isSpecialized(item, nativeConfig))
  const projectedType = getKotlinNativeType(type, nativeConfig)
  const nativeTypeImports = projectedType.getRequiredImports('c++')
  const imports: SourceImport[] = [runtimeImport, ...nativeTypeImports]
  const files: SourceFile[] = projectedType.getExtraFiles()
  const emitted = new Set<string>()
  for (const cppType of specializations) {
    const fileName = getConverterFileName(cppType, nativeConfig)
    if (emitted.has(fileName)) continue
    emitted.add(fileName)
    const ownHeader = NitroConfig.current.getCxxHeader(`${fileName}.hpp`, 'private')
    imports.push({ language: 'c++', declaration: ownHeader })
    const nativeType = getKotlinNativeType(cppType, nativeConfig)
    const cppCode = cppType.getCode('c++', { context: 'value', fullyQualified: true })
    const nativeCode = nativeType.getCode('c++', { context: 'value', fullyQualified: true })
    const converterCode = getKotlinNativeConverter({ cppType: cppType, nativeConfig: nativeConfig })
    const declarationImports = [runtimeImport, ...cppType.getRequiredImports('c++'), ...nativeType.getRequiredImports('c++')]
    const implementationImports: SourceImport[] = [
      { language: 'c++', declaration: ownHeader },
      ...cppType.getRequiredImports('c++'),
      ...nativeType.getRequiredImports('c++'),
    ]
    let cppToKotlinBody: string
    let kotlinToCppBody: string
    if (cppType instanceof ForeignHybridObjectType) {
      const adapter = getCppHybridObjectAdapterNames(cppType)
      const nativeObject = nativeType.getCode('c++', { context: 'value', fullyQualified: true })
      implementationImports.push({ language: 'c++', declaration: { header: 'stdexcept', space: 'system' } })
      cppToKotlinBody = `
auto result = std::dynamic_pointer_cast<${nativeObject}::element_type>(value.getNativeObject());
if (result == nullptr) [[unlikely]] {
  throw std::invalid_argument("Cannot convert ${cppType.hybridObjectName} to its Kotlin implementation.");
}
return result;
`.trim()
      kotlinToCppBody = `
return ${adapter.qualifiedName}::fromNative(value);
`.trim()
    } else if (cppType instanceof EnumType) {
      cppToKotlinBody = `
return static_cast<${nativeCode}>(value);
`.trim()
      kotlinToCppBody = `
return static_cast<${cppCode}>(value);
`.trim()
    } else {
      const cppToKotlinFields = cppType.properties.map((property) => {
        const converter = getKotlinNativeConverter({ cppType: property, nativeConfig: nativeConfig })
        return `${converter}::toKotlin(value.${property.escapedName})`
      })
      const kotlinToCppFields = cppType.properties.map((property) => {
        const converter = getKotlinNativeConverter({ cppType: property, nativeConfig: nativeConfig })
        return `${converter}::fromKotlin(value.${property.escapedName})`
      })
      const referencedFieldTypes = cppType.properties.flatMap(getReferencedTypes)
      const fieldTypes = referencedFieldTypes.filter((item) => isSpecialized(item, nativeConfig))
      for (const fieldType of fieldTypes) {
        const fieldFileName = getConverterFileName(fieldType, nativeConfig)
        implementationImports.push({
          language: 'c++',
          declaration: NitroConfig.current.getCxxHeader(`${fieldFileName}.hpp`, 'private'),
        })
      }
      const cppToKotlinArguments = cppToKotlinFields.map((field, index) => {
        const separator = index === cppToKotlinFields.length - 1 ? '' : ','
        return `${field}${separator}`
      })
      const kotlinToCppArguments = kotlinToCppFields.map((field, index) => {
        const separator = index === kotlinToCppFields.length - 1 ? '' : ','
        return `${field}${separator}`
      })
      cppToKotlinBody = `
return ${nativeCode}(
  ${indent(cppToKotlinArguments.join('\n'), '  ')}
);
`.trim()
      kotlinToCppBody = `
return ${cppCode}(
  ${indent(kotlinToCppArguments.join('\n'), '  ')}
);
`.trim()
    }
    const declarationIncludes = getImportsCode(declarationImports, 'forward-declaration')
    const implementationIncludes = getImportsCode(implementationImports, 'implementation')
    const headerCode = `
${createFileMetadataString(`${fileName}.hpp`)}

#pragma once

${declarationIncludes}

namespace margelo::nitro {

  template <>
  struct ${converterCode} final {
    static ${nativeCode} toKotlin(const ${cppCode}& value);
    static ${cppCode} fromKotlin(const ${nativeCode}& value);
  };

} // namespace margelo::nitro
`.trim()
    const implementationCode = `
${createFileMetadataString(`${fileName}.cpp`)}

${implementationIncludes}

namespace margelo::nitro {

  ${nativeCode} ${converterCode}::toKotlin(const ${cppCode}& value) {
    ${indent(cppToKotlinBody, '    ')}
  }

  ${cppCode} ${converterCode}::fromKotlin(const ${nativeCode}& value) {
    ${indent(kotlinToCppBody, '    ')}
  }

} // namespace margelo::nitro
`.trim()
    files.push(
      { name: `${fileName}.hpp`, content: headerCode, language: 'c++', platform: 'android', subdirectory: [], headerVisibility: 'private' },
      { name: `${fileName}.cpp`, content: implementationCode, language: 'c++', platform: 'android', subdirectory: [] }
    )
  }
  return { files: files, imports: imports }
}
