# Android runtime tests

This Android library project runs JUnit 4 instrumentation tests against Hermes, JSI, Nitro, and the generated Kotlin fixture. It has no Activity or application UI. An emulator or device is required because Nitro's Kotlin helpers use Android APIs and its JNI code links Android native libraries.

The build uses three local Gradle projects:

- `:hermes` in `tests/standalone/hermes/android` builds the pinned engine and JSI as `libhermesvm.so` and exports its headers through Prefab.
- `:nitro-core` in `tests/standalone/nitro-core/android` builds the core C++/Kotlin sources as `libNitroModules.so` and exports the `NitroModules` headers.
- This project builds the generated fixture and test host as `libNitroRuntimeTests.so`, depending on those two projects.

Only the core module selects Nitro implementation sources and registers core JNI bindings. The test host initializes that module before loading its own library, whose JNI entry point registers the fixture and test bridge.

Use the Bun version pinned in the root `package.json`, JDK 17, Android SDK 36, NDK `29.0.14206865`, and CMake `3.22.1`. The checked-in Gradle wrapper downloads Gradle 8.13. Install Android SDK components with Android Studio or `sdkmanager`:

```sh
sdkmanager 'platforms;android-36' 'build-tools;35.0.0' 'ndk;29.0.14206865' 'cmake;3.22.1'
```

SDK, minimum Android API, NDK, CMake and ABI defaults live in [`gradle.properties`](gradle.properties) and are shared by all three projects.

From the repository root, prepare the shared fixtures and test bundle:

```sh
git submodule update --init --recursive
bun install --frozen-lockfile
bun test:prepare
```

Start an Android emulator or connect a device visible in `adb devices`, then run:

```sh
cd tests/standalone/runtime/android
./gradlew :connectedDebugAndroidTest
```

The default ABI is `arm64-v8a`, suitable for Apple Silicon emulators and ARM64 devices. For an Intel emulator, append `-PnitroTestAbi=x86_64`. The Hermes module invokes its host build script with Bun; Gradle builds the three Android libraries in dependency order. `./gradlew :assembleDebugAndroidTest` builds the instrumentation APK without running it.

The leading `:` selects the runtime project's tests. The dependency libraries have no test suites of their own.

To run AddressSanitizer on an API 33 x86_64 emulator:

```sh
./gradlew :connectedDebugAndroidTest -PnitroTestAbi=x86_64 -PnitroSanitizer=address
```

ASan instruments Core and the native fixtures/test host. The test APK includes the NDK's ASan runtime and startup wrapper; Hermes remains uninstrumented. Omit `-PnitroSanitizer` for a normal run. CI keeps ASan on API 33, the emulator image previously used for the sanitized Harness tests.

`HybridObjectTest` reads the generated `runtime-tests.json` manifest and runs each JavaScript case as a named JUnit parameter. Adding a shared JS test requires no Kotlin changes. Missing, empty, malformed, or duplicate manifest entries fail discovery. JavaScript failures become JUnit assertion failures with the case name and stack.

`NativeTestRuntimeTest` separately verifies rejected promises, synchronous exceptions, and both pending-promise and infinite-loop timeouts.

Reports are written to `build/reports/androidTests/connected/debug/`, with machine-readable results under `build/outputs/androidTest-results/`. CI runs normal tests on API 36 and ASan tests on API 33, both using x86_64 emulators, and uploads separate results with the JavaScript bundle, manifest, and source map.
