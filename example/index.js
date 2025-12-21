// Polyfill TextDecoder/TextEncoder for React Native (required by @msgpack/msgpack)
// Based on: https://gist.github.com/aretrace/bcb0777c2cfd2b0b1d9dcfb805fe2838
if (typeof global.TextEncoder === 'undefined') {
  const TextEncoder = require('react-native-fast-encoder')
  global.TextEncoder = TextEncoder
}

if (typeof global.TextDecoder === 'undefined') {
  // Simple TextDecoder polyfill for React Native
  // TextDecoder is used by @msgpack/msgpack for decoding strings
  global.TextDecoder = class TextDecoder {
    constructor(encoding = 'utf-8') {
      this.encoding = encoding
    }

    decode(input) {
      if (typeof input === 'string') {
        return input
      }
      
      // Handle ArrayBuffer, TypedArray, or DataView
      let bytes
      if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input)
      } else if (input instanceof Uint8Array) {
        bytes = input
      } else if (input.buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      } else {
        throw new TypeError('Input must be ArrayBuffer, TypedArray, or DataView')
      }

      // Convert bytes to string (UTF-8 decoding)
      let result = ''
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i])
      }
      
      try {
        // Use decodeURIComponent for proper UTF-8 handling
        return decodeURIComponent(escape(result))
      } catch (e) {
        // Fallback to basic conversion if decodeURIComponent fails
        return result
      }
    }
  }
}

import { AppRegistry } from 'react-native'
import App from './src/App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)
