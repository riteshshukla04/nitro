import type { HybridObjectSpec } from '../syntax/HybridObjectSpec.js'
import type { SourceImport } from '../syntax/SourceFile.js'
import { getHybridObjectName } from '../syntax/getHybridObjectName.js'
import { HybridObjectType } from '../syntax/types/HybridObjectType.js'
import { SwiftHybridObjectType } from '../syntax/swift/types/SwiftHybridObjectType.js'

interface HybridClassRegistration {
  imports: SourceImport[]
  registration: string
}

export function createHybridClassRegistration(spec: HybridObjectSpec): HybridClassRegistration {
  const names = getHybridObjectName(spec.name)
  const registryName = spec.config.getHybridClassRegistryName(spec.name)
  let className: string
  let header: SourceImport<'c++'>['declaration']
  switch (spec.language) {
    case 'swift':
      className = names.HybridTSpecSwift
      header = new SwiftHybridObjectType(new HybridObjectType(spec)).getCxxPartHeader()
      break
    case 'c++':
      className = names.HybridTSpec
      header = spec.config.getCxxHeader(`${names.HybridTSpec}.hpp`)
      break
    case 'kotlin':
      className = names.JHybridTSpec
      header = spec.config.getCxxHeader(`${names.JHybridTSpec}.hpp`, 'private')
      break
  }
  const registration = `
HybridClassRegistry::registerHybridClass("${registryName}", ${className}::Class::get());
`.trim()
  return {
    imports: [{ language: 'c++', declaration: header }],
    registration: registration,
  }
}
