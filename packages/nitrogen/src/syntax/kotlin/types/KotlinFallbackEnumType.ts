import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import { EnumType } from '../../types/EnumType.js'
import type { GetCodeOptions } from '../../types/Type.js'

/** Enum ownership follows the module whose private Kotlin bridge is being called. */
export class KotlinFallbackEnumType extends EnumType {
  readonly config: NitroConfig

  constructor(type: EnumType, config: NitroConfig = NitroConfig.current) {
    super(type)
    this.config = config
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        if (options.fullyQualified || this.config.isExternalConfig) {
          return this.config.getCxxNamespace('c++', this.enumName)
        }
        return super.getCode(language, options)
      case 'kotlin':
      case 'swift':
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++':
        return [{ language: 'c++', declaration: this.config.getCxxHeader(this.declarationFile.name) }]
      case 'kotlin':
      case 'swift':
        return super.getRequiredImports(language)
    }
  }

  override getExtraFiles(): SourceFile[] {
    if (this.config.isExternalConfig) return []
    return super.getExtraFiles()
  }
}
