/**
 * Find template identifiers that resolve to nothing.
 *
 * Vue compiles an unknown name to `_ctx.name` and only fails when the render function runs, so
 * a v-for variable used outside its loop builds cleanly and crashes the page on click. This
 * compiles each SFC the way Vite does and reports every `_ctx.x` that the script never declared.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const ALLOWED = new Set(['$slots', '$attrs', '$props', '$emit', '$el', '$refs', '$options'])
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : []
})

let bad = 0
for (const file of walk('src')) {
  const source = readFileSync(file, 'utf8')
  const { descriptor } = parse(source, { filename: file })
  if (!descriptor.template) continue
  let bindings
  try {
    bindings = compileScript(descriptor, { id: 'x' }).bindings
  } catch { bindings = undefined }
  const { code, errors } = compileTemplate({
    source: descriptor.template.content,
    filename: file,
    id: 'x',
    compilerOptions: { bindingMetadata: bindings, prefixIdentifiers: true },
  })
  for (const e of errors) { bad++; console.log(`  ${file}: compile error: ${e.message ?? e}`) }
  const unknown = [...new Set([...code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
    .filter((n) => !ALLOWED.has(n))
  if (unknown.length) {
    bad++
    console.log(`  ${file}\n      resolves to nothing: ${unknown.join(', ')}`)
  }
}
console.log(bad ? `\n${bad} file(s) with unresolved template identifiers` : 'every template identifier resolves')
process.exit(bad ? 1 : 0)
