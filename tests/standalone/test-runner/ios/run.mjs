import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const defaults = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)))
const { values } = parseArgs({
  options: {
    'os': { type: 'string', default: defaults.os },
    'device': { type: 'string' },
    'arch': { type: 'string', default: defaults.arch },
    'jobs': {
      type: 'string',
      default: process.env.NITRO_TEST_JOBS ?? String(defaults.jobs),
    },
    'destination': { type: 'string', default: process.env.NITRO_IOS_DESTINATION },
    'sanitizer': { type: 'string', default: 'none' },
    'workers': { type: 'string', default: process.env.NITRO_TEST_WORKERS ?? 'auto' },
    'derived-data': { type: 'string' },
    'skip-hermes-build': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h' },
  },
})
if (values.help) {
  console.log(`Usage: bun tests/standalone/test-runner/ios/run.mjs [options]

Defaults live in tests/standalone/test-runner/ios/config.json.
  --os VERSION          Simulator OS, e.g. 26 or 26.5 (default: ${defaults.os})
  --device NAME         Exact simulator name (default: ${defaults.device ?? 'first available iPhone'})
  --arch ARCH           auto, arm64 or x86_64 (default: ${defaults.arch})
  --jobs N              Parallel build jobs (default: ${defaults.jobs})
  --destination VALUE   Explicit xcodebuild destination, overriding OS/device selection
  --sanitizer MODE      none, address or thread (default: none)
  --workers N           Runtime groups that run at once, or auto for one per CPU core (default: auto)
  --derived-data PATH   Xcode DerivedData directory (default: tests/standalone/.build/ios/<sanitizer>/DerivedData)
  --skip-hermes-build    Reuse an XCFramework already built for this architecture/toolchain
  -h, --help            Show this help

DEVELOPER_DIR selects Xcode. NITRO_IOS_DESTINATION, NITRO_TEST_JOBS and NITRO_TEST_WORKERS remain supported.`)
  process.exit(0)
}
if (!/^\d+(\.\d+){0,2}$/.test(values.os)) {
  throw new Error('--os must be a version such as 26 or 26.5')
}
if (!['auto', 'arm64', 'x86_64'].includes(values.arch)) {
  throw new Error('--arch must be auto, arm64 or x86_64')
}
if (!['none', 'address', 'thread'].includes(values.sanitizer)) {
  throw new Error('--sanitizer must be none, address or thread')
}
const architecture = values.arch === 'auto' ? { arm64: 'arm64', x64: 'x86_64' }[process.arch] : values.arch
if (!architecture) throw new Error(`Unsupported host architecture: ${process.arch}`)
const jobs = Number(values.jobs)
if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error('--jobs must be a positive integer')
if (values.workers !== 'auto' && !(Number.isSafeInteger(Number(values.workers)) && Number(values.workers) >= 1)) {
  throw new Error('--workers must be auto or a positive integer')
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const environment = { ...process.env }
// A single cooperative worker catches native runners that block Swift Tasks
// needed to resolve their JavaScript Promises.
environment.TEST_RUNNER_LIBDISPATCH_COOPERATIVE_POOL_STRICT = '1'
const started = Date.now()
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)} s`
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr ?? '')
    process.exit(result.status ?? 1)
  }
  return result.stdout
}

let destination = values.destination
if (!destination) {
  const { devices } = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], true))
  const deviceName = values.device ?? defaults.device
  const runtimes = Object.keys(devices)
    .filter((name) => {
      const version = name.split('.iOS-')[1]?.replaceAll('-', '.')
      return version === values.os || version?.startsWith(`${values.os}.`)
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .reverse()
  const device = runtimes
    .flatMap((runtime) => devices[runtime])
    .find((item) => (deviceName ? item.name === deviceName : item.name.startsWith('iPhone')))
  if (!device)
    throw new Error(
      `No available ${deviceName ?? 'iPhone'} simulator matches iOS ${values.os}. Install one or select --os, --device or --destination.`
    )
  destination = `platform=iOS Simulator,id=${device.udid}`
  // Xcode can start tests while a fresh simulator is still migrating data.
  // Finish booting before starting the test watchdogs. Booting during the
  // build was no faster on 3-core CI machines: both compete for the CPU.
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'])
  console.log(`Simulator booted after ${elapsed()}`)
}
if (values['skip-hermes-build']) {
  const framework = path.join(root, 'tests/standalone/.build/hermes/NitroTestHermes.xcframework')
  if (!existsSync(path.join(framework, 'Info.plist'))) {
    throw new Error('No Hermes XCFramework found. Run without --skip-hermes-build first.')
  }
} else {
  run(process.execPath, [
    'tests/standalone/hermes/build.mjs',
    'ios',
    '--arch',
    architecture,
    '--jobs',
    String(jobs),
    '--deployment-target',
    defaults.deploymentTarget,
  ])
}
const buildDirectory = path.join(root, 'tests/standalone/.build/ios', values.sanitizer)
const results = path.join(buildDirectory, 'results', `RuntimeTests-${Date.now()}-${process.pid}`)
mkdirSync(results, { recursive: true })
// The tests append one JSON line per runtime group to this file.
const groupReport = path.join(results, 'runtime-groups.jsonl')
environment.TEST_RUNNER_NITRO_TEST_REPORT = groupReport
if (values.workers !== 'auto') environment.TEST_RUNNER_NITRO_TEST_WORKERS = values.workers
if (values.sanitizer !== 'none') {
  const option = values.sanitizer === 'address' ? 'ASAN_OPTIONS' : 'TSAN_OPTIONS'
  // xcodebuild forwards TEST_RUNNER_ variables to every test process. Preserve
  // Xcode's options, but make a sanitizer finding terminate the test runner.
  environment[`TEST_RUNNER_${option}`] = `__CURRENT_VALUE__:halt_on_error=1:abort_on_error=1:log_path=${path.join(results, 'sanitizer')}`
}
const derivedData = values['derived-data'] ? path.resolve(values['derived-data']) : path.join(buildDirectory, 'DerivedData')
const buildSettings = [
  '-project',
  'tests/standalone/test-runner/ios/NitroRuntimeTests.xcodeproj',
  '-scheme',
  'NitroRuntimeTests',
  '-destination',
  destination,
  '-derivedDataPath',
  derivedData,
  '-enableAddressSanitizer',
  values.sanitizer === 'address' ? 'YES' : 'NO',
  '-enableThreadSanitizer',
  values.sanitizer === 'thread' ? 'YES' : 'NO',
  '-jobs',
  String(jobs),
  'CODE_SIGNING_ALLOWED=NO',
  `ARCHS=${architecture}`,
  `IPHONEOS_DEPLOYMENT_TARGET=${defaults.deploymentTarget}`,
]
// Testing from the .xctestrun file that build-for-testing wrote skips loading
// the project and resolving the Swift package graph a second time.
const testRunFile = () => {
  const products = path.join(derivedData, 'Build', 'Products')
  const [newest] = readdirSync(products)
    .filter((name) => name.endsWith('.xctestrun'))
    .map((name) => path.join(products, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!newest) throw new Error(`build-for-testing wrote no .xctestrun file to ${products}`)
  return newest
}
const argumentsForTests = () => [
  'test-without-building',
  '-xctestrun',
  testRunFile(),
  '-destination',
  destination,
  '-resultBundlePath',
  path.join(results, 'RuntimeTests.xcresult'),
  // On a failure, xcodebuild otherwise spends about ten minutes in
  // `simctl diagnose`. The result bundle and logs already hold the failure.
  '-collect-test-diagnostics',
  'never',
  '-parallel-testing-enabled',
  'YES',
  // Swift Testing runs cases concurrently inside this one test process.
  // RuntimeTests.swift runs one runtime group per CPU core (see --workers).
  '-parallel-testing-worker-count',
  '1',
]
const log = openSync(path.join(results, 'xcodebuild.log'), 'w')
let sanitizerFailure = false
const diagnostic = /(?:ERROR|WARNING|SUMMARY): (?:Address|Thread)Sanitizer:/
const outputTails = new Map()
const xcodebuild = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('xcodebuild', args, {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (const [source, target] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      source.on('data', (chunk) => {
        target.write(chunk)
        writeSync(log, chunk)
        const output = (outputTails.get(source) ?? '') + chunk.toString()
        sanitizerFailure ||= diagnostic.test(output)
        outputTails.set(source, output.slice(-256))
      })
    }
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
let status = await xcodebuild(['build-for-testing', ...buildSettings])
console.log(`Built for testing after ${elapsed()}`)
if (status === 0) {
  status = await xcodebuild(argumentsForTests())
  console.log(`Tests finished after ${elapsed()}`)
}
closeSync(log)
for (const name of readdirSync(results).filter((name) => name.startsWith('sanitizer.'))) {
  const report = readFileSync(path.join(results, name), 'utf8')
  if (report.trim()) {
    process.stderr.write(report)
    sanitizerFailure = true
  }
}
if (existsSync(groupReport)) {
  const groups = readFileSync(groupReport, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const total = (key) => groups.reduce((sum, group) => sum + group[key], 0)
  const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`
  const workers = Math.max(...groups.map((group) => group.workers ?? 0))
  console.log(
    `Runtime groups: ${groups.length} groups, ${total('runtimes')} Hermes runtimes, ${total('cases')} cases, ${total('failures')} failed${
      workers > 0 ? `, ${workers} workers` : ''
    }`
  )
  console.log(
    `  summed over workers: setup ${seconds(total('setupMs'))}, cases ${seconds(total('casesMs'))}, teardown ${seconds(total('teardownMs'))}`
  )
  const slowest = groups
    .map((group) => ({ ...group, ms: group.setupMs + group.casesMs + group.teardownMs }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
  console.log(`  slowest: ${slowest.map((group) => `${group.name} ${seconds(group.ms)}`).join(', ')}`)
}
console.log(`Test results: ${results}`)
if (sanitizerFailure) console.error('Sanitizer reported an error.')
process.exitCode = status || (sanitizerFailure ? 1 : 0)
