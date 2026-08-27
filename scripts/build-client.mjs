/**
 * Build the browser half into the client module system's lazy-CJS factory
 * shape: window.__ModuleLoader__.load({ id, factory }). The shared tsdown
 * preset the DSH packages use is not published, so this script replicates
 * the output form with nothing but the TypeScript compiler API: each
 * src/client module is transpiled to CommonJS, every module becomes a
 * function(require, module, exports) in an inline table, and the wrapper
 * routes relative specifiers through the table while bare specifiers
 * (react/jsx-runtime, @deepseek-ai/dsh-client-runtime/client) fall through
 * to the loader's outer require - the factory's static requests resolve
 * against the boot-graph table exactly as the module system's README
 * requires (packages/client/modules).
 */

import ts from 'typescript'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src', 'client')
const outDir = join(root, 'lib')

/** Module ids in dependency order; index.ts is the entry. */
const modules = ['locales.ts', 'card-model.ts', 'GitHubCard.ts', 'index.ts']

const tab = '\t'
const q = "'"

/** Transpile one module to a CommonJS factory body. */
function factoryBody(file) {
  const source = readFileSync(join(srcDir, file), 'utf8')
  const transpiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const indent = tab + tab + tab
  const body = transpiled.outputText
    .trimEnd()
    .split('\n')
    .map(line => line.length > 0 ? indent + line : line)
    .join('\n')
  return indent.slice(tab.length) + q + file + q + ': function (require, module, exports) {\n' + body + '\n' + indent.slice(tab.length) + '}'
}

const lines = []
lines.push('window.__ModuleLoader__.load({')
lines.push(tab + 'id: ' + q + 'dsh-github-manager' + q + ',')
lines.push(tab + 'factory: (require) => {')
lines.push(tab + tab + 'var module = { exports: {} };')
lines.push(tab + tab + 'var exports = module.exports;')
lines.push(tab + tab + 'Object.defineProperty(exports, Symbol.toStringTag, { value: ' + q + 'Module' + q + ' });')
lines.push(tab + tab + 'const __modules = {')
lines.push(modules.map(factoryBody).join(',\n'))
lines.push(tab + tab + '};')
lines.push(tab + tab + 'const __cache = {};')
lines.push(tab + tab + 'const __require = (spec) => {')
lines.push(tab + tab + tab + 'if (typeof spec === ' + q + 'string' + q + ' && spec.slice(0, 2) === ' + q + './' + q + ') {')
lines.push(tab + tab + tab + tab + 'const id = spec.slice(2);')
lines.push(tab + tab + tab + tab + 'const define = __modules[id];')
lines.push(tab + tab + tab + tab + 'if (define === undefined) throw new Error(' + q + 'dsh-github-manager client: unknown module ' + q + ' + id);')
lines.push(tab + tab + tab + tab + 'if (!(id in __cache)) {')
lines.push(tab + tab + tab + tab + tab + 'const inner = { exports: {} };')
lines.push(tab + tab + tab + tab + tab + '__cache[id] = inner.exports;')
lines.push(tab + tab + tab + tab + tab + 'define(__require, inner, inner.exports);')
lines.push(tab + tab + tab + tab + tab + '__cache[id] = inner.exports;')
lines.push(tab + tab + tab + tab + '}')
lines.push(tab + tab + tab + tab + 'return __cache[id];')
lines.push(tab + tab + tab + '}')
lines.push(tab + tab + tab + 'return require(spec);')
lines.push(tab + tab + '};')
lines.push(tab + tab + 'const entry = __require(' + q + './index.ts' + q + ');')
lines.push(tab + tab + 'Object.assign(exports, entry);')
lines.push(tab + tab + 'return module.exports;')
lines.push(tab + '},')
lines.push('});')
lines.push('')

mkdirSync(outDir, { recursive: true })
const bundle = lines.join('\n')
writeFileSync(join(outDir, 'client.js'), bundle, 'utf8')
process.stdout.write('lib/client.js written (' + Buffer.byteLength(bundle) + ' bytes)\n')
