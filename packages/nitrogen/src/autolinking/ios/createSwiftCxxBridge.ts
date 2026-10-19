import { indent } from '../../utils.js'
import { NitroConfig } from '../../config/NitroConfig.js'
import {
  createFileMetadataString,
  isNotDuplicate,
} from '../../syntax/helpers.js'
import type { SourceFile } from '../../syntax/SourceFile.js'
import type { SwiftType } from '../../syntax/swift/types/SwiftType.js'
import { getUmbrellaHeaderName } from './createSwiftUmbrellaHeader.js'
import { getImportCode } from '../../syntax/getImportCode.js'

export function createSwiftCxxBridge(types: SwiftType[]): SourceFile[] {
  const bridgeHeaderName = NitroConfig.current.getSwiftBridgeHeaderName()
  const cppNamespace = NitroConfig.current.getSwiftBridgeNamespace('c++')
  const helpers = types.flatMap((type) => type.requiredCppHelpers)
  const headerImports = [
    ...types.flatMap((type) => type.getRequiredImports('c++', 'declaration')),
    ...helpers.flatMap((helper) => helper.header.requiredImports),
  ]
  const declarations = helpers
    .map((helper) => helper.header.code)
    .filter(isNotDuplicate)
  const declarationIncludes = headerImports
    .map((i) => getImportCode(i, 'declaration'))
    .filter(isNotDuplicate)
  const implementations = helpers.flatMap((helper) =>
    helper.implementation == null ? [] : [helper.implementation]
  )
  const implementationIncludes = implementations
    .flatMap((i) => i.requiredImports)
    .map((i) => getImportCode(i, 'implementation'))
    .filter(isNotDuplicate)
  const definitions = implementations.map((i) => i.code).filter(isNotDuplicate)
  const umbrellaInclude = getImportCode({
    language: 'c++',
    declaration: NitroConfig.current.getCxxHeader(
      getUmbrellaHeaderName(),
      'private'
    ),
  })

  return [
    {
      name: `${bridgeHeaderName}.hpp`,
      language: 'c++',
      platform: 'ios',
      subdirectory: ['c++'],
      content: `
${createFileMetadataString(`${bridgeHeaderName}.hpp`)}
#pragma once

${declarationIncludes.join('\n')}

namespace ${cppNamespace} {
  ${indent(declarations.join('\n'), '  ')}
} // namespace ${cppNamespace}
`.trim(),
    },
    {
      name: `${bridgeHeaderName}.cpp`,
      language: 'c++',
      platform: 'ios',
      subdirectory: [],
      content: `
${createFileMetadataString(`${bridgeHeaderName}.cpp`)}
${umbrellaInclude}
${implementationIncludes.join('\n')}

namespace ${cppNamespace} {
  ${indent(definitions.join('\n\n'), '  ')}
} // namespace ${cppNamespace}
`.trim(),
    },
  ]
}
