/**
 * Runtime smoke test for the built dsh-github-manager plugin.
 * Boots the compiled lib/ against a stub ctx (capturing registered tools and
 * their disposers, a fake settings service, and a fiber state), mocks the
 * GitHub REST API via global fetch, and exercises read + mutate +
 * pagination + error normalization + dry-run + the live enabled switch +
 * token rotation through the settings namespace. No network, no API key.
 */
import assert from 'node:assert/strict'

// Load the compiled plugin relative to this file, so the test runs from any checkout location.
const plugin = await import(new URL('../lib/index.js', import.meta.url).href)

/** Stub ctx whose tools.register returns a disposer removing the tool again. */
function makeCtx(register, settingsService) {
  const c = {
    logger: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
    tools: { register },
    effect: (fn) => fn(),
    fiber: { state: 2 },
  }
  c.inject = (deps, cb) => {
    if (deps.includes('settings')) {
      if (settingsService === undefined) return undefined // provider absent: skip
      c.settings = settingsService
      return cb(c)
    }
    return cb(c)
  }
  return c
}

/** Fake ctx.settings: register resolves base+section, watch notifies updates. */
function makeSettings(section) {
  const watchers = new Set()
  return {
    register(ns, schema, opts) {
      assert.equal(ns, 'dsh-github-manager')
      return {
        get: () => ({ ...opts.base, ...section }),
        watch(cb) { watchers.add(cb); return () => watchers.delete(cb) },
      }
    },
    update(patch) { Object.assign(section, patch); for (const cb of [...watchers]) cb() },
  }
}

const calls = []
const json = (body, extra = {}) => ({
  ok: true,
  status: 200,
  headers: new Map(Object.entries({ 'x-ratelimit-remaining': '42', 'x-ratelimit-reset': '1780000000', ...extra })),
  text: async () => JSON.stringify(body),
})
const fail = (status, message) => ({ ok: false, status, headers: new Map(), text: async () => JSON.stringify({ message }) })
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  const method = init.method ?? 'GET'
  calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers })
  if (u === 'https://api.github.com/user') return json({ login: 'octocat' })
  if (u.includes('/repos/acme/widgets/issues') && method === 'POST')
    return json({ number: 7, title: 'Bug', html_url: 'https://github.com/acme/widgets/issues/7' })
  if (u.includes('/repos/acme/widgets/issues') && method === 'GET') {
    const rows = [
      { number: 1, title: 'A', state: 'open', user: { login: 'u1' }, labels: [{ name: 'bug' }], assignees: [], html_url: 'x' },
      { number: 2, title: 'P', state: 'open', user: null, labels: [], assignees: [], pull_request: {}, html_url: 'y' },
    ]
    if (u.includes('page=2')) return json([])
    const q = String.fromCharCode(34)
    const link = '<' + u + '&page=2>; rel=' + q + 'next' + q + ', <' + u + '&page=2>; rel=' + q + 'last' + q
    return json(rows, { link })
  }
  if (u.includes('/pulls/10/merge') && method === 'PUT') return json({ merged: true, sha: 'deadbeefcafe' })
  if (u.includes('/repos/acme/widgets/pulls') && method === 'GET')
    return json([{ number: 10, title: 'Feat', state: 'open', draft: false, user: { login: 'dev' }, head: { ref: 'feat' }, base: { ref: 'main' }, html_url: 'z' }])
  if (u.includes('/contents/README.md') && method === 'GET')
    return json({ type: 'file', encoding: 'base64', size: 7, name: 'README.md', path: 'README.md', sha: 'blobsha1', content: Buffer.from('# hello').toString('base64'), html_url: 'h' })
  if (u.includes('/contents/README.md') && method === 'PUT')
    return json({ content: { sha: 'blobsha2', path: 'README.md' }, commit: { sha: 'commitsha1234567' } })
  if (u.includes('/search/issues'))
    return json({ total_count: 1, items: [{ number: 3, title: 'Found', state: 'closed', html_url: 'w' }] })
  if (u.includes('/repos/missing/nope')) return fail(404, 'Not Found')
  return fail(401, 'Bad credentials')
}

const entryConfig = { enabled: true, token: 'test-token', baseUrl: 'https://api.github.com', webUrl: 'https://github.com', timeoutMs: 5000, dryRun: false }

/** Collect registered tools with disposer-backed removal. */
function collector() {
  const registered = []
  const register = (t) => {
    registered.push(t)
    return () => { const i = registered.indexOf(t); if (i >= 0) registered.splice(i, 1) }
  }
  return { registered, register, tool: (n) => registered.find((t) => t.name === n) }
}

// ---- boot WITH a settings service (the Web profile) ----
const settings = makeSettings({ ...entryConfig })
const c1 = collector()
plugin.apply(makeCtx(c1.register, settings), entryConfig)
assert.equal(c1.registered.length, 20, 'expected 20 tools')
const names = c1.registered.map((t) => t.name).sort()
assert.ok(names.includes('github_ping') && names.includes('github_merge_pull') && names.includes('github_write_file'))

