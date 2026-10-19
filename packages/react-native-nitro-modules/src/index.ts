import './turbomodule/NativeNitroModules'
import { installWorkletsSupport } from './worklets/installWorkletsSupport'

export * from 'nitro-core'

export * from './views/HybridView'
export * from './views/getHostComponent'

installWorkletsSupport()
