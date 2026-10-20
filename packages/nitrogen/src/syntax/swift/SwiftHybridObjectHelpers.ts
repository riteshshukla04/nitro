import { createSwiftConverter, type SwiftCppConverter } from './SwiftConverter.js'
import { createSwiftJSIConverter } from './SwiftJSIConverter.js'
import type { Type } from '../types/Type.js'
import type { SourceFile } from '../SourceFile.js'
import type { SwiftHybridObjectType } from './types/SwiftHybridObjectType.js'
import { escapeCppName } from '../helpers.js'
import { HybridObjectType } from '../types/HybridObjectType.js'
import { getHybridObjectName } from '../getHybridObjectName.js'
import { SwiftRetainedPointerType } from './types/SwiftRetainedPointerType.js'

export function getHybridObjectBridgeNames(type: HybridObjectType) {
  const specName = type.sourceConfig.getCxxNamespace('c++', getHybridObjectName(type.hybridObjectName).HybridTSpec)
  const strongPointerAlias = escapeCppName(`std::shared_ptr<${specName}>`)
  const weakPointerAlias = escapeCppName(`std::weak_ptr<${specName}>`)
  return {
    strong: strongPointerAlias,
    weak: weakPointerAlias,
    create: `create_${strongPointerAlias}`,
    get: `get_${strongPointerAlias}`,
    weakify: `weakify_${strongPointerAlias}`,
  }
}

export function createSwiftHybridObjectConverter(type: SwiftHybridObjectType): SourceFile[] {
  const hybridObjectType = type.type
  const cppWrapperType = type.getCode('c++', { context: 'value' })
  const pointer = new SwiftRetainedPointerType(type)
  const getSwiftPartFunction = `${hybridObjectType.sourceConfig.getSwiftBridgeNamespace('c++')}::${getHybridObjectBridgeNames(hybridObjectType).get}`
  const bridge = hybridObjectType.sourceConfig.getCxxNamespace(
    'c++',
    getHybridObjectName(hybridObjectType.hybridObjectName).HybridTSpecSwift
  )
  const cppHybridObjectConverter = `JSIConverter<std::shared_ptr<${bridge}>>`
  const jsToSwiftValue = pointer.take('c++', `${getSwiftPartFunction}(hybridSpec)`)
  const jsToSwiftConverterCode = `
auto hybridSpec = ${cppHybridObjectConverter}::fromJSI(runtime, value);
return ${jsToSwiftValue};
`.trim()
  // TODO: Call value.getCxxPart() once borrowing class methods export as const:
  // https://github.com/swiftlang/swift/pull/92862
  const swiftToJSConverterCode = `
auto hybridSpec = ${cppWrapperType}::getCxxPart(value);
return ${cppHybridObjectConverter}::toJSI(runtime, hybridSpec);
`.trim()
  const jsCanConvertCode = `
return ${cppHybridObjectConverter}::canConvert(runtime, value);
`.trim()
  return createSwiftJSIConverter({
    name: type.name,
    swiftType: type,
    forwardDeclaration: type.forwardDeclaration,
    fromJSI: jsToSwiftConverterCode,
    toJSI: swiftToJSConverterCode,
    canConvert: jsCanConvertCode,
    imports: [{ language: 'c++', declaration: type.getCxxPartHeader() }],
  })
}

interface SwiftHybridObjectCppConverterOptions {
  type: SwiftHybridObjectType
  cppType: Type
}

export function createSwiftHybridObjectCppConverter({ type, cppType }: SwiftHybridObjectCppConverterOptions): SwiftCppConverter {
  const adapter = cppType.getCode('c++', { context: 'value', fullyQualified: true })
  const pointer = new SwiftRetainedPointerType(type)
  const bridge = getHybridObjectBridgeNames(type.type)
  const bridgeNamespace = type.sourceConfig.getSwiftBridgeNamespace('c++')
  const cppToSwiftValue = pointer.take('c++', `${bridgeNamespace}::${bridge.get}(value.getNativeObject())`)
  const swiftToCppConverterCode = `
return ${adapter}::fromNative(SwiftType::getCxxPart(value));
`.trim()
  const cppToSwiftConverterCode = `
return ${cppToSwiftValue};
`.trim()
  return createSwiftConverter({
    name: `${type.name}+${type.moduleName}`,
    cppType: cppType,
    swiftType: type,
    forwardDeclaration: type.forwardDeclaration,
    fromSwift: swiftToCppConverterCode,
    toSwift: cppToSwiftConverterCode,
    imports: [{ language: 'c++', declaration: type.getCxxPartHeader() }],
  })
}
