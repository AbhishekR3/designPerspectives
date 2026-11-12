// Usage: node load.mjs [modelDir] [outDir] [wasm|binary]
import { LikeC4 } from 'likec4'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
  : v
export const stable = (v) => JSON.stringify(sortKeys(v), null, 2) + '\n'

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? 'model')
  const out = resolve(process.argv[3] ?? 'out')
  const graphviz = process.argv[4] ?? 'wasm'
  const t0 = performance.now()
  const likec4 = await LikeC4.fromWorkspace(dir, { printErrors: true, throwIfInvalid: false, logger: false, graphviz })
  const t1 = performance.now()
  if (likec4.hasErrors()) { console.error(likec4.getErrors()); process.exitCode = 1 }
  const computed = await likec4.computedModel()
  const t2 = performance.now()
  mkdirSync(out, { recursive: true })
  writeFileSync(`${out}/model.json`, stable(computed.$data))
  const layouted = await likec4.layoutedModel()
  const t3 = performance.now()
  const view = layouted.$data.views['containers']
  writeFileSync(`${out}/view.json`, stable(view))
  writeFileSync(`${out}/views-all.json`, stable(layouted.$data.views))
  console.log(JSON.stringify({ graphviz, docs: likec4.documentCount(), loadMs: Math.round(t1 - t0), computeMs: Math.round(t2 - t1), layoutMs: Math.round(t3 - t2),
    elements: Object.keys(computed.$data.elements).length, relations: Object.keys(computed.$data.relations).length, views: Object.keys(computed.$data.views).length }))
  await likec4.dispose()
}
