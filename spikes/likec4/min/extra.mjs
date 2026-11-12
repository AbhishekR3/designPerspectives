// (1) cross-file extend with in-memory sources, (2) DOT output, (3) scale timing on a synthetic model
import { fromSources, fromSource } from '@likec4/language-services/node'
const a = await fromSources({
  'spec.c4': 'specification { element el\n tag t1 }',
  'a.c4': 'model { sys = el "Sys" { metadata { owner "a" } } }',
  'b.c4': 'model { extend sys { #t1\n metadata { owner "b"; zone "x" }\n link https://example.com\n child = el "Child" } }\nviews { view v { include *, sys.* } }',
}, { logger: false, printErrors: false })
const m = (await a.computedModel()).$data
console.log('cross-file extend errors', a.getErrors().length, JSON.stringify(m.elements.sys), Object.keys(m.elements))
const dots = await a.viewsService.viewsAsGraphvizOut()
console.log('viewsAsGraphvizOut ->', Array.isArray(dots) ? Object.keys(dots[0]) : typeof dots, JSON.stringify(dots?.[0]?.dot ?? dots).slice(0, 160))
await a.dispose()

const N = 600; let src = 'specification { element sys\n element ctr\n element cmp\n relationship calls }\nmodel {\n'
for (let s = 0; s < 10; s++) { src += ` s${s} = sys "S${s}" {\n`; for (let c = 0; c < 6; c++) { src += `  c${c} = ctr "C${c}" {\n`; for (let k = 0; k < 9; k++) src += `   k${k} = cmp "K${k}" { technology "T" description "d" }\n`; src += '  }\n' } src += ' }\n' }
let rels = 0; for (let s = 0; s < 10; s++) for (let c = 0; c < 6; c++) for (let k = 0; k < 9; k++) { src += ` s${s}.c${c}.k${k} -[calls]-> s${(s + 1) % 10}.c${(c + 1) % 6}.k${(k + 3) % 9} "r"\n`; rels++ }
src += '}\nviews {\n view landscape { include * }\n'; for (let s = 0; s < 10; s++) { src += ` view v${s} of s${s} { include * }\n`; for (let c = 0; c < 6; c++) src += ` view v${s}_${c} of s${s}.c${c} { include * }\n` } src += '}\n'
const t0 = performance.now(); const b = await fromSource(src, { logger: false, printErrors: false }); const t1 = performance.now()
const cm = (await b.computedModel()).$data; const t2 = performance.now(); const lm = await b.layoutedModel(); const t3 = performance.now()
console.log(JSON.stringify({ synthetic: { elements: Object.keys(cm.elements).length, relations: Object.keys(cm.relations).length, views: Object.keys(cm.views).length, srcKB: Math.round(src.length / 1024) }, errors: b.getErrors().length, parseMs: Math.round(t1 - t0), computeMs: Math.round(t2 - t1), layoutAllViewsMs: Math.round(t3 - t2) }))
await b.dispose()
