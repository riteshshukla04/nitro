import { fileURLToPath } from 'node:url'
import { git, npmTagFor, parseVersion } from './lib.mjs'

process.chdir(fileURLToPath(new URL('../../', import.meta.url)))
const [version, requestedTag] = process.argv.slice(2)
if (process.argv.length < 3 || process.argv.length > 4)
  throw new Error('Usage: bun release VERSION [npm-tag]')
parseVersion(version)
const npmTag = npmTagFor(version, requestedTag)
const branch = git(['branch', '--show-current'])
if (!['main', 'core-split'].includes(branch))
  throw new Error('Switch to main or core-split before requesting a release')
git(['fetch', 'origin', branch])
const commit = git(['rev-parse', `origin/${branch}`])
const request = `release-request/${branch}/${version}/${npmTag}/${Date.now()}`
// A push trigger works before the workflow has been merged into the default branch.
// CI releases the remote branch tip, then removes this request branch on success.
git(['push', 'origin', `${commit}:refs/heads/${request}`], { capture: false })
console.log(
  `Requested ${version} from ${branch}@${commit}. Follow https://github.com/margelo/nitro/actions/workflows/release.yml`
)
