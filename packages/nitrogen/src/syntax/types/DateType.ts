import type { Language } from '../../getPlatformSpecs.js'
import type { SourceFile, SourceImport } from '../SourceFile.js'
import type { GetCodeOptions, Type, TypeKind } from './Type.js'

export class DateType implements Type {
  get kind(): TypeKind {
    return 'date'
  }
  get isEquatable(): boolean {
    return true
  }

  getCode(language: Language, _options: GetCodeOptions): string {
    switch (language) {
      case 'c++':
        return 'std::chrono::system_clock::time_point'
      case 'swift':
        return 'Date'
      case 'kotlin':
        return 'java.time.Instant'
      default:
        throw new Error(
          `Language ${language} is not yet supported for DateType!`
        )
    }
  }
  getExtraFiles(): SourceFile[] {
    return []
  }
  getRequiredImports(language: Language): SourceImport[] {
    const imports: SourceImport[] = []
    switch (language) {
      case 'c++':
        imports.push({
          language,
          declaration: { name: 'chrono', space: 'system' },
        })
        break
    }
    return imports
  }
}
