import type { Language, Platform } from '../../getPlatformSpecs.js'
import { getAllReferencedTypes } from '../getAllTypes.js'
import type { HybridObjectSpec } from '../HybridObjectSpec.js'
import type { SourceFile, SourceImport } from '../SourceFile.js'
import type { SwiftType } from '../swift/types/SwiftType.js'
import { wrapSwiftType } from '../swift/wrapSwiftType.js'
import { HybridObjectType, type GetHybridObjectCodeOptions } from '../types/HybridObjectType.js'
import { getForwardDeclaration } from './getForwardDeclaration.js'
import { getCppHybridObjectAdapterNames } from './CppHybridObjectAdapterNames.js'
import { createCppHybridObjectAdapter } from './CppHybridObjectAdapter.js'

/**
 * A C++ API's owning handle for an object implemented in another language.
 * Recursive references carry the same declaration metadata without repeating
 * the ancestor's definition files.
 */
export class ForeignHybridObjectType extends HybridObjectType {
  /** Shared C++ APIs need the same handle when implementations differ across platforms. */
  static isRequiredFor(type: HybridObjectType): boolean {
    return Object.values(type.platforms).some((options) => options.language !== 'c++')
  }

  constructor(
    type: HybridObjectType,
    readonly platform: Platform,
    readonly definition?: HybridObjectSpec
  ) {
    super(type.hybridObjectName, type.platforms, type.baseTypes, type.sourceConfig)
  }

  override getCode(language: Language, options: GetHybridObjectCodeOptions): string {
    switch (language) {
      case 'c++': {
        if (options.mode === 'weak') {
          throw new Error('C++ adapters are owning values; use the native handle for weak references.')
        }
        const names = getCppHybridObjectAdapterNames(this)
        const fullyQualified = options.fullyQualified ?? this.sourceConfig.isExternalConfig
        let type: string
        if (fullyQualified || this.sourceConfig.isExternalConfig) {
          type = names.qualifiedName
        } else {
          type = names.className
        }
        if (options.context === 'parameter') return `const ${type}&`
        return type
      }
      case 'swift':
      case 'kotlin':
        return super.getCode(language, options)
    }
  }

  override getCppHeader(): { header: string; space: 'user' | 'system' } {
    return getCppHybridObjectAdapterNames(this).header
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++': {
        const names = getCppHybridObjectAdapterNames(this)
        return [
          {
            language: 'c++',
            declaration: {
              ...this.getCppHeader(),
              forwardDeclaration: getForwardDeclaration('class', names.className, names.namespace),
            },
          },
        ]
      }
      case 'swift':
      case 'kotlin':
        return super.getRequiredImports(language)
    }
  }

  override getExtraFiles(): SourceFile[] {
    const spec = this.definition
    if (spec == null) return []
    return [
      ...createCppHybridObjectAdapter(spec, this.platform),
      ...spec.baseTypes.flatMap((base) => new ForeignHybridObjectType(new HybridObjectType(base), this.platform, base).getExtraFiles()),
    ]
  }

  /** Native conversion helpers used by this C++ API's private Swift bridge. */
  getSwiftTypes(): SwiftType[] {
    const spec = this.definition
    if (spec == null) return []
    const types = getAllReferencedTypes(spec)
    const dependencies = types.flatMap((type) => (type instanceof ForeignHybridObjectType ? type.getSwiftTypes() : []))
    const bases = spec.baseTypes.flatMap((base) =>
      new ForeignHybridObjectType(new HybridObjectType(base), this.platform, base).getSwiftTypes()
    )
    if (spec.language !== 'swift') return [...dependencies, ...bases]
    return [wrapSwiftType(this, spec.config), ...types.map((type) => wrapSwiftType(type, spec.config)), ...dependencies, ...bases]
  }
}
