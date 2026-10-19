import { indent } from '../../utils.js'
import type { HybridClassBindings } from '../c++/CppHybridClassBindings.js'
import type { HybridObjectSpec } from '../HybridObjectSpec.js'
import type { SourceImport } from '../SourceFile.js'
import { getHybridObjectName } from '../getHybridObjectName.js'
import { KotlinConstructor } from './KotlinConstructor.js'
import { KotlinStaticMethod } from './KotlinStaticMethod.js'

export interface KotlinClassMembers {
  constructor: KotlinConstructor | undefined
  staticMethods: KotlinStaticMethod[]
}

/** The constructor and static methods JavaScript calls on the class. */
export function getKotlinClassMembers(
  spec: HybridObjectSpec<'kotlin'>
): KotlinClassMembers {
  let constructor: KotlinConstructor | undefined
  if (spec.constructor != null) {
    constructor = new KotlinConstructor({
      spec: spec,
      constructor: spec.constructor,
    })
  }
  const staticMethods = spec.staticMethods.map(
    (method) => new KotlinStaticMethod({ spec: spec, method: method })
  )
  return { constructor: constructor, staticMethods: staticMethods }
}

/** Bind Kotlin class calls through JNI inside the platform's `Class::get()`. */
export function createKotlinHybridClassBindings(
  spec: HybridObjectSpec<'kotlin'>
): HybridClassBindings {
  const imports: SourceImport[] = []
  const definitions: string[] = []
  const registrations: string[] = []
  const { constructor, staticMethods } = getKotlinClassMembers(spec)
  const callables: (KotlinConstructor | KotlinStaticMethod)[] = []
  if (constructor != null) callables.push(constructor)
  callables.push(...staticMethods)
  if (callables.length === 0) {
    return {
      imports: imports,
      definitions: definitions,
      registrations: registrations,
    }
  }

  const { JHybridTSpec } = getHybridObjectName(spec.name)
  const helper = `${JHybridTSpec}Bindings`
  const adapters: string[] = []
  imports.push({
    language: 'c++',
    declaration: spec.config.getCxxHeader(`${JHybridTSpec}.hpp`, 'private'),
  })
  for (const callable of callables) {
    const { cppMethods } = callable.createBridge()
    adapters.push(
      ...cppMethods.map(({ method, body }) =>
        method.getDefinition('c++', { placement: 'in-class', body: body })
      )
    )
    registrations.push(callable.getCppRegistration(helper))
    imports.push(...callable.getRequiredImports('c++'))
  }
  const helperDefinition = `
namespace {
  struct ${helper} final {
    ${indent(adapters.join('\n\n'), '    ')}
  };
}
`.trim()
  definitions.push(helperDefinition)
  return {
    imports: imports,
    definitions: definitions,
    registrations: registrations,
  }
}