const r1 = await c1.tool('github_ping').execute({})
assert.equal(r1.login, 'octocat')
assert.equal(r1.rateLimitRemaining, 42)
console.log('ping:', JSON.stringify(r1))

const r2 = await c1.tool('github_create_issue').execute({ owner: 'acme', repo: 'widgets', title: 'Bug', body: 'b', labels: ['bug'] })
assert.equal(r2.number, 7)
assert.equal(calls.at(-1).headers.Authorization, 'Bearer test-token')
console.log('create_issue: ok')

const r3 = await c1.tool('github_list_issues').execute({ owner: 'acme', repo: 'widgets', state: 'open' })
assert.equal(r3.count, 1, 'PR row filtered out')
console.log('list_issues: pagination ok')

const r4 = await c1.tool('github_merge_pull').execute({ owner: 'acme', repo: 'widgets', number: 10, method: 'squash' })
assert.equal(r4.merged, true)
console.log('merge_pull: ok')

const r5 = await c1.tool('github_read_file').execute({ owner: 'acme', repo: 'widgets', path: 'README.md' })
assert.equal(r5.content, '# hello')
const r6 = await c1.tool('github_write_file').execute({ owner: 'acme', repo: 'widgets', path: 'README.md', content: '# new', message: 'm', sha: 'blobsha1' })
assert.equal(r6.commitSha, 'commitsha1234567')
const r7 = await c1.tool('github_search_issues').execute({ query: 'repo:acme/widgets is:issue' })
assert.equal(r7.total, 1)
const rendered = c1.tool('github_list_issues').output.render({}, { issues: [{ number: 1, title: 'A', state: 'open', author: 'u', labels: ['bug'], assignees: [], url: 'x' }], count: 1 })
assert.ok(rendered[0].text.includes('#1'))
let err404
try { await c1.tool('github_get_repo').execute({ owner: 'missing', repo: 'nope' }) } catch (e) { err404 = e }
assert.equal(err404?.status, 404)
console.log('read/write/search/render/error: ok')

// ---- live switch: settings update enabled=false unregisters everything ----
settings.update({ enabled: false })
assert.equal(c1.registered.length, 0, 'tools gone after disable')
try { await c1.tool('github_ping')?.execute({}); assert.fail('no tool') } catch (e) { assert.ok(!c1.tool('github_ping'), 'ping absent') }
settings.update({ enabled: true })
assert.equal(c1.registered.length, 20, 'tools back after re-enable')
await c1.tool('github_ping').execute({})
assert.equal(calls.at(-1).headers.Authorization, 'Bearer test-token')
console.log('live enabled switch: off -> 0 tools, on -> 20 tools')

// ---- token rotation through the namespace takes effect on the next call ----
settings.update({ token: 'rotated-token' })
await c1.tool('github_ping').execute({})
assert.equal(calls.at(-1).headers.Authorization, 'Bearer rotated-token')
settings.update({ dryRun: true })
const before = calls.length
const d = await c1.tool('github_create_issue').execute({ owner: 'acme', repo: 'widgets', title: 'T' })
assert.equal(d.dryRun, true)
assert.equal(calls.length, before, 'dry-run flip made no HTTP calls')
settings.update({ dryRun: false })
console.log('token rotation + live dry-run flip: ok')

// ---- boot WITHOUT any settings service (plain composition fallback) ----
const c2 = collector()
plugin.apply(makeCtx(c2.register), entryConfig)
assert.equal(c2.registered.length, 20, 'works without a settings service too')
console.log('no-settings fallback: ok')

// ---- dry-run booted composition (no settings): mutating guard ----
const c3 = collector()
plugin.apply(makeCtx(c3.register), { ...entryConfig, dryRun: true })
const before3 = calls.length
const d3 = await c3.tool('github_create_issue').execute({ owner: 'acme', repo: 'widgets', title: 'T' })
assert.equal(d3.dryRun, true)
const d3b = await c3.tool('github_write_file').execute({ owner: 'acme', repo: 'widgets', path: 'a.txt', content: 'x', message: 'm' })
assert.equal(d3b.dryRun, true)
assert.equal(calls.length, before3, 'dry-run made no HTTP calls')
console.log('dry-run guard: zero network calls')

// ---- token fallback to env (settings off, empty token) ----
process.env.GH_TOKEN = 'env-secret'
const c4 = collector()
plugin.apply(makeCtx(c4.register), { ...entryConfig, token: '' })
await c4.tool('github_ping').execute({})
assert.equal(calls.at(-1).headers.Authorization, 'Bearer env-secret')
delete process.env.GH_TOKEN
console.log('env token fallback: ok')

// ---- enabled:false at boot registers nothing ----
const c5 = collector()
plugin.apply(makeCtx(c5.register), { ...entryConfig, enabled: false })
assert.equal(c5.registered.length, 0, 'disabled at boot stays off')
console.log('enabled=false at boot: 0 tools')

console.log('ALL SMOKE TESTS PASSED')
