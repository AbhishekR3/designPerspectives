import { LikeC4 } from 'likec4'
import { writeFileSync } from 'node:fs'
import { stable } from './load.mjs'
const l = await LikeC4.fromWorkspace(process.argv[2] ?? 'model', { logger: false })
const p = await l.parsedModel()
writeFileSync(process.argv[3] ?? 'out/parsed.json', stable(p.$data))
await l.dispose()
