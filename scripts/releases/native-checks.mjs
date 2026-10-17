import { tmpdir } from 'node:os'
import path from 'node:path'
import { run } from './lib.mjs'

export function checkNativeBuilds(root) {
  run('bun', ['run', 'specs'], {
    cwd: path.join(root, 'tests/react-native/packages/react-native-nitro-test'),
  })
  run('bun', ['run', 'test', '--runInBand'], {
    cwd: path.join(root, 'packages/react-native-nitro-modules'),
  })
  run('bun', ['test', 'scripts/performance'], { cwd: root })
  for (const app of ['example', 'benchmark']) {
    const appRoot = path.join(root, 'tests/react-native/apps', app)
    run('bundle', ['install'], { cwd: appRoot })
    run('bundle', ['exec', 'pod', 'install'], {
      cwd: path.join(appRoot, 'ios'),
    })
  }
  run(
    'xcodebuild',
    [
      '-workspace',
      'NitroExample.xcworkspace',
      '-scheme',
      'NitroExample',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      path.join(
        process.env.RUNNER_TEMP ?? tmpdir(),
        'nitro-release-derived-data'
      ),
      'ONLY_ACTIVE_ARCH=YES',
      'ARCHS=arm64',
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ],
    { cwd: path.join(root, 'tests/react-native/apps/example/ios') }
  )
  run(
    './gradlew',
    [':app:assembleDebug', '--no-daemon', '-PreactNativeArchitectures=x86_64'],
    { cwd: path.join(root, 'tests/react-native/apps/example/android') }
  )
}
