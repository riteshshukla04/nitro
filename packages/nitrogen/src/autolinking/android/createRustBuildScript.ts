import { createFileMetadataString } from '../../syntax/helpers.js'
import type { SourceFile } from '../../syntax/SourceFile.js'

export interface ShellScriptFile extends Omit<SourceFile, 'language'> {
  language: 'shell'
}

/**
 * Checks if any HybridObject uses Rust by checking if there are any Rust files generated
 */
export function hasRustFiles(allFiles: SourceFile[]): boolean {
  return allFiles.some((f) => f.language === 'rust')
}

/**
 * Generates the Rust build script for Android
 */
export function createRustBuildScript(): ShellScriptFile {
  const code = `
${createFileMetadataString('rn-build-start.sh', '#')}

echo "🔥 Building Rust Module"

cd ..
cd rust
pwd
rm -rf Cargo.lock
rm -rf target
rm -rf ios
rm -rf include
cp Cargo.toml.android Cargo.toml
~/.cargo/bin/cargo ndk -t armeabi-v7a -t arm64-v8a -t x86_64 -t x86  build --release
cd ..
cd android
  `.trim()

  return {
    content: code,
    language: 'shell',
    name: 'rn-build-start.sh',
    platform: 'android',
    subdirectory: ['scripts'],
  }
}

/**
 * Generates the Gradle configuration block for Rust builds
 */
export function createRustGradleConfig(): string {
  return `
gradle.taskGraph.whenReady { taskGraph ->
    println "🔥 Building Rust Module"
    // Script is generated in nitrogen/generated/android/scripts/, relative to android/ directory
    def scriptPath = new File(projectDir, '../nitrogen/generated/android/scripts/rn-build-start.sh')
    def process = ['sh', scriptPath.absolutePath].execute(null, projectDir)
    process.in.eachLine { line -> println line }
    process.err.eachLine { line -> System.err.println line }
    process.waitFor()
    if (process.exitValue() != 0) {
        throw new GradleException("Rust build failed with exit code \${process.exitValue()}")
    }
}
  `.trim()
}

