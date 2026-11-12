// Same load as ../load.mjs but through the smaller @likec4/language-services package.
import * as ls from '@likec4/language-services/node'
import * as gen from '@likec4/generators'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
console.log('language-services/node exports:', Object.keys(ls).join(', '))
console.log('generators exports:', Object.keys(gen).join(', '))
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v
const t0 = performance.now()
const l = await ls.fromWorkspace(new URL('../model', import.meta.url).pathname, { logger: false })
const c = await l.computedModel(); const lay = await l.layoutedModel()
console.log('ms', Math.round(performance.now() - t0), 'errors', l.getErrors().length, 'elements', Object.keys(c.$data.elements).length)
const mine = JSON.stringify(sortKeys(lay.$data.views), null, 2) + '\n'
console.log('layout identical to likec4-package run:', mine === readFileSync('../out/views-all.json', 'utf8'))
for (const name of ['generateMermaid', 'generatePuml', 'generateD2', 'generateDrawio', 'generateViewsDataJs']) {
  if (typeof gen[name] !== 'function') { console.log(name, 'absent'); continue }
  try { const v = lay.view('containers'); const out = gen[name](name === 'generateViewsDataJs' ? [...lay.views()].map(v => v.$view) : v)
    console.log(name, 'OK', String(out).length, 'chars:', JSON.stringify(String(out).slice(0, 90))) } catch (e) { console.log(name, 'threw', String(e.message).slice(0, 150)) }
}
// DOT text for one view
try { const vs = l.viewsService; console.log('viewsService methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(vs)).join(', ')) } catch (e) { console.log('viewsService', e.message) }
await l.dispose()
