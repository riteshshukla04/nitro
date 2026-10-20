import { NitroConfig } from '../../config/NitroConfig.js'
import { getImportCode, getImportsCode } from '../../syntax/getImportCode.js'
import { createFileMetadataString, isNotDuplicate } from '../../syntax/helpers.js'
import type { HybridObjectSpec } from '../../syntax/HybridObjectSpec.js'
import type { SourceFile } from '../../syntax/SourceFile.js'
import { indent } from '../../utils.js'
import { createHybridClassRegistration } from '../createHybridClassRegistration.js'

export function createHybridObjectInitializer({ specs, files }: { specs: HybridObjectSpec[]; files: SourceFile[] }): SourceFile[] {
  const config = NitroConfig.current
  const namespace = config.getCxxNamespace('c++')
  const library = config.getAndroidCxxLibName()
  const name = `${library}OnLoad`
  const registrations = specs.map(createHybridClassRegistration)
  const natives = files.flatMap((file) => file.jniNativeRegistrations ?? [])
  const includes = getImportsCode(
    [...natives.map((native) => native.import), ...registrations.flatMap((registration) => registration.imports)],
    'implementation'
  )
  const nativeRegistrations = natives
    .map((native) => `${native.namespace.join('::')}::${native.className}::registerNatives();`)
    .filter(isNotDuplicate)
  const classRegistrations = registrations.map((registration) => registration.registration)
  const headerCode = `
${createFileMetadataString(`${name}.hpp`)}

#pragma once

namespace ${namespace} {
  // Call inside facebook::jni::initialize() from JNI_OnLoad.
  void registerAllNatives();
}
`.trim()
  const implementationCode = `
${createFileMetadataString(`${name}.cpp`)}

${getImportCode({ language: 'c++', declaration: config.getCxxHeader(`${name}.hpp`, 'private') })}
#include <NitroModules/HybridClassRegistry.hpp>
${includes}

namespace ${namespace} {
  void registerAllNatives() {
    ${indent(nativeRegistrations.join('\n'), '    ')}

    ${indent(classRegistrations.join('\n'), '    ')}
  }
}
`.trim()
  const kotlinCode = `
${createFileMetadataString(`${name}.kt`)}

package ${config.getAndroidPackage('java/kotlin')}

internal class ${name} {
  companion object {
    private var didLoad = false

    @JvmStatic
    @Synchronized
    fun initializeNative() {
      if (didLoad) return
      System.loadLibrary("${library}")
      didLoad = true
    }
  }
}
`.trim()
  return [
    {
      name: `${name}.hpp`,
      language: 'c++',
      platform: 'android',
      subdirectory: [],
      content: headerCode,
    },
    {
      name: `${name}.cpp`,
      language: 'c++',
      platform: 'android',
      subdirectory: [],
      content: implementationCode,
    },
    {
      name: `${name}.kt`,
      language: 'kotlin',
      platform: 'android',
      subdirectory: ['kotlin', ...config.getAndroidPackageDirectory()],
      content: kotlinCode,
    },
  ]
}
