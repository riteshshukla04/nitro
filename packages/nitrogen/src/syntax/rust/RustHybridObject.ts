import type { SourceFile } from '../SourceFile.js'
import { createFileMetadataString } from '../helpers.js'
import { indent } from '../../utils.js'
import type { HybridObjectSpec } from '../HybridObjectSpec.js'
import { getHybridObjectName } from '../getHybridObjectName.js'

/**
 * Generates Rust FFI code and C++ bridge code for a HybridObject
 */
export function createRustHybridObject(spec: HybridObjectSpec): SourceFile[] {
  const name = getHybridObjectName(spec.name)
  const cxxNamespace = spec.config.getCxxNamespace('c++')
  
  // Get the autolinking config to determine the actual C++ class name
  const autolinkingConfig = spec.config.getAutolinkedHybridObjects()
  const autolinkingCppName = autolinkingConfig[spec.name]?.cpp
  // Use autolinking name if available, otherwise use the generated name
  const cppClassName = autolinkingCppName ?? name.HybridTSpec
  const cppFileName = autolinkingCppName ?? name.HybridTSpec
  
  // Generate Rust function signatures
  const rustFunctions = spec.methods.map((method) => {
    const rustParams = method.parameters.map((p) => {
      // For strings, use C string pointers in Rust FFI
      const rustType = p.type.kind === 'string' 
        ? '*const c_char' 
        : p.type.getCode('rust')
      return `${p.name}: ${rustType}`
    })
    // For string returns, use mutable C string pointer
    const rustReturnType = method.returnType.kind === 'string'
      ? '*mut c_char'
      : method.returnType.getCode('rust')
    const rustFunctionName = `rust_${method.name}`
    
    return `#[unsafe(no_mangle)]
pub extern "C" fn ${rustFunctionName}(${rustParams.join(', ')}) -> ${rustReturnType} {
    // TODO: Implement ${method.name}
    ${rustReturnType === '()' ? '' : rustReturnType === '*mut c_char' ? 'std::ptr::null_mut()' : 'unimplemented!()'}
}`
  })

  // Check if any methods return strings (need rust_free_string)
  const hasStringReturns = spec.methods.some(m => m.returnType.kind === 'string')
  
  // Generate Rust lib.rs content
  const rustLibRs = `
${createFileMetadataString('lib.rs')}

// lib.rs - Auto-generated Rust FFI functions
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

${rustFunctions.join('\n\n')}

${hasStringReturns ? `/// Free string allocated by Rust
#[unsafe(no_mangle)]
pub extern "C" fn rust_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}` : ''}
`

  // Generate C++ extern "C" declarations
  const cppExternDeclarations = spec.methods.map((method) => {
    const cppParams = method.parameters.map((p) => {
      // For strings, use const char* in C FFI
      const cppType = p.type.kind === 'string' 
        ? 'const char*' 
        : p.type.getCode('c++')
      return `${cppType} ${p.name}`
    })
    // For string returns, use char* in C FFI
    const cppReturnType = method.returnType.kind === 'string'
      ? 'char*'
      : method.returnType.getCode('c++')
    const rustFunctionName = `rust_${method.name}`
    
    return `    ${cppReturnType} ${rustFunctionName}(${cppParams.join(', ')});`
  })
  
  // Add rust_free_string if needed
  if (hasStringReturns) {
    cppExternDeclarations.push('    void rust_free_string(char* ptr);')
  }

  // Generate C++ RustBridge.h
  const rustBridgeHeader = `
${createFileMetadataString('RustBridge.h')}

#ifndef RUST_BRIDGE_H
#define RUST_BRIDGE_H

#include <cstdint>
#include <string>
#include <vector>

namespace RustBridge {

${spec.methods.map((method) => {
  const cppParams = method.parameters.map((p) => {
    const cppType = p.type.getCode('c++')
    const refType = p.type.canBePassedByReference ? `const ${cppType}&` : cppType
    return `${refType} ${p.name}`
  })
  const cppReturnType = method.returnType.getCode('c++')
  
  return `/**
 * ${method.name} - Rust implementation
 */
