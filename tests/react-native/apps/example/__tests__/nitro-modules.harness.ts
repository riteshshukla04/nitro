import { describe, expect, it } from 'react-native-harness'
import { HybridObject, NitroModules } from 'react-native-nitro-modules'
import nitroModulesPackage from 'react-native-nitro-modules/package.json'
import {
  HybridObject as CoreHybridObject,
  NitroModules as CoreNitroModules,
} from 'nitro-core'

describe('nitro-core integration', () => {
  it('shares the installed native proxy and native classes with React Native', () => {
    expect(NitroModules).toBe(globalThis.NitroModulesProxy)
    expect(CoreNitroModules).toBe(NitroModules)
    expect(CoreHybridObject).toBe(HybridObject)
  })
})

describe('NitroModules', () => {
  it('version matches the react-native-nitro-modules JS package', () => {
    expect(NitroModules.version).toBe(nitroModulesPackage.version)
  })

  it('getAllHybridObjectNames() includes every autolinked HybridObject', () => {
    expect(NitroModules.getAllHybridObjectNames()).toEqual(
      expect.arrayContaining([
        'BenchmarkObjectCpp',
        'BenchmarkObjectSwiftKotlin',
        'TestView',
        'RecyclableTestView',
      ])
    )
  })
})
