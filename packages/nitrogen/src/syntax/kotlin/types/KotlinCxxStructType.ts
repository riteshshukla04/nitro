import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import { getForwardDeclaration } from '../../c++/getForwardDeclaration.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import { StructType } from '../../types/StructType.js'
import type { GetCodeOptions, NamedType } from '../../types/Type.js'

/** Keeps Kotlin fallback fields independent of the public C++ struct projection. */
export class KotlinCxxStructType extends StructType {
  readonly config: NitroConfig

  constructor(
    structName: string,
    properties: NamedType[],
    sourceConfig: NitroConfig = NitroConfig.current,
    config: NitroConfig = NitroConfig.current
  ) {
    super(structName, properties, sourceConfig, { cppName: `${structName}Kotlin`, platform: 'android', headerVisibility: 'private' })
    this.config = config
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        let name: string
        if (options.fullyQualified || this.config.isExternalConfig) {
          name = this.config.getCxxNamespace('c++', this.cppName)
        } else {
          name = this.cppName
        }
        return options.context === 'parameter' ? `const ${name}&` : name
      }
      default:
        return super.getCode(language, options)
    }
  }

  override getRequiredImports(language: Language): SourceImport[] {
    switch (language) {
      case 'c++':
        return [
          {
            language: 'c++',
            declaration: {
              ...this.config.getCxxHeader(`${this.cppName}.hpp`, 'private'),
              forwardDeclaration: getForwardDeclaration('struct', this.cppName, this.config.getCxxNamespace('c++')),
            },
          },
        ]
      default:
        return super.getRequiredImports(language)
    }
  }

  override getExtraFiles(): SourceFile[] {
    if (this.config.isExternalConfig) return []
    return super.getExtraFiles()
  }
}
