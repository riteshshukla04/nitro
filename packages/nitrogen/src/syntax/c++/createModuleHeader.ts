import type { SourceFile } from '../SourceFile.js'
import { createFileMetadataString } from '../helpers.js'

/** Exposes a header through its owning module, even when another module uses the same file name. */
export function createModuleHeader({
  name,
  moduleName,
  platform,
}: {
  name: string
  moduleName: string
  platform: SourceFile['platform']
}): SourceFile {
  const code = `
${createFileMetadataString(name)}

#pragma once

#include "../${name}"
`.trim()
  return {
    name: name,
    subdirectory: [moduleName],
    language: 'c++',
    platform: platform,
    content: code,
  }
}
