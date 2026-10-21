import type { Language } from '../../../getPlatformSpecs.js'
import { getForwardDeclaration } from '../../c++/getForwardDeclaration.js'
import { getHybridObjectName } from '../../getHybridObjectName.js'
import type { SourceImport } from '../../SourceFile.js'
import { HybridObjectType, type GetHybridObjectCodeOptions } from '../../types/HybridObjectType.js'

/** Constructor factories return their native HybridObject for HybridClass registration. */
export class KotlinConstructorResultType extends HybridObjectType {
  constructor(type: HybridObjectType) {
    super(type.hybridObjectName, type.platforms, type.baseTypes, type.sourceConfig)
  }

  override getCode(language: Language, options: GetHybridObjectCodeOptions): string {
    switch (language) {
      case 'c++': {
        // Validate that this constructor belongs to a Kotlin implementation.
        super.getCode('kotlin', options)
        const { JHybridTSpec } = getHybridObjectName(this.hybridObjectName)
        const fullyQualified = options.fullyQualified ?? this.sourceConfig.isExternalConfig
        let className: string
        if (fullyQualified) {
          className = this.sourceConfig.getCxxNamespace('c++', JHybridTSpec)
        } else {
          className = JHybridTSpec
        }
        const pointer = options.mode === 'weak' ? 'std::weak_ptr' : 'std::shared_ptr'
        const code = `${pointer}<${className}>`
        return options.context === 'parameter' ? `const ${code}&` : code
      }
      default:
        return super.getCode(language, options)
    }
  }

  override getCppHeader(): { header: string; space: 'user' | 'system' } {
    const { JHybridTSpec } = getHybridObjectName(this.hybridObjectName)
    return this.sourceConfig.getCxxHeader(`${JHybridTSpec}.hpp`, 'private')
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++': {
        const { JHybridTSpec } = getHybridObjectName(this.hybridObjectName)
        return [
          { language: 'c++', declaration: { header: 'memory', space: 'system' } },
          { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+HybridObject.hpp', space: 'system' } },
          {
            language: 'c++',
            declaration: { forwardDeclaration: getForwardDeclaration('class', JHybridTSpec, this.sourceConfig.getCxxNamespace('c++')) },
            implementation: this.getCppHeader(),
          },
        ]
      }
      case 'kotlin':
      case 'swift':
        return super.getRequiredImports(language)
    }
  }
}
