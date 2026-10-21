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
import { wrapKotlinType } from './wrapKotlinType.js'
import { getKotlinJSIType } from './getKotlinJSIType.js'
import { KotlinCxxStructType } from './types/KotlinCxxStructType.js'

interface KotlinConverterOptions {
  cppType: Type
  context?: TypeContext
  kotlinType: Type
}

/** Explicit public/private type pair for a native boundary conversion. */
export function getKotlinConverter({ cppType, context = 'value', kotlinType }: KotlinConverterOptions): string {
  const cppCode = cppType.getCode('c++', { context: context, fullyQualified: true })
  const nativeCode = kotlinType.getCode('c++', { context: 'value', fullyQualified: true })
  return `JNIConverter<${cppCode}, ${nativeCode}>`
}

export interface KotlinCppConverter {
  files: SourceFile[]
  imports: SourceImport[]
}

const runtimeImport: SourceImport = {
  language: 'c++',
  declaration: { header: 'NitroModules/JNIConverter.hpp', space: 'system' },
}

function getConverterFileName(type: ForeignHybridObjectType | StructType | EnumType, config: NitroConfig): string {
  if (type instanceof ForeignHybridObjectType) {
    return `${getCppHybridObjectAdapterNames(type).fileName}+Kotlin`
  }
  if (type instanceof EnumType) return `${type.enumName}+Kotlin+${config.getAndroidCxxLibName()}`
  return `${type.cppName}+Kotlin+${config.getAndroidCxxLibName()}`
}

function isSpecialized(type: Type, config: NitroConfig): type is ForeignHybridObjectType | StructType | EnumType {
  return (
    type instanceof ForeignHybridObjectType ||
    (type instanceof StructType && !(type instanceof KotlinCxxStructType)) ||
    (type instanceof EnumType && config.isExternalConfig)
  )
}

/** Native-only conversion files. This does not emit JNI bindings or JSI conversions. */
export function createKotlinConverters(type: Type, config: NitroConfig = NitroConfig.current): KotlinCppConverter {
  const representation = wrapKotlinType(getKotlinNativeType(type, config), { config: config })
  const directConverter = representation.getCppConverter?.(type)
  if (directConverter != null) return directConverter
  const referencedTypes = getReferencedTypes(type)
  const specializations = referencedTypes.filter((item) => isSpecialized(item, config))
  const projectedType = getKotlinNativeType(type, config)
  const nativeTypeImports = [
    ...projectedType.getRequiredImports('c++'),
    ...getKotlinJSIType(projectedType, { config: config }).getRequiredImports('c++'),
  ]
  const imports: SourceImport[] = [runtimeImport, ...nativeTypeImports]
  const files: SourceFile[] = projectedType.getExtraFiles()
  const emitted = new Set<string>()
  for (const cppType of specializations) {
    const fileName = getConverterFileName(cppType, config)
    if (emitted.has(fileName)) continue
    emitted.add(fileName)
    const ownHeader = NitroConfig.current.getCxxHeader(`${fileName}.hpp`, 'private')
    imports.push({ language: 'c++', declaration: ownHeader })
    const nativeType = getKotlinNativeType(cppType, config)
    const cppCode = cppType.getCode('c++', { context: 'value', fullyQualified: true })
    const nativeCode = nativeType.getCode('c++', { context: 'value', fullyQualified: true })
    const converterCode = getKotlinConverter({ cppType: cppType, kotlinType: nativeType })
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
        const converter = getKotlinConverter({ cppType: property, kotlinType: getKotlinNativeType(property, config) })
        return `${converter}::toJNI(value.${property.escapedName})`
      })
      const kotlinToCppFields = cppType.properties.map((property) => {
        const converter = getKotlinConverter({ cppType: property, kotlinType: getKotlinNativeType(property, config) })
        return `${converter}::fromJNI(value.${property.escapedName})`
      })
      const referencedFieldTypes = cppType.properties.flatMap(getReferencedTypes)
      const fieldTypes = referencedFieldTypes.filter((item) => isSpecialized(item, config))
      for (const fieldType of fieldTypes) {
        const fieldFileName = getConverterFileName(fieldType, config)
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
    static ${nativeCode} toJNI(const ${cppCode}& value);
    static ${cppCode} fromJNI(const ${nativeCode}& value);
  };

} // namespace margelo::nitro
`.trim()
    const implementationCode = `
${createFileMetadataString(`${fileName}.cpp`)}

${implementationIncludes}

namespace margelo::nitro {

  ${nativeCode} ${converterCode}::toJNI(const ${cppCode}& value) {
    ${indent(cppToKotlinBody, '    ')}
  }

  ${cppCode} ${converterCode}::fromJNI(const ${nativeCode}& value) {
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

/** Runtime templates compose the native conversion requirements of their elements. */
export function combineKotlinCppConverters(converters: (KotlinCppConverter | undefined)[]): KotlinCppConverter {
  const required = converters.filter((converter) => converter != null)
  return {
    imports: required.flatMap((converter) => converter.imports),
    files: required.flatMap((converter) => converter.files),
  }
}
