import { getUmbrellaHeaderName } from '../../autolinking/ios/createSwiftUmbrellaHeader.js'
import { NitroConfig } from '../../config/NitroConfig.js'
import { indent } from '../../utils.js'
import { createFileMetadataString } from '../helpers.js'
import type { SourceFile, SourceImport } from '../SourceFile.js'
import { getImportsCode } from '../getImportCode.js'

interface SwiftJSIConverterImplementation {
  name: string
  cppType: string
  forwardDeclaration: string
  fromJSI: string
  toJSI: string
  canConvert: string
  imports: SourceImport[]
}

/** Shared file layout; each Swift type supplies its own converter implementation. */
export function createSwiftJSIConverter({
  name,
  cppType,
  forwardDeclaration,
  fromJSI: fromJSIBody,
  toJSI: toJSIBody,
  canConvert: canConvertBody,
  imports,
}: SwiftJSIConverterImplementation): SourceFile[] {
  const converterName = `JSIConverter+${name}`
  const implementationImports: SourceImport[] = [
    {
      language: 'c++',
      declaration: NitroConfig.current.getCxxHeader(
        `${converterName}.hpp`,
        'private'
      ),
    },
    {
      language: 'c++',
      declaration: NitroConfig.current.getCxxHeader(
        getUmbrellaHeaderName(),
        'private'
      ),
    },
    ...imports,
  ]
  const implementationIncludes = getImportsCode(
    implementationImports,
    'implementation'
  )
  return [
    {
      name: `${converterName}.hpp`,
      language: 'c++',
      platform: 'ios',
      subdirectory: [],
      content: `
${createFileMetadataString(`${converterName}.hpp`)}

#pragma once

#include <NitroModules/JSIConverter.hpp>

${forwardDeclaration}

namespace margelo::nitro {

  template <>
  struct JSIConverter<${cppType}> {
    static ${cppType} fromJSI(jsi::Runtime& runtime, const jsi::Value& value);
    static jsi::Value toJSI(jsi::Runtime& runtime, const ${cppType}& value);
    static bool canConvert(jsi::Runtime& runtime, const jsi::Value& value);
  };

} // namespace margelo::nitro
`.trim(),
    },
    {
      name: `${converterName}.cpp`,
      language: 'c++',
      platform: 'ios',
      subdirectory: [],
      content: `
${createFileMetadataString(`${converterName}.cpp`)}

${implementationIncludes}

namespace margelo::nitro {

  ${cppType} JSIConverter<${cppType}>::fromJSI(jsi::Runtime& runtime, const jsi::Value& value) {
    ${indent(fromJSIBody, '    ')}
  }

  jsi::Value JSIConverter<${cppType}>::toJSI(jsi::Runtime& runtime, const ${cppType}& value) {
    ${indent(toJSIBody, '    ')}
  }

  bool JSIConverter<${cppType}>::canConvert(jsi::Runtime& runtime, const jsi::Value& value) {
    ${indent(canConvertBody, '    ')}
  }

} // namespace margelo::nitro
`.trim(),
    },
  ]
}
