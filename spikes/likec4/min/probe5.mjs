import { fromSources } from '@likec4/language-services/node'
const src = {
 'a.c4': 'specification { element s\n tag dpDynamic }\nmodel { x = s "X"\n y = s "Y"\n x -> y "calls" }\nviews {\n dynamic view d of x { #dpDynamic\n x -> y "go" }\n}\n',
 'b.c4': 'model {\n  z = s "Z"\n  broken {{\n}\n',
}
const l = await fromSources(src, { logger: false, printErrors: false })
console.log(JSON.stringify(l.getErrors()))
const p = await l.parsedModel(); console.log(JSON.stringify(p.$data.views.d))
await l.dispose()
