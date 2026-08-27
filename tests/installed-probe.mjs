// Runtime check of the INSTALLED copy from inside the profile context:
// the installed lib's bare imports resolve through the profile's hoisted
// node_modules wherever this probe lives (Node anchors on the module URL).
import assert from 'node:assert/strict'
import os from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
// Installed copy inside your DSH profile; override with DSH_GITHUB_MANAGER_PROBE
// if your home directory or profile layout differs.
const target = process.env.DSH_GITHUB_MANAGER_PROBE
  ?? join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-github-manager', 'lib', 'index.js')
const plugin = await import(pathToFileURL(target).href)
assert.equal(plugin.name, 'dsh-github-manager')
assert.deepEqual(plugin.inject, ['tools'])
assert.ok(plugin.Config && ['function', 'object'].includes(typeof plugin.Config), 'Config schema present (schemastery schemas are callable)')
const registered = []
// Minimal cordis surface: the installed plugin injects ['tools'] and binds
// its settings namespace through ctx.inject(['settings']) - no provider here,
// so the composition-layer config must carry the registration (same no-
// settings path the smoke test asserts).
const ctx = {
  logger: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
  tools: { register: (t) => registered.push(t) },
  effect: (fn) => fn(),
  fiber: { state: 2 },
  inject: (deps, cb) => {
    if (deps.includes('settings')) return undefined // provider absent: skip
    return cb(ctx)
  },
}
plugin.apply(ctx, { enabled: true, token: 'probe', baseUrl: 'https://api.github.com', webUrl: 'https://github.com', timeoutMs: 5000, dryRun: false })
assert.equal(registered.length, 27, '27 tools registered, got ' + registered.length)
for (const t of registered) assert.equal(typeof t.execute, 'function', t.name + ' has execute')
console.log('installed-copy check: OK (' + registered.length + ' tools, deps resolved from profile node_modules)')
