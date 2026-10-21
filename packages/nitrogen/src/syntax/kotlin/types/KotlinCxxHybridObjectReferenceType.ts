import { NitroConfig } from '../../../config/NitroConfig.js'
import { ForeignHybridObjectType } from '../../c++/ForeignHybridObjectType.js'
import { getCppHybridObjectAdapterNames } from '../../c++/CppHybridObjectAdapterNames.js'
import { getHybridObjectName } from '../../getHybridObjectName.js'
import { getImportsCode } from '../../getImportCode.js'
import { createFileMetadataString } from '../../helpers.js'
import type { SourceImport } from '../../SourceFile.js'
import type { Type } from '../../types/Type.js'
import { HybridObjectType } from '../../types/HybridObjectType.js'
import { getTypeAs } from '../../types/getTypeAs.js'
import { getKotlinConverter, type KotlinCppConverter } from '../KotlinConverter.js'
import { KotlinCxxType } from './KotlinCxxType.js'
import type { KotlinHybridObjectType } from './KotlinHybridObjectType.js'

/** Native C++ handles convert to the existing Java peer without changing object identity. */
export class KotlinCxxHybridObjectReferenceType extends KotlinCxxType {
  constructor(
    cppType: Type,
    readonly kotlinObjectType: KotlinHybridObjectType
  ) {
    super(cppType, kotlinObjectType)
  }

  getConverter(): KotlinCppConverter {
    const runtimeImport: SourceImport = {
      language: 'c++',
      declaration: { header: 'NitroModules/JNIConverter+HybridObject.hpp', space: 'system' },
    }
    const imports = [...this.cppType.getRequiredImports('c++'), ...this.kotlinType.getRequiredImports('c++'), runtimeImport]
    const cppType = getTypeAs(this.cppType, HybridObjectType)
    if (!(cppType instanceof ForeignHybridObjectType)) return { files: [], imports: imports }

    const adapter = getCppHybridObjectAdapterNames(cppType)
    const fileName = `${adapter.fileName}+JNI`
    const ownHeader = NitroConfig.current.getCxxHeader(`${fileName}.hpp`, 'private')
    const name = getHybridObjectName(this.kotlinObjectType.hybridObjectName)
    const bridge = this.kotlinObjectType.sourceConfig.getCxxNamespace('c++', name.JHybridTSpec)
    const cppCode = this.cppType.getCode('c++', { context: 'value', fullyQualified: true })
    const jniCode = this.kotlinType.getCode('c++', { context: 'value', fullyQualified: true })
    const aliasCode = this.kotlinType.getCode('c++', { context: 'parameter', fullyQualified: true })
    const converter = getKotlinConverter({ cppType: this.cppType, kotlinType: this.kotlinType })
    const nativeConverter = `JNIConverter<std::shared_ptr<${bridge}>, ${jniCode}>`
    const declarationIncludes = getImportsCode(imports, 'declaration')
    const implementationIncludes = getImportsCode(
      [{ language: 'c++', declaration: ownHeader }, ...imports, { language: 'c++', declaration: { header: 'stdexcept', space: 'system' } }],
      'implementation'
    )
    const headerCode = `
${createFileMetadataString(`${fileName}.hpp`)}

#pragma once

${declarationIncludes}

namespace margelo::nitro {

  template <>
  struct ${converter} final {
    static ${jniCode} toJNI(const ${cppCode}& value);
    static ${cppCode} fromJNI(${aliasCode} value);
  };

} // namespace margelo::nitro
`.trim()
    const implementationCode = `
${createFileMetadataString(`${fileName}.cpp`)}

${implementationIncludes}

namespace margelo::nitro {

  ${jniCode} ${converter}::toJNI(const ${cppCode}& value) {
    auto object = std::dynamic_pointer_cast<${bridge}>(value.getNativeObject());
    if (object == nullptr) [[unlikely]] {
      throw std::invalid_argument("Cannot convert ${this.kotlinObjectType.hybridObjectName} to its Kotlin implementation.");
    }
    return ${nativeConverter}::toJNI(object);
  }

  ${cppCode} ${converter}::fromJNI(${aliasCode} value) {
    return ${adapter.qualifiedName}::fromNative(${nativeConverter}::fromJNI(value));
  }

} // namespace margelo::nitro
`.trim()
    return {
      imports: [...imports, { language: 'c++', declaration: ownHeader }],
      files: [
        {
          name: `${fileName}.hpp`,
          content: headerCode,
          language: 'c++',
          platform: 'android',
          subdirectory: [],
          headerVisibility: 'private',
        },
        { name: `${fileName}.cpp`, content: implementationCode, language: 'c++', platform: 'android', subdirectory: [] },
      ],
    }
  }
}
