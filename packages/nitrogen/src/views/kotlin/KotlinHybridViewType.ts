import type { HybridObjectSpec } from '../../syntax/HybridObjectSpec.js'
import { KotlinHybridObjectType } from '../../syntax/kotlin/types/KotlinHybridObjectType.js'
import type { JNINativeRegistration } from '../../syntax/kotlin/types/KotlinType.js'
import { HybridObjectType } from '../../syntax/types/HybridObjectType.js'
import { getViewComponentNames } from '../CppHybridViewComponent.js'

/** A Kotlin HybridView also owns the JNI entry point that applies Fabric props. */
export class KotlinHybridViewType extends KotlinHybridObjectType {
  readonly stateUpdaterName: string

  constructor(spec: HybridObjectSpec<'kotlin'>) {
    super(new HybridObjectType(spec))
    const { stateClassName } = getViewComponentNames(spec)
    this.stateUpdaterName = `${stateClassName}Updater`
  }

  override getJniNativeRegistrations(): readonly JNINativeRegistration[] {
    if (this.sourceConfig.isExternalConfig) return []
    return [
      ...super.getJniNativeRegistrations(),
      {
        namespace: this.sourceConfig.getCxxNamespace('c++', 'views').split('::'),
        className: `J${this.stateUpdaterName}`,
        import: {
          language: 'c++',
          declaration: this.sourceConfig.getCxxHeader(`views/J${this.stateUpdaterName}.hpp`, 'private'),
        },
      },
    ]
  }
}
