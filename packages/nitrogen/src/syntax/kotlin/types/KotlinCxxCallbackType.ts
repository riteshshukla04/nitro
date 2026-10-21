import type { CallbackType } from '../../types/CallbackType.js'
import { combineKotlinCppConverters, type KotlinCppConverter } from '../KotlinConverter.js'
import type { KotlinCallbackType } from './KotlinCallbackType.js'
import { KotlinCxxType } from './KotlinCxxType.js'

/** Callback payloads need native value conversion only at an explicit C++ boundary. */
export class KotlinCxxCallbackType extends KotlinCxxType {
  constructor(
    readonly cppCallbackType: CallbackType,
    readonly kotlinCallbackType: KotlinCallbackType
  ) {
    super(cppCallbackType, kotlinCallbackType)
  }

  getConverter(): KotlinCppConverter {
    const parameters = this.cppCallbackType.parameters.map((parameter, index) => {
      const kotlinParameter = this.kotlinCallbackType.parameters[index]
      if (kotlinParameter == null) throw new Error('Mismatched callback parameter count')
      return kotlinParameter.type.getCppConverter(parameter)
    })
    const dependencies = combineKotlinCppConverters([
      this.kotlinCallbackType.returnType.getCppConverter(this.cppCallbackType.returnType),
      ...parameters,
    ])
    return {
      files: dependencies.files,
      imports: [
        ...this.cppType.getRequiredImports('c++'),
        ...this.kotlinType.getRequiredImports('c++'),
        ...dependencies.imports,
        { language: 'c++', declaration: { header: 'NitroModules/JNIConverter+Callback.hpp', space: 'system' } },
      ],
    }
  }
}
