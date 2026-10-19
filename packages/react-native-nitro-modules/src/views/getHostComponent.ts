import {
  NativeComponentRegistry,
  type HostComponent,
  type ViewProps,
} from 'react-native'
import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from './HybridView'

type AttributeValue<T, V = T> =
  | boolean
  | {
      diff?: (arg1: T, arg2: T) => boolean
      process?: (arg1: V) => T
    }

export interface ViewConfig<Props> {
  uiViewClassName: string
  supportsRawText?: boolean
  bubblingEventTypes: Record<string, unknown>
  directEventTypes: Record<string, unknown>
  validAttributes: {
    [K in keyof Props]: AttributeValue<Props[K]>
  }
}
type ReactNativeViewConfig = ReturnType<
  Parameters<typeof NativeComponentRegistry.get>[1]
>

function typesafe<Props>(config: ViewConfig<Props>): ReactNativeViewConfig {
  // TODO: Remove this unsafe cast and make it safe
  return config as ReactNativeViewConfig
}

/**
 * Represents all default props a Nitro HybridView has.
 */
interface DefaultHybridViewProps<RefType> {
  /**
   * A `ref` to the {@linkcode HybridObject} this Hybrid View is rendering.
   *
   * Receives the native HybridView instance as a function prop.
   * @example
   * ```jsx
   * function App() {
   *   return (
   *     <HybridScrollView
   *       hybridRef={(ref) => {
   *         ref.scrollTo(400)
   *       }}
   *     />
   *   )
   * }
   * ```
   */
  hybridRef?: (ref: RefType) => void
}

/**
 * Represents a React Native view, implemented as a Nitro View, with the given props and methods.
 *
 * @note Every React Native view has a {@linkcode DefaultHybridViewProps.hybridRef hybridRef} which can be used to gain access
 *       to the underlying Nitro {@linkcode HybridView}.
 * @note Every method can be called on the Ref. Including setting properties directly.
 */
export type ReactNativeView<
  Props extends HybridViewProps,
  Methods extends HybridViewMethods,
> = HostComponent<
  DefaultHybridViewProps<HybridView<Props, Methods>> & Props & ViewProps
>

type ValidAttributes<Props> = ViewConfig<Props>['validAttributes']
/**
 * Wraps all valid attributes of {@linkcode TProps} using Nitro's
 * default `diff` and `process` functions. The identity processor preserves
 * function props as raw JSI values instead of React Native event markers.
 */
function wrapValidAttributes<TProps>(
  attributes: ValidAttributes<TProps>
): ValidAttributes<TProps> {
  const keys = Object.keys(attributes) as (keyof ValidAttributes<TProps>)[]
  for (const key of keys) {
    attributes[key] = {
      diff: (a, b) => a !== b,
      process: (i) => i,
    }
  }
  return attributes
}

/**
 * Finds and returns a native view (aka "HostComponent") via the given {@linkcode name}.
 *
 * The view is bridged to a native Hybrid Object using Nitro Views.
 */
export function getHostComponent<
  Props extends HybridViewProps,
  Methods extends HybridViewMethods,
>(
  name: string,
  getViewConfig: () => ViewConfig<Props>
): ReactNativeView<Props, Methods> {
  return NativeComponentRegistry.get(name, () => {
    const config = getViewConfig()
    config.validAttributes = wrapValidAttributes(config.validAttributes)
    return typesafe(config)
  })
}