${cppReturnType} ${method.name}(${cppParams.join(', ')});`
}).join('\n\n')}

} // namespace RustBridge

#endif // RUST_BRIDGE_H
`

  // Generate C++ RustBridge.cpp
  const rustBridgeCpp = `
${createFileMetadataString('RustBridge.cpp')}

#include "RustBridge.h"
#include <string>
#include <vector>
#include <android/log.h>

#define LOG_TAG "RustBridge"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// Declare Rust functions
extern "C" {
${indent(cppExternDeclarations.join('\n'), '    ')}
}

namespace RustBridge {

${spec.methods.map((method) => {
  const cppParams = method.parameters.map((p) => {
    const cppType = p.type.getCode('c++')
    const refType = p.type.canBePassedByReference ? `const ${cppType}&` : cppType
    return `${refType} ${p.name}`
  })
  const cppReturnType = method.returnType.getCode('c++')
  const rustFunctionName = `rust_${method.name}`
  
  // Convert parameters for Rust call (strings need .c_str())
  const rustCallParams = method.parameters.map(p => {
    if (p.type.kind === 'string') {
      return `${p.name}.c_str()`
    }
    return p.name
  })
  
  // Handle string conversion if needed
  if (method.returnType.kind === 'string') {
    return `${cppReturnType} ${method.name}(${cppParams.join(', ')}) {
    char* result = ${rustFunctionName}(${rustCallParams.join(', ')});
    if (result == nullptr) {
        return "";
    }
    std::string output(result);
    rust_free_string(result);
    return output;
}`
  } else {
    return `${cppReturnType} ${method.name}(${cppParams.join(', ')}) {
    return ${rustFunctionName}(${rustCallParams.join(', ')});
}`
  }
}).join('\n\n')}

} // namespace RustBridge
`

  // Generate C++ HybridObject class
  const hybridObjectHeader = `
${createFileMetadataString(`${cppFileName}.hpp`)}

#pragma once

#include "${name.HybridTSpec}.hpp"
#include "Rust/RustBridge.h"

namespace ${cxxNamespace} {

class ${cppClassName}: public ${name.HybridTSpec} {
public:
  ${cppClassName}() : HybridObject(TAG) {}

public:
${indent(spec.methods.map((method) => {
  const cppParams = method.parameters.map((p) => {
    const cppType = p.type.getCode('c++')
    const refType = p.type.canBePassedByReference ? `const ${cppType}&` : cppType
    return `${refType} ${p.name}`
  })
  const cppReturnType = method.returnType.getCode('c++')
  
  return `${cppReturnType} ${method.name}(${cppParams.join(', ')}) override {
    return RustBridge::${method.name}(${method.parameters.map(p => p.name).join(', ')});
  }`
}).join('\n\n'), '  ')}

protected:
  static constexpr auto TAG = "${spec.name}";
};

} // namespace ${cxxNamespace}
`

  const files: SourceFile[] = []
  
  // Rust lib.rs - Note: This should be merged into existing rust/src/lib.rs manually
  // We generate it to a separate location to avoid overwriting user implementations
  files.push({
    content: rustLibRs,
    name: 'lib.rs',
    subdirectory: ['rust', 'src'],
    language: 'rust',
    platform: 'shared',
  })
  
  // C++ RustBridge.h
  files.push({
    content: rustBridgeHeader,
    name: 'RustBridge.h',
    subdirectory: ['cpp', 'Rust'],
    language: 'c++',
    platform: 'shared',
  })
  
  // C++ RustBridge.cpp
  files.push({
    content: rustBridgeCpp,
    name: 'RustBridge.cpp',
    subdirectory: ['cpp', 'Rust'],
    language: 'c++',
    platform: 'shared',
  })
  
  // C++ HybridObject header
  files.push({
    content: hybridObjectHeader,
    name: `${cppFileName}.hpp`,
    subdirectory: ['cpp'],
    language: 'c++',
    platform: 'shared',
  })
  
  return files
}

