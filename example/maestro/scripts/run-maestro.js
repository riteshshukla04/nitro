/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync, exec, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')




function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stopRecording(pid, videoName, deviceVideoPath) {
	try {
		// Kill the adb screenrecord process
		process.kill(pid, 'SIGINT')

		// Wait 3 seconds for file to finalize
		await sleep(3000)

		// Pull the recorded file with custom name
		execSync(`adb pull ${deviceVideoPath} ${videoName}`, { stdio: 'inherit' })

		// Optionally delete the file on device
		execSync(`adb shell rm ${deviceVideoPath}`)

		console.log(`✅ Recording pulled and saved as ${videoName}`)
	} catch (err) {
		console.error('❌ Failed to stop or pull recording:', err.message)
	}
}

async function main() {
	console.log('📱 Installing app...')
	execSync('adb install ./android/app/build/outputs/apk/release/app-release.apk', {
		stdio: 'inherit',
		env: process.env,
	})

	const MAESTRO_PATH = path.join(process.env.HOME, '.maestro', 'bin', 'maestro')
	const command = `maestro test maestro/maestro.yaml`
	const deviceVideoPath = `/sdcard/maestro.mp4`

	// Start screen recording
	const recording = spawn(
		'adb',
		['shell', 'screenrecord', '--time-limit=1800', deviceVideoPath],
		{
			stdio: 'ignore',
			detached: true,
		},
	)
	const pid = recording.pid

	console.log(`\n🔄 Starting test suite.`)
	execSync(command, { stdio: 'inherit', env: process.env })

	await stopRecording(pid, 'maestro.mp4', deviceVideoPath)
}

main().catch((err) => {
	console.error('❌ Error running Maestro tests:', err)
	process.exit(1)
})
