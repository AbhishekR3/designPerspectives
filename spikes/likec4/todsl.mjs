// Exercises the upstream DSL emitters: LikeC4#toDSL, LikeC4#format, generators/likec4
import { LikeC4 } from 'likec4'
import { writeFileSync, mkdirSync } from 'node:fs'
const l = await LikeC4.fromWorkspace('model', { logger: false })
mkdirSync('out/upstream', { recursive: true })
const a = await l.toDSL(), b = await l.toDSL()
writeFileSync('out/upstream/toDSL.c4', a)
console.log('toDSL bytes', a.length, 'twice identical', a === b)
const f = await l.format()
for (const [uri, text] of f) console.log('format ->', uri.replace(/.*\//, ''), text.length, 'bytes')
await l.dispose()
const again = await LikeC4.fromSource(a, { logger: false, printErrors: true })
console.log('toDSL output re-parses, errors:', again.getErrors().length)
const m2 = again.syncComputedModel().$data
console.log('re-parsed elements', Object.keys(m2.elements).length, 'relations', Object.keys(m2.relations).length, 'views', Object.keys(m2.views).length)
console.log('toDSL second generation identical:', (await again.toDSL()) === a)
await again.dispose()
