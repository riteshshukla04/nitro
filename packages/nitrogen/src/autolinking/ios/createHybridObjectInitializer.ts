import { NitroConfig } from '../../config/NitroConfig.js'
import { getImportsCode } from '../../syntax/getImportCode.js'
import { createFileMetadataString } from '../../syntax/helpers.js'
import type { SourceFile, SourceImport } from '../../syntax/SourceFile.js'
import { indent } from '../../utils.js'
import type { HybridObjectSpec } from '../../syntax/HybridObjectSpec.js'
import { createHybridClassRegistration } from './createHybridClassRegistration.js'

export function createHybridObjectInitializer(
  specs: HybridObjectSpec[]
): SourceFile[] {
  const autolinkingClassName = `${NitroConfig.current.getIosModuleName()}Autolinking`
  const namespace = NitroConfig.current.getCxxNamespace('c++')

  const cppRegistrations: string[] = []
  const cppImports: SourceImport[] = []
  for (const spec of specs) {
    const registration = createHybridClassRegistration(spec)
    cppImports.push(...registration.imports)
    cppRegistrations.push(registration.registration)
  }
  if (cppRegistrations.length === 0) {
    // Nothing to autolink!
    return []
  }

  const includes = getImportsCode(cppImports, 'implementation')

  const cppHeaderCode = `
${createFileMetadataString(`${autolinkingClassName}.hpp`)}

#pragma once

namespace ${namespace} {
  // Register all generated HybridObject classes
  void registerHybridClasses();
} // namespace ${namespace}

  `.trim()
  const cppImplementationCode = `
${createFileMetadataString(`${autolinkingClassName}.cpp`)}

#include "${autolinkingClassName}.hpp"
#include <NitroModules/HybridClassRegistry.hpp>

${includes}

namespace ${namespace} {
  void registerHybridClasses() {
    using namespace margelo::nitro;
    using namespace ${NitroConfig.current.getCxxNamespace('c++')};

    ${indent(cppRegistrations.join('\n'), '    ')}
  }
} // namespace ${namespace}
  `.trim()

  return [
    {
      content: cppHeaderCode,
      language: 'c++',
      name: `${autolinkingClassName}.hpp`,
      platform: 'ios',
      subdirectory: [],
    },
    {
      content: cppImplementationCode,
      language: 'c++',
      name: `${autolinkingClassName}.cpp`,
      platform: 'ios',
      subdirectory: [],
    },
  ]
}
