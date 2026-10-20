import type { HybridObjectSpec } from './HybridObjectSpec.js'
import { getReferencedTypes } from './getReferencedTypes.js'
import type { Type } from './types/Type.js'

/** The types used directly by this spec's properties, methods and constructor. */
export function getAllTypes(spec: HybridObjectSpec): Type[] {
  const types: Type[] = []

  // 1. Properties
  types.push(...[...spec.properties, ...spec.staticProperties].map((p) => p.type))

  const methods = [...spec.methods, ...spec.staticMethods]

  // 2. Method return types
  types.push(...methods.map((m) => m.returnType))

  // 3. Method parameters
  types.push(...methods.flatMap((m) => m.parameters.map((p) => p.type)))

  // 4. Constructor parameters
  if (spec.constructor != null) {
    types.push(...spec.constructor.parameters.map((parameter) => parameter.type))
  }

  return types
}

/** This spec's API types and their nested value types. Base specs are handled separately. */
export function getAllReferencedTypes(spec: HybridObjectSpec): Type[] {
  return getAllTypes(spec).flatMap(getReferencedTypes)
}
