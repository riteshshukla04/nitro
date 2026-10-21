import type { HybridObjectSpec } from '../syntax/HybridObjectSpec.js'
import type { SourceFile } from '../syntax/SourceFile.js'
import { getAllTypes } from '../syntax/getAllTypes.js'
import { getReferencedTypes } from '../syntax/getReferencedTypes.js'
import { getKotlinNativeType } from '../syntax/kotlin/getKotlinNativeType.js'
import { KotlinHybridObjectType } from '../syntax/kotlin/types/KotlinHybridObjectType.js'
import type { KotlinType } from '../syntax/kotlin/types/KotlinType.js'
import { wrapKotlinType } from '../syntax/kotlin/wrapKotlinType.js'
import { HybridObjectType } from '../syntax/types/HybridObjectType.js'
import { KotlinHybridViewType } from '../views/kotlin/KotlinHybridViewType.js'
import type { Autolinking } from './Autolinking.js'
import { createCMakeExtension } from './android/createCMakeExtension.js'
import { createGradleExtension } from './android/createGradleExtension.js'
import { createHybridObjectInitializer } from './android/createHybridObjectInitializer.js'

/** JNI bindings are owned by the Kotlin declarations emitted in this module. */
function getKotlinTypes(specs: readonly HybridObjectSpec[]): KotlinType[] {
  return specs.flatMap((spec) => {
    if (spec.config.isExternalConfig) return []
    switch (spec.language) {
      case 'kotlin': {
        const baseTypes = getKotlinTypes(spec.baseTypes)
        let hybridObject: KotlinHybridObjectType
        if (spec.isHybridView) {
          hybridObject = new KotlinHybridViewType(spec)
        } else {
          hybridObject = new KotlinHybridObjectType(new HybridObjectType(spec))
        }
        // Fabric props start as public C++ types. JNI uses the Kotlin projection.
        const cppTypes = getAllTypes(spec).map((type) => getKotlinNativeType(type, spec.config))
        const referencedTypes = cppTypes.flatMap(getReferencedTypes)
        const kotlinTypes = referencedTypes.map((type) => wrapKotlinType(type))
        return [...baseTypes, hybridObject, ...kotlinTypes]
      }
      case 'c++':
      case 'swift':
        return []
    }
  })
}

export function createAndroidAutolinking(specs: HybridObjectSpec[], files: SourceFile[]): Autolinking {
  const kotlinTypes = getKotlinTypes(specs)
  const jniNativeRegistrations = kotlinTypes.flatMap((type) => type.getJniNativeRegistrations?.() ?? [])
  const initializer = createHybridObjectInitializer({ specs: specs, jniNativeRegistrations: jniNativeRegistrations })
  return {
    platform: 'android',
    sourceFiles: [createCMakeExtension(files), createGradleExtension(), ...initializer],
  }
}
