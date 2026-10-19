import { NitroConfig } from '../../config/NitroConfig.js'
import { createFileMetadataString } from '../../syntax/helpers.js'
import type { SourceFile } from '../../syntax/SourceFile.js'

/**
 * Gets the name of the C++ target that Swift imports to access the C++ bridge.
 */
export function getAppleCxxTargetName(config = NitroConfig.current): string {
  return `${config.getIosModuleName()}AppleCxx`
}

/**
 * Creates the sources of the `<Module>AppleCxx` Swift package target.
 * Its public umbrella header exposes the C++ bridge declarations to Swift
 * and the autolinking header to C++ consumers.
 */
export function createAppleCxxTarget(
  moduleDependencies: NitroConfig[]
): SourceFile[] {
  const moduleName = NitroConfig.current.getIosModuleName()
  const targetName = getAppleCxxTargetName()
  const autolinkingHeaderName = `${moduleName}Autolinking.hpp`
  const bridgeHeaderName = `${NitroConfig.current.getSwiftBridgeHeaderName()}.hpp`
  // Headers in <Module>AppleCxx/include/<Module>AppleCxx/ reach ios/ through three parents.
  const iosDirectory = '../../..'
  // AppleCxx is built before SwiftBridge, so it accesses the declarations directly.
  const headerDirectory = `${iosDirectory}/c++/include/${moduleName}`
  let dependencyIncludes: string
  if (moduleDependencies.length > 0) {
    const includes = moduleDependencies.map((config) => {
      const dependencyTargetName = getAppleCxxTargetName(config)
      return `#include <${dependencyTargetName}/${dependencyTargetName}.h>`
    })
    dependencyIncludes = `
// Each Nitro module declares parts of the margelo::nitro namespace, and Swift
// treats the namespace as owned by one of them. Re-export the modules this one
// uses, so Swift files that import this module can name the namespace.
${includes.join('\n')}
`
  } else {
    dependencyIncludes = ''
  }

  const umbrellaHeaderCode = `
${createFileMetadataString(`${targetName}.h`)}

#pragma once
${dependencyIncludes}
#include "${headerDirectory}/${autolinkingHeaderName}"
#include "${headerDirectory}/private/${bridgeHeaderName}"
  `.trim()
  const implementationCode = `
${createFileMetadataString(`${targetName}.cpp`)}

// Swift packages require at least one source file per C++ target.
#include <${targetName}/${targetName}.h>
  `.trim()

  const includeDirectory = [targetName, 'include', targetName]
  return [
    {
      content: umbrellaHeaderCode,
      language: 'c++',
      name: `${targetName}.h`,
      platform: 'ios',
      subdirectory: includeDirectory,
    },
    {
      content: implementationCode,
      language: 'c++',
      name: `${targetName}.cpp`,
      platform: 'ios',
      subdirectory: [targetName],
    },
  ]
}
