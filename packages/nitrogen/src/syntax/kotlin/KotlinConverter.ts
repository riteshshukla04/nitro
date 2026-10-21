import { NitroConfig } from '../../config/NitroConfig.js'
import type { SourceFile, SourceImport } from '../SourceFile.js'
import type { Type, TypeContext } from '../types/Type.js'
import { wrapKotlinType } from './wrapKotlinType.js'

interface KotlinConverterOptions {
  cppType: Type
  context?: TypeContext
  kotlinType: Type
}

/** Explicit public C++/JNI type pair for a native boundary conversion. */
export function getKotlinConverter({ cppType, context = 'value', kotlinType }: KotlinConverterOptions): string {
  const cppCode = cppType.getCode('c++', { context: context, fullyQualified: true })
  const nativeCode = kotlinType.getCode('c++', { context: context, fullyQualified: true })
  return `JNIConverter<${cppCode}, ${nativeCode}>`
}

export interface KotlinCppConverter {
  files: SourceFile[]
  imports: SourceImport[]
}

/** Native-only conversion files requested by a C++ consumer of a Kotlin API. */
export function createKotlinConverters(type: Type, config: NitroConfig = NitroConfig.current): KotlinCppConverter {
  return wrapKotlinType(type, { config: config }).getCppConverter(type)
}

/** Runtime templates compose the native conversion requirements of their elements. */
export function combineKotlinCppConverters(converters: KotlinCppConverter[]): KotlinCppConverter {
  return {
    imports: converters.flatMap((converter) => converter.imports),
    files: converters.flatMap((converter) => converter.files),
  }
}
