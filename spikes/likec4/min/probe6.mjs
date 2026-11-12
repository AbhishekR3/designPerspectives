import { fromSources } from '@likec4/language-services/node'
const l = await fromSources({ 'm.c4': 'specification { element s\n element grouping\n tag t\n tag dp-type-context\n tag dp-scope-a__b }\nmodel { a = s "A" { #t\n description "d"\n technology "x"\n metadata { dpGroupType "layer" }\n b = s "B"\n g = grouping "G" } \n c = s "C"\n a.b -> c "r" }\nviews { view v of a { #dp-type-context #dp-scope-a__b\n title "T"\n include a, * -> a, a -> * }\n view w of a { include a.* , a.b } }\n' }, { logger: false, printErrors: false })
console.log(JSON.stringify(l.getErrors()).slice(0,300))
const p = (await l.parsedModel()).$data
console.log(JSON.stringify(p.elements.a), JSON.stringify(p.relations), JSON.stringify(p.views.v), JSON.stringify(p.views.w.rules))
const lv = (await l.layoutedModel()).$data.views.v
console.log(JSON.stringify(lv.bounds), JSON.stringify(lv.edges[0]))
await l.dispose()
