import { NitroConfig } from '../../config/NitroConfig.js'
import { indent } from '../../utils.js'
import { getImportsCode } from '../getImportCode.js'
import { createFileMetadataString } from '../helpers.js'
import type { SourceImport } from '../SourceFile.js'
import type { Type } from '../types/Type.js'
import type { KotlinType } from './types/KotlinType.js'
import { getKotlinConverter, type KotlinCppConverter } from './KotlinConverter.js'

interface KotlinCxxValueConverterOptions {
  name: string
  cppType: Type
  kotlinType: KotlinType
  toJNI: string
  fromJNI: string
  dependencies?: KotlinCppConverter[]
}

/** Emits a native adapter only when a C++ consumer requests the exact type pair. */
export function createKotlinCxxValueConverter({
  name,
  cppType,
  kotlinType,
  toJNI,
  fromJNI,
  dependencies = [],
}: KotlinCxxValueConverterOptions): KotlinCppConverter {
  const fileName = `${name}+Kotlin+${NitroConfig.current.getAndroidCxxLibName()}`
  const ownHeader = NitroConfig.current.getCxxHeader(`${fileName}.hpp`, 'private')
  const cppCode = cppType.getCode('c++', { context: 'value', fullyQualified: true })
  const jniCode = kotlinType.getCode('c++', { context: 'value', fullyQualified: true })
  const jniParameterCode = kotlinType.getCode('c++', { context: 'parameter', fullyQualified: true })
  const converter = getKotlinConverter({ cppType: cppType, kotlinType: kotlinType })
  const requiredImports: SourceImport[] = [
    { language: 'c++', declaration: { header: 'NitroModules/JNIConverter.hpp', space: 'system' } },
    ...cppType.getRequiredImports('c++'),
    ...kotlinType.getRequiredImports('c++'),
  ]
  const declarationIncludes = getImportsCode(requiredImports, 'forward-declaration')
  const implementationIncludes = getImportsCode(
    [{ language: 'c++', declaration: ownHeader }, ...requiredImports, ...dependencies.flatMap((dependency) => dependency.imports)],
    'implementation'
  )
  const headerCode = `
${createFileMetadataString(`${fileName}.hpp`)}

#pragma once

${declarationIncludes}

namespace margelo::nitro {

  template <>
  struct ${converter} final {
    static ${jniCode} toJNI(const ${cppCode}& value);
    static ${cppCode} fromJNI(${jniParameterCode} value);
  };

} // namespace margelo::nitro
`.trim()
  const implementationCode = `
${createFileMetadataString(`${fileName}.cpp`)}

${implementationIncludes}

namespace margelo::nitro {

  ${jniCode} ${converter}::toJNI(const ${cppCode}& value) {
    ${indent(toJNI, '    ')}
  }

  ${cppCode} ${converter}::fromJNI(${jniParameterCode} value) {
    ${indent(fromJNI, '    ')}
  }

} // namespace margelo::nitro
`.trim()
  return {
    imports: [{ language: 'c++', declaration: ownHeader }],
    files: [
      ...dependencies.flatMap((dependency) => dependency.files),
      { name: `${fileName}.hpp`, content: headerCode, language: 'c++', platform: 'android', subdirectory: [], headerVisibility: 'private' },
      { name: `${fileName}.cpp`, content: implementationCode, language: 'c++', platform: 'android', subdirectory: [] },
    ],
  }
}
