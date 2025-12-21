/**
 * Example: JSON to MessagePack roundtrip using Nitro Hybrid Objects
 * 
 * This demonstrates:
 * 1. Fetching JSON from a URL
 * 2. Converting JSON to MessagePack format
 * 3. Passing MessagePack ArrayBuffer to native (Kotlin/C++/Swift)
 * 4. Getting MessagePack ArrayBuffer back from native
 * 5. Converting MessagePack back to JSON
 */

import { encode, decode } from '@msgpack/msgpack'
import type { TestObjectSwiftKotlin } from 'react-native-nitro-test'
import { NitroModules } from 'react-native-nitro-modules'

export async function msgpackRoundtripExample() {
  // 1. Fetch JSON from URL
  const response = await fetch(
    'https://raw.githubusercontent.com/json-iterator/test-data/refs/heads/master/large-file.json'
  )
  const jsonData = await response.json()
  console.log('Original JSON:', jsonData)

  // 2. Convert JSON to MessagePack (ArrayBuffer)
  const msgpackBuffer = encode(jsonData)
  console.log('MessagePack size:', msgpackBuffer.byteLength, 'bytes')

  // 3. Create Hybrid Object instance
  const testObject = NitroModules.createHybridObject<TestObjectSwiftKotlin>(
    'TestObjectSwiftKotlin'
  )

  // 4. Call msgpackRoundtrip on native side (Kotlin will deserialize and reserialize)
  const resultBuffer = testObject.msgpackRoundtrip(msgpackBuffer.buffer)
  console.log('Result buffer size:', resultBuffer.byteLength, 'bytes')

  // 5. Convert MessagePack back to JSON
  const resultArray = new Uint8Array(resultBuffer)
  const decodedJson = decode(resultArray)
  console.log('Decoded JSON:', decodedJson)

  // 6. Verify the roundtrip worked
  const isEqual = JSON.stringify(jsonData) === JSON.stringify(decodedJson)
  console.log('Roundtrip successful:', isEqual)

  return {
    original: jsonData,
    decoded: decodedJson,
    isEqual,
    msgpackSize: msgpackBuffer.byteLength,
    resultSize: resultBuffer.byteLength,
  }
}

// Simple example with a small JSON object
export function simpleMsgpackExample() {
  const jsonData = {
    name: 'John Doe',
    age: 30,
    city: 'New York',
    hobbies: ['reading', 'coding', 'traveling'],
    active: true,
  }

  // Convert to MessagePack
  const msgpackBuffer = encode(jsonData)

  // Create test object
  const testObject = NitroModules.createHybridObject<TestObjectSwiftKotlin>(
    'TestObjectSwiftKotlin'
  )

  // Roundtrip through native
  const resultBuffer = testObject.msgpackRoundtrip(msgpackBuffer.buffer)

  // Decode back to JSON
  const resultArray = new Uint8Array(resultBuffer)
  const decodedJson = decode(resultArray)

  return {
    original: jsonData,
    decoded: decodedJson,
    match: JSON.stringify(jsonData) === JSON.stringify(decodedJson),
  }
}

