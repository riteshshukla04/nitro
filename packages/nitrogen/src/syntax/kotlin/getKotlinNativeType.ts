import { NitroConfig } from '../../config/NitroConfig.js'
import { ArrayType } from '../types/ArrayType.js'
import { EnumType } from '../types/EnumType.js'
import { KotlinFallbackEnumType } from './types/KotlinFallbackEnumType.js'
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
import { KotlinCxxHybridObjectType } from './types/KotlinCxxHybridObjectType.js'
import { KotlinCxxStructType } from './types/KotlinCxxStructType.js'

/** The C++ types used inside Kotlin's private JNI bridge, independent of the public C++ API. */
export function getKotlinNativeType(type: Type, config: NitroConfig = NitroConfig.current): Type {
  if (type instanceof NamedWrappingType) {
    return new NamedWrappingType(type.name, getKotlinNativeType(type.type, config))
  }
  if (type instanceof KotlinCxxHybridObjectType || type instanceof KotlinCxxStructType || type instanceof KotlinFallbackEnumType)
    return type
  if (type instanceof EnumType) return new KotlinFallbackEnumType(type, config)
  if (type instanceof HybridObjectType) return new KotlinCxxHybridObjectType(type)
  if (type instanceof StructType) {
    const properties = type.properties.map((property) => new NamedWrappingType(property.name, getKotlinNativeType(property, config)))
    return new KotlinCxxStructType(type.structName, properties, type.sourceConfig, config)
  }
  if (type instanceof ArrayType) return new ArrayType(getKotlinNativeType(type.itemType, config))
  if (type instanceof OptionalType) return new OptionalType(getKotlinNativeType(type.wrappingType, config))
  if (type instanceof PromiseType) return new PromiseType(getKotlinNativeType(type.resultingType, config))
  if (type instanceof RecordType) {
    return new RecordType(getKotlinNativeType(type.keyType, config), getKotlinNativeType(type.valueType, config))
  }
  if (type instanceof VariantType) {
    const variants = type.variants.map((item) => getKotlinNativeType(item, config))
    return new VariantType(variants, type.aliasName)
  }
  if (type instanceof TupleType) return new TupleType(type.itemTypes.map((item) => getKotlinNativeType(item, config)))
  if (type instanceof CallbackType) {
    const parameters = type.parameters.map((parameter) => new NamedWrappingType(parameter.name, getKotlinNativeType(parameter, config)))
    return new CallbackType(getKotlinNativeType(type.returnType, config), parameters, type.isInline)
  }
  return type
}
