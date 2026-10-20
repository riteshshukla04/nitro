import { NitroConfig } from '../../../config/NitroConfig.js'
import type { Language } from '../../../getPlatformSpecs.js'
import { getForwardDeclaration } from '../../c++/getForwardDeclaration.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import { StructType } from '../../types/StructType.js'
import type { GetCodeOptions, NamedType } from '../../types/Type.js'

/** Keeps Kotlin fallback fields independent of the public C++ struct projection. */
export class KotlinNativeStructType extends StructType {
  readonly nativeConfig: NitroConfig

  constructor(
    structName: string,
    properties: NamedType[],
    sourceConfig: NitroConfig = NitroConfig.current,
    nativeConfig: NitroConfig = NitroConfig.current
  ) {
    super(structName, properties, sourceConfig, { cppName: `${structName}Kotlin`, platform: 'android', headerVisibility: 'private' })
    this.nativeConfig = nativeConfig
  }

  override getCode(language: Language, options: GetCodeOptions): string {
    switch (language) {
      case 'c++': {
        let name: string
        if (options.fullyQualified || this.nativeConfig.isExternalConfig) {
          name = this.nativeConfig.getCxxNamespace('c++', this.cppName)
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
              ...this.nativeConfig.getCxxHeader(`${this.cppName}.hpp`, 'private'),
              forwardDeclaration: getForwardDeclaration('struct', this.cppName, this.nativeConfig.getCxxNamespace('c++')),
            },
          },
        ]
      default:
        return super.getRequiredImports(language)
    }
  }

  override getExtraFiles(): SourceFile[] {
    if (this.nativeConfig.isExternalConfig) return []
    return super.getExtraFiles()
  }
}
