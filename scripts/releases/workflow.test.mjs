import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
const androidArtifacts = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/build-android-release.yml', import.meta.url), 'utf8'))
const androidJobs = ['test-runtime-android', 'build-android', 'harness-android']

// These workflow conditions use boolean operators, strings and property access.
// Convert GitHub's hyphenated property names before evaluating that subset.
function evaluate(expression, { cancelled = false, ...context } = {}) {
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => `[${JSON.stringify(name)}]`)
  return new Function(...Object.keys(context), 'cancelled', 'startsWith', 'contains', `return (${source})`)(
    ...Object.values(context),
    () => cancelled,
    (value, prefix) => (value ?? '').startsWith(prefix),
    (value, part) => (value ?? '').includes(part)
  )
}

function prerequisites(branch) {
  const needs = Object.fromEntries(workflow.jobs.release.needs.map((name) => [name, { result: 'success' }]))
  needs.resolve.outputs = { branch, commit: 'a'.repeat(40) }
  return needs
}

test('main and v1 require every check, including Android', () => {
  for (const branch of ['main', 'v1']) {
    const needs = prerequisites(branch)
    assert.equal(evaluate(workflow.jobs.release.if, { needs }), true)
    assert.equal(evaluate(workflow.jobs.release.if, { needs, cancelled: true }), false)
    for (const name of workflow.jobs.release.needs) {
      for (const result of ['failure', 'cancelled', 'skipped']) {
        const changed = structuredClone(needs)
        changed[name].result = result
        assert.equal(evaluate(workflow.jobs.release.if, { needs: changed }), false, `${branch}: ${name} ${result} must block publication`)
      }
    }
  }
  for (const name of androidJobs) assert.equal(workflow.jobs[name].if, undefined)
  assert.equal(evaluate(workflow.jobs.release.if, { needs: prerequisites('other') }), false)
})

test('branch pushes and alpha release events select the correct release branch', () => {
  const expression = workflow.jobs.resolve.outputs.branch
  for (const [event, ref, tag, expected] of [
    ['push', 'main', '', 'main'],
    ['push', 'v1', '', 'v1'],
    ['workflow_dispatch', 'v1', '', 'v1'],
    ['release', '', 'v1.0.0-alpha.nightly.50.g123456789abc', 'v1'],
    ['release', '', 'v1.0.0-alpha.1', 'v1'],
    ['release', '', 'v0.37.2-nightly.45.g123456789abc', 'main'],
    ['release', '', 'v1.0.0', 'main'],
  ]) {
    assert.equal(
      evaluate(expression, {
        github: {
          event_name: event,
          ref_name: ref,
          event: { release: { tag_name: tag } },
        },
      }),
      expected
    )
  }
})

test('Android artifact builds include v1 alpha releases', () => {
  assert.equal(androidArtifacts.jobs.build_release.if, undefined)
  for (const tag of [
    'v1.0.0-alpha.nightly.50.g123456789abc',
    'v1.0.0-alpha.1',
    'v1.2.3-alpha.1',
    'v0.37.2-nightly.45.g123456789abc',
    'v1.0.0',
  ]) {
    assert.equal(
      evaluate(workflow.jobs['android-artifacts'].if, {
        needs: {
          release: { result: 'success', outputs: { tag: tag } },
        },
        github: { event_name: 'push' },
      }),
      true,
      tag
    )
  }
})

test('artifact jobs require successful publication and handle skipped ancestors explicitly', () => {
  for (const name of ['ios-artifacts', 'android-artifacts']) {
    const expression = workflow.jobs[name].if
    assert.match(expression, /!cancelled\(\)/)
    const context = {
      needs: {
        resolve: { result: 'success', outputs: { branch: 'main' } },
        release: { result: 'success', outputs: { tag: 'v0.37.2' } },
      },
      github: { event_name: 'push' },
    }
    assert.equal(evaluate(expression, context), true)
    assert.equal(evaluate(expression, { ...context, cancelled: true }), false)
    assert.equal(evaluate(expression, { ...context, github: { event_name: 'release' } }), false)
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const changed = structuredClone(context)
      changed.needs.release.result = result
      assert.equal(evaluate(expression, changed), false)
    }
    context.needs.release.outputs.tag = ''
    assert.equal(evaluate(expression, context), false)
  }
})
