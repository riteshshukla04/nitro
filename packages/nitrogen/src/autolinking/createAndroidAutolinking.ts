import type { SourceFile, SourceImport } from '../syntax/SourceFile.js'
import { createCMakeExtension } from './android/createCMakeExtension.js'
import { createGradleExtension } from './android/createGradleExtension.js'
import { createHybridObjectIntializer } from './android/createHybridObjectInitializer.js'
import { createRustBuildScript, hasRustFiles } from './android/createRustBuildScript.js'
import type { Autolinking } from './Autolinking.js'

type AutolinkingFile = Omit<SourceFile, 'language'>

interface JNIHybridRegistration {
  sourceImport: SourceImport
  registrationCode: string
}

interface AndroidAutolinking extends Autolinking {
  jniHybridRegistrations: JNIHybridRegistration[]
}

export function createAndroidAutolinking(
  allFiles: SourceFile[]
): AndroidAutolinking {
  const cmakeExtension = createCMakeExtension(allFiles)
  const gradleExtension = createGradleExtension(allFiles)
  const hybridObjectInitializer = createHybridObjectIntializer(allFiles)
  
  // Build files (cmake, gradle, shell) extend SourceFile but use non-Language types
  // Autolinking.sourceFiles uses Omit<SourceFile, 'language'> so these are compatible
  const sourceFiles: AutolinkingFile[] = [
    cmakeExtension, 
    gradleExtension, 
    ...hybridObjectInitializer
  ]
  
  // Add Rust build script if Rust is being used
  if (hasRustFiles(allFiles)) {
    sourceFiles.push(createRustBuildScript())
  }

  return {
    platform: 'android',
    jniHybridRegistrations: [],
    sourceFiles,
  }
}
