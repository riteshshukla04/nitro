import type { HybridObjectSpec } from '../syntax/HybridObjectSpec.js'
import type { SourceFile } from '../syntax/SourceFile.js'
import type { Autolinking } from './Autolinking.js'
import { createCMakeExtension } from './android/createCMakeExtension.js'
import { createGradleExtension } from './android/createGradleExtension.js'
import { createHybridObjectInitializer } from './android/createHybridObjectInitializer.js'

export function createAndroidAutolinking(specs: HybridObjectSpec[], files: SourceFile[]): Autolinking {
  return {
    platform: 'android',
    sourceFiles: [createCMakeExtension(files), createGradleExtension(), ...createHybridObjectInitializer({ specs: specs, files: files })],
  }
}
