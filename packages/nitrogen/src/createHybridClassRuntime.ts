import { mkdir, readdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { NitroConfig } from './config/NitroConfig.js'
import { createFileMetadataString } from './syntax/helpers.js'

interface HybridClassRuntimeFile {
  /** The file name inside the runtime directory (e.g. `Image.cjs`). */
  name: string
  content: string
}

interface WriteHybridClassRuntimeOptions {
  classNames: readonly string[]
  outputDirectory: string
}

/** Returns the directory of the generated JavaScript runtime modules. */
export function getHybridClassRuntimeDirectory(
  outputDirectory: string
): string {
  return path.join(outputDirectory, 'shared', 'javascript')
}

/**
 * Returns the output directory of a runtime module, the inverse of
 * getHybridClassRuntimeDirectory.
 */
export function getHybridClassOutputDirectory(runtimeFilePath: string): string {
  return path.join(path.dirname(runtimeFilePath), '..', '..')
}

/** Creates the `.cjs` runtime module and its `.d.cts` declaration for each class. */
function createHybridClassRuntime(
  classNames: readonly string[]
): HybridClassRuntimeFile[] {
  return classNames.flatMap((name) => {
    const registryName = NitroConfig.current.getHybridClassRegistryName(name)
    const jsFileName = `${name}.cjs`
    const declarationFileName = `${name}.d.cts`
    // The getter replaces itself with a read-only data property. It stays
    // configurable so test tools can replace the class.
    const jsCode = `
${createFileMetadataString(jsFileName)}

const { NitroModules } = require('nitro-core')

// Copies of this getter, e.g. from Babel's interop helpers, share the cached class.
let hybridClass

module.exports = {
  get ${name}() {
    if (hybridClass === undefined) {
      hybridClass = NitroModules.getHybridClass('${registryName}')
    }
    Object.defineProperty(module.exports, '${name}', {
      value: hybridClass,
      enumerable: true,
      writable: false,
      configurable: true,
    })
    return hybridClass
  },
}
`.trim()
    const declarationCode = `
${createFileMetadataString(declarationFileName)}

// The spec's \`export declare class ${name}\` types this runtime export.
export {}
`.trim()
    return [
      { name: jsFileName, content: jsCode },
      { name: declarationFileName, content: declarationCode },
    ]
  })
}

/**
 * Writes the runtime modules for all classes and returns their paths.
 * Class names must be unique ignoring case, since each one names a file.
 */
export async function writeHybridClassRuntime({
  classNames,
  outputDirectory,
}: WriteHybridClassRuntimeOptions): Promise<string[]> {
  const directory = getHybridClassRuntimeDirectory(outputDirectory)
  await mkdir(directory, { recursive: true })
  const existingFileNames = await readdir(directory)
  const files = createHybridClassRuntime(classNames)
  const filePaths: string[] = []
  for (const file of files) {
    const filePath = path.join(directory, file.name)
    const differentlyCasedName = existingFileNames.find(
      (name) =>
        name !== file.name && name.toLowerCase() === file.name.toLowerCase()
    )
    if (differentlyCasedName != null) {
      // Adopt the class name's casing on case-insensitive file systems.
      await rm(path.join(directory, differentlyCasedName))
    }
    await writeFile(filePath, [file.content, ''].join('\n'), 'utf8')
    filePaths.push(filePath)
  }
  return filePaths
}
