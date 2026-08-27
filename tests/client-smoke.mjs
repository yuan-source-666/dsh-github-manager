/**
 * Browser-half smoke test for the dsh-github-manager client bundle.
 *
 * Loads lib/client.js through a fake window.__ModuleLoader__ (exactly what
 * the web shell's module system does), then drives the exported apply() with
 * stub cordis services and asserts the card's contract: registration lands in
 * 'settings.plugin.item' under the paired namespace key, the injected face
 * exposes wired actions, and every user operation writes the right field to
 * the bound settings scope.
 */

import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- Minimal react/jsx-runtime stub (the shell seeds the real one) ----
const Fragment = Symbol.for('react.fragment')
const reactStub = {
  Fragment,
  jsx: (type, props, key) => ({ $$typeof: 0xeac7, type, key: key ?? null, props: props ?? {} }),
  jsxs: (type, props, key) => ({ $$typeof: 0xeac7, type, key: key ?? null, props: props ?? {} }),
}
// ---- Minimal bare-react stub: useState with a fixed initial value ----
const reactRuntimeStub = { useState: (init) => [init, () => {}] }

// ---- Minimal createSnapshotStore stub (runtime's is identical in shape) ----
const createSnapshotStore = (init) => {
  let value = init
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { if (next !== value) { value = next; for (const fn of [...listeners]) fn() } },
  }
}

// ---- Load the bundle through the fake loader, just like the shell ----
let clientExports
globalThis.window = {
  __ModuleLoader__: {
    load: (spec) => {
      assert.strictEqual(spec.id, 'dsh-github-manager')
      clientExports = spec.factory((bare) => {
        if (bare === 'react/jsx-runtime') return reactStub
        if (bare === 'react') return reactRuntimeStub
        if (bare === '@deepseek-ai/dsh-client-runtime/client') return { createSnapshotStore }
        throw new Error('unexpected bare specifier: ' + bare)
      })
    },
  },
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
eval(readFileSync(join(root, 'lib', 'client.js'), 'utf8'))

assert.ok(clientExports, 'factory produced exports')
assert.strictEqual(typeof clientExports.apply, 'function', 'apply is exported')
assert.deepStrictEqual([...clientExports.inject].sort(), ['connection', 'locale', 'remote', 'settingsScope', 'slots'].sort(), 'inject declares the five services')

// ---- Fake cordis/settings services ----
function makeScope(fields) {
  let revision = 1
  let value = { ...fields }
  let base = { ...fields }
  const user = {}
  const listeners = new Set()
  const writes = []
  const snapshot = () => ({ status: 'ready', writable: true, value, base, user, revision })
  return {
    calls: writes,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getSnapshot: snapshot,
    set(field, next) {
      writes.push(['set', field, next])
      user[field] = next
      value[field] = next
      revision += 1
      for (const fn of [...listeners]) fn()
      return Promise.resolve()
    },
    unset(field) {
      writes.push(['unset', field])
      delete user[field]
      value[field] = base[field] ?? undefined
      revision += 1
      for (const fn of [...listeners]) fn()
      return Promise.resolve()
    },
  }
}

const scopes = {}
const registrations = []
const ctx = {
  effect(fn) { const off = fn(); return () => { if (typeof off === 'function') off() } },
  locale: { register: (ns) => { assert.strictEqual(ns, 'settings.githubManager') } },
  settingsScope: {
    bind: ({ namespace }) => (scopes[namespace] ??= makeScope({ enabled: true, baseUrl: 'https://api.github.com', webUrl: 'https://github.com', timeoutMs: 30000, dryRun: false })),
  },
  slots: {
    inject(_name, fn) { fn() },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

clientExports.apply(ctx)

// ---- Registration landed in the right slot cell ----
assert.strictEqual(registrations.length, 1, 'exactly one card registered')
const { options, component } = registrations[0]
assert.strictEqual(options.name, 'settings.plugin.item')
assert.strictEqual(options.key, 'dsh-github-manager', 'paired namespace key')
assert.strictEqual(options.locale, 'settings.githubManager')

// ---- The component renders an element for a live state ----
const face = options.inject()
assert.strictEqual(typeof face.hooks.githubCard.getSnapshot, 'function')
const snapshot = face.hooks.githubCard.getSnapshot()
const element = component({
  t: (k) => k,
  useGithubCard: (sel) => sel(snapshot),
  toggle: face.toggle,
  edit: face.edit,
  editToken: face.editToken,
  resetField: face.resetField,
  save: face.save,
  discard: face.discard,
})
assert.ok(element, 'component rendered')
assert.strictEqual(snapshot.available, true, 'initial state available')
assert.strictEqual(snapshot.enabled.value, true, 'enabled defaults via section value')

// ---- Drive the user operations against the real scope ----
const scope = scopes['dsh-github-manager']

// 1. toggle the master switch off, save -> writes enabled=false
face.toggle('enabled', false)
assert.strictEqual(face.hooks.githubCard.getSnapshot().enabled.value, false, 'toggle stages immediately')
assert.strictEqual(face.hooks.githubCard.getSnapshot().dirty, true)
await face.save()
assert.deepStrictEqual(scope.calls, [['set', 'enabled', false]], 'save wrote enabled')
scope.calls.length = 0

// 2. type + save a token -> writes secret token
face.editToken('ghp_123456')
await face.save()
assert.deepStrictEqual(scope.calls, [['set', 'token', 'ghp_123456']], 'save wrote token')
scope.calls.length = 0

// 3. edit baseUrl + save
face.edit('baseUrl', 'https://ghe.example.com/api/v3')
await face.save()
assert.deepStrictEqual(scope.calls, [['set', 'baseUrl', 'https://ghe.example.com/api/v3']])
scope.calls.length = 0

// 4. reset re-inherits -> unset
face.resetField('enabled')
await face.save()
assert.deepStrictEqual(scope.calls, [['unset', 'enabled']])
scope.calls.length = 0

// 5. discard drops drafts without writing
face.edit('webUrl', 'https://nowhere')
assert.strictEqual(face.hooks.githubCard.getSnapshot().dirty, true)
face.discard()
assert.strictEqual(face.hooks.githubCard.getSnapshot().dirty, false)
await face.save()
assert.strictEqual(scope.calls.length, 0, 'discarded draft never wrote')

// 6. invalid timeout draft is refused (no write) and flags failed
face.edit('timeoutMs', 'not-a-number')
face.save()
await Promise.resolve() // let the guard run
const after = face.hooks.githubCard.getSnapshot()
assert.strictEqual(after.timeoutMs.invalid, true)
assert.strictEqual(after.failed, true)
assert.strictEqual(scope.calls.length, 0, 'invalid draft blocked the save')

console.log('PASS: client half smoke test (registration, render, toggle/token/edit/reset/discard/invalid)')
