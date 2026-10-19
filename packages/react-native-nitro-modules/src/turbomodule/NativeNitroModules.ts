import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import { ModuleNotFoundError } from '../ModuleNotFoundError'

interface Spec extends TurboModule {
  /**
   * Installs `NitroModulesProxy` into this JS Runtime's `global`.
   * Also sets up a Dispatcher for the main JS Runtime.
   * @returns A `string` error message if this function failed to run, or `undefined` if everything went successful.
   */
  install(): string | undefined
}

// Reuse the existing proxy when the same JS runtime evaluates Nitro again,
// such as when react-native-harness loads a dedicated test bundle.
if (globalThis.NitroModulesProxy == null) {
  // 1. Get (and initialize) the TurboModule
  let turboModule: Spec | undefined
  try {
    turboModule = TurboModuleRegistry.getEnforcing<Spec>('NitroModules')
  } catch (e) {
    throw new ModuleNotFoundError(e)
  }

  // 2. Install Dispatcher and install `NitroModulesProxy` into the Runtime's `global`
  const errorMessage = turboModule.install()
  if (errorMessage != null) {
    throw new Error(`Failed to install Nitro: ${errorMessage}`)
  }

  // 3. Find `NitroModulesProxy` in `global`
  if (globalThis.NitroModulesProxy == null) {
    const cause = new Error(
      'NitroModules was installed, but `global.NitroModulesProxy` was null!'
    )
    throw new ModuleNotFoundError(cause)
  }
}
