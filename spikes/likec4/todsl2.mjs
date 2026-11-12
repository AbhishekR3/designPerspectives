import { LikeC4 } from 'likec4'
import { readFileSync, writeFileSync } from 'node:fs'
const a = readFileSync('out/upstream/toDSL.c4', 'utf8')
const again = await LikeC4.fromSource(a, { logger: false, printErrors: false })
console.log(again.getErrors().map(e => `${e.line}: ${e.message}`))
const b = await again.toDSL(); writeFileSync('out/upstream/toDSL-gen2.c4', b)
await again.dispose()
