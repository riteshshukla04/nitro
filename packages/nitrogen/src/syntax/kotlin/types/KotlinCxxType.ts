import type { Language } from '../../../getPlatformSpecs.js'
import type { SourceFile, SourceImport } from '../../SourceFile.js'
import type { GetCodeOptions, Type, TypeKind } from '../../types/Type.js'
import type { KotlinCppConverter } from '../KotlinConverter.js'
import type { KotlinType } from './KotlinType.js'

/** A C++ API value and its on-demand conversion to a Kotlin representation. */
export abstract class KotlinCxxType implements Type {
  constructor(
    readonly cppType: Type,
    readonly kotlinType: KotlinType
  ) {}

  get kind(): TypeKind {
    return this.cppType.kind
  }

  get isEquatable(): boolean {
    return this.cppType.isEquatable
  }

  getCode(language: Language, options: GetCodeOptions): string {
    return this.cppType.getCode(language, options)
  }

  getExtraFiles(): SourceFile[] {
    return [...this.cppType.getExtraFiles(), ...this.getConverter().files]
  }

  getRequiredImports(language: Language): SourceImport[] {
    const imports = this.cppType.getRequiredImports(language)
    switch (language) {
      case 'c++':
        imports.push(...this.getConverter().imports)
        break
    }
    return imports
  }

  abstract getConverter(): KotlinCppConverter
}
