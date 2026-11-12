// print -> out/printed/*.c4 -> reload with LikeC4 -> compare with the original. Usage: node roundtrip.mjs
import { LikeC4 } from 'likec4'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { print, fromLikeC4Json } from './printer.mjs'
import { stable, sortKeys } from './load.mjs'

const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const input = fromLikeC4Json(J('out/model.json'), J('out/parsed.json'))

// Adversarial additions that are not in the hand-written fixture (strings the printer must escape).
const NASTY = {
  quotes: 'say "hi" and \'bye\'', backslash: 'C:\\dir\\n (literal backslash-n)', newline: 'line1\nline2\n\n  indented line4',
  triple: 'has """ and \'\'\' inside', unicode: 'Zahlung — ünïcode ✓ 日本語', edges: '  leading and trailing  ', braces: '} // not a comment { #tag -> x', tab: 'a\tb',
}
if (process.argv.includes('--nasty')) {
  input.elements.push({ id: 'zz', kind: 'group', title: 'Escaping cases' })
  for (const [k, v] of Object.entries(NASTY)) {
    input.elements.push({ id: `zz.${k}`, kind: 'component', title: v.replace(/\n/g, ' '), technology: v.replace(/\n/g, ' '), description: { txt: v }, metadata: { m: v, arr: [v, 'x'] } })
    input.elements.push({ id: `zz.${k}-md`, kind: 'component', title: 'md ' + k, description: { md: v } })
    input.relationships.push({ source: `zz.${k}`, target: `zz.${k}-md`, kind: 'calls', title: v.replace(/\n/g, ' '), description: { txt: v } })
  }
  input.elements.push({ id: 'zz.multiline-title', kind: 'component', title: 'two\nlines' })
}

const files1 = print(input), files2 = print(structuredClone(input))
const shuffled = { ...input, elements: [...input.elements].reverse(), relationships: [...input.relationships].reverse(), views: [...input.views].reverse(), deployments: [...input.deployments].reverse() }
const files3 = print(shuffled)
const sha = (m) => createHash('sha256').update([...m].map(([k, v]) => k + '\0' + v).join('\0')).digest('hex').slice(0, 16)
const dir = process.argv.includes('--nasty') ? 'out/printed-nasty' : 'out/printed'
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
for (const [name, text] of files1) writeFileSync(`${dir}/${name}`, text)
const allText = [...files1.values()].join('')
console.log('print twice byte-identical:', sha(files1) === sha(files2), '| input order independent:', sha(files1) === sha(files3), '| sha', sha(files1),
  '| CR bytes:', /\r/.test(allText), '| trailing LF:', [...files1.values()].every(t => t.endsWith('\n')), '| trailing spaces:', /[ \t]+\n/.test(allText))

const l = await LikeC4.fromWorkspace(dir, { logger: false, printErrors: false })
const errors = l.getErrors().map(e => `${e.sourceFsPath.split('/').pop()}:${e.line} ${e.message.split('\n')[0]}`)
console.log('reload errors:', errors.length, errors.slice(0, 8))
const computed2 = (await l.computedModel()).$data
const parsed2 = (await l.parsedModel()).$data
const layouted2 = (await l.layoutedModel()).$data
await l.dispose()
writeFileSync(`${dir}.model.json`, stable(computed2))
const back = fromLikeC4Json(sortKeys(computed2), sortKeys(parsed2))

// second generation: print(reload(print(x))) must equal print(x)
console.log('fixpoint print(reload(print(x))) === print(x):', sha(print(back)) === sha(files1))

const norm = (o) => JSON.stringify(sortKeys(Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length) && v !== ''))))
function diffSets(label, a, b, key) {
  const A = new Map(a.map(x => [key(x), norm(x)])), B = new Map(b.map(x => [key(x), norm(x)]))
  const missing = [...A.keys()].filter(k => !B.has(k)), extra = [...B.keys()].filter(k => !A.has(k)), changed = [...A.keys()].filter(k => B.has(k) && A.get(k) !== B.get(k))
  console.log(`${label}: original ${A.size}, reloaded ${B.size}, missing ${missing.length}, extra ${extra.length}, changed ${changed.length}${a.length !== A.size ? ` (WARNING: ${a.length - A.size} key collisions)` : ''}`)
  for (const k of [...missing.map(k => 'missing ' + k), ...extra.map(k => 'extra ' + k)].slice(0, 6)) console.log('   ', k)
  for (const k of changed.slice(0, 12)) { const x = JSON.parse(A.get(k)), y = JSON.parse(B.get(k))
    for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) console.log(`    changed ${k} .${f}: ${JSON.stringify(x[f])} -> ${JSON.stringify(y[f])}`) }
  return missing.length + extra.length + changed.length
}
let bad = errors.length
bad += diffSets('elements', input.elements, back.elements, e => e.id)
bad += diffSets('relationships', input.relationships, back.relationships, r => [r.source, r.target, r.kind ?? '', r.title ?? ''].join(' | '))
bad += diffSets('deployment elements', input.deployments, back.deployments, e => e.id)
const viewKey = ({ docUri, sourcePath, steps, ...v }) => ({ ...v, steps: steps?.map(({ astPath, ...s }) => s) })
bad += diffSets('views (parsed rules/steps)', input.views.map(viewKey), back.views.map(viewKey), v => v.id)
// element styles as computed (shape inherited from kind) and spec
const c1 = J('out/model.json')
const styles = (m) => Object.values(m.elements).filter(e => e.id in c1.elements).map(e => ({ id: e.id, style: e.style }))
bad += diffSets('computed element styles', styles(c1), styles(computed2), e => e.id)
bad += diffSets('specification', [{ id: 'spec', ...c1.specification, metadataKeys: undefined }], [{ id: 'spec', ...computed2.specification, metadataKeys: undefined }], x => x.id)
// computed view content (node ids, edge endpoints+labels)
const shape = (m) => Object.values(m.views).map(v => ({ id: v.id, type: v._type, nodes: v.nodes.map(n => n.id).filter(id => !id.startsWith('zz')).sort(), edges: v.edges.map(e => `${e.source}>${e.target}:${e.label ?? ''}`).filter(s => !s.includes('zz')).sort() }))
bad += diffSets('computed views (nodes/edges)', shape(c1), shape(computed2), v => v.id)
if (!process.argv.includes('--nasty')) {
  const lay = (views) => Object.values(views).map(v => ({ id: v.id, bounds: v.bounds, nodes: v.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]), edges: v.edges.map(e => [e.source, e.target, e.points]) }))
  diffSets('layout geometry after round-trip (informational)', lay(J('out/views-all.json')), lay(layouted2.views), v => v.id)
}
console.log(bad === 0 ? 'ROUND-TRIP: OK' : `ROUND-TRIP: ${bad} difference(s)`)
