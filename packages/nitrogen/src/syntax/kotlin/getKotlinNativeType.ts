import { NitroConfig } from '../../config/NitroConfig.js'
import { ArrayType } from '../types/ArrayType.js'
import { EnumType } from '../types/EnumType.js'
import { KotlinNativeEnumType } from './types/KotlinNativeEnumType.js'
import { CallbackType } from '../types/CallbackType.js'
import { HybridObjectType } from '../types/HybridObjectType.js'
import { NamedWrappingType } from '../types/NamedWrappingType.js'
import { OptionalType } from '../types/OptionalType.js'
import { PromiseType } from '../types/PromiseType.js'
import { RecordType } from '../types/RecordType.js'
import { StructType } from '../types/StructType.js'
import { TupleType } from '../types/TupleType.js'
import type { Type } from '../types/Type.js'
import { VariantType } from '../types/VariantType.js'
import { KotlinNativeHybridObjectType } from './types/KotlinNativeHybridObjectType.js'
import { KotlinNativeStructType } from './types/KotlinNativeStructType.js'

/** The C++ types used inside Kotlin's private JNI bridge, independent of the public C++ API. */
export function getKotlinNativeType(type: Type, nativeConfig: NitroConfig = NitroConfig.current): Type {
  if (type instanceof NamedWrappingType) {
    return new NamedWrappingType(type.name, getKotlinNativeType(type.type, nativeConfig))
  }
  if (type instanceof KotlinNativeHybridObjectType || type instanceof KotlinNativeStructType || type instanceof KotlinNativeEnumType)
    return type
  if (type instanceof EnumType) return new KotlinNativeEnumType(type, nativeConfig)
  if (type instanceof HybridObjectType) return new KotlinNativeHybridObjectType(type)
  if (type instanceof StructType) {
    const properties = type.properties.map((property) => new NamedWrappingType(property.name, getKotlinNativeType(property, nativeConfig)))
    return new KotlinNativeStructType(type.structName, properties, type.sourceConfig, nativeConfig)
  }
  if (type instanceof ArrayType) return new ArrayType(getKotlinNativeType(type.itemType, nativeConfig))
  if (type instanceof OptionalType) return new OptionalType(getKotlinNativeType(type.wrappingType, nativeConfig))
  if (type instanceof PromiseType) return new PromiseType(getKotlinNativeType(type.resultingType, nativeConfig))
  if (type instanceof RecordType) {
    return new RecordType(getKotlinNativeType(type.keyType, nativeConfig), getKotlinNativeType(type.valueType, nativeConfig))
  }
  if (type instanceof VariantType) {
    const variants = type.variants.map((item) => getKotlinNativeType(item, nativeConfig))
    return new VariantType(variants, type.aliasName)
  }
  if (type instanceof TupleType) return new TupleType(type.itemTypes.map((item) => getKotlinNativeType(item, nativeConfig)))
  if (type instanceof CallbackType) {
    const parameters = type.parameters.map(
      (parameter) => new NamedWrappingType(parameter.name, getKotlinNativeType(parameter, nativeConfig))
    )
    return new CallbackType(getKotlinNativeType(type.returnType, nativeConfig), parameters, type.isInline)
  }
  return type
}
