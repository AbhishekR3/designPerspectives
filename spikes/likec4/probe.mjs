// Small syntax probes via LikeC4.fromSource. Prints errors + selected computed values.
import { LikeC4 } from 'likec4'
const SPEC = 'specification { element el\n relationship calls\n tag t1 }\n'
async function probe(name, src, pick) {
  let l
  try {
    l = await LikeC4.fromSource(SPEC + src, { logger: false, printErrors: false })
    const errs = l.getErrors().map(e => e.message.split('\n')[0].slice(0, 110))
    const m = l.syncComputedModel().$data
    console.log(JSON.stringify({ name, errs, got: pick ? pick(m) : Object.keys(m.elements) }))
  } catch (e) { console.log(JSON.stringify({ name, threw: String(e.message).slice(0, 160) })) }
  finally { await l?.dispose() }
}
const el = (m) => m.elements.a
await probe('dq escape \\" and \\\\', 'model { a = el "say \\"hi\\" c:\\\\dir" }', m => el(m)?.title)
await probe('sq with dq inside', `model { a = el 'say "hi"' }`, m => el(m)?.title)
await probe('sq escape \\\'', `model { a = el 'it\\'s' }`, m => el(m)?.title)
await probe('dq literal \\n escape', 'model { a = el "x" { description "l1\\nl2" } }', m => el(m)?.description)
await probe('dq real newline', 'model { a = el "x" { description "l1\nl2" } }', m => el(m)?.description)
await probe('dq real newline indented', 'model { a = el "x" {\n    description "l1\n      l2\n    l3"\n } }', m => el(m)?.description)
await probe('triple dq = markdown', 'model { a = el "x" { description """**b** `c` \\\\ back""" } }', m => el(m)?.description)
await probe('title multi-line', 'model { a = el "t1\nt2" }', m => el(m)?.title)
await probe('unicode + emoji string', 'model { a = el "Zahlung — ünïcode ✓" }', m => el(m)?.title)
await probe('summary', 'model { a = el "x" { summary "short" description "long" } }', m => [el(m)?.summary, el(m)?.description])
for (const id of ['payment-', '1abc', '_x', 'a-b_c9', 'ünï', 'a.b', 'model', 'view', 'element', 'extend', 'it', 'this', 'global', 'A'])
  await probe(`id ${id}`, `model { ${id} = el "x" }`)
await probe('same id different parents', 'model { p = el { x = el } q = el { x = el } }')
await probe('duplicate sibling id', 'model { p = el { x = el x = el } }')
await probe('parent->child rel', 'model { p = el { x = el } p -> p.x "r" }', m => Object.values(m.relations).length)
await probe('duplicate identical rels', 'model { a = el \n b = el \n a -[calls]-> b "r" \n a -[calls]-> b "r" }', m => Object.values(m.relations).map(r => r.id))
await probe('undeclared kind', 'model { a = nokind "x" }')
await probe('undeclared rel kind', 'model { a = el \n b = el \n a -[nope]-> b }', m => Object.values(m.relations).length)
await probe('undeclared tag', 'model { a = el { #nope } }', m => el(m)?.tags)
await probe('metadata forms', 'model { a = el { metadata { k1 "v"; k2 ["x","y"]; k-3 "z"; k4 true; k5 5 } } }', m => el(m)?.metadata)
await probe('links', 'model { a = el { link https://x.org/a?b=1#f "T"\n link ./rel/adr.md\n link vscode://x } }', m => el(m)?.links)
await probe('rel props', 'model { a = el \n b = el \n a -[calls]-> b "L" "TECH" { description "d" \n #t1 \n link https://x.org } }', m => Object.values(m.relations))
await probe('extend in second block', 'model { a = el "x" }\nmodel { extend a { #t1 \n metadata { k "v" } \n c = el "child" } }', m => [el(m), Object.keys(m.elements)])
await probe('extend w/ title (expected error)', 'model { a = el "x" }\nmodel { extend a { title "y" } }', m => el(m)?.title)
await probe('empty title -> defaults to id', 'model { a = el }', m => el(m)?.title)
await probe('FQN-form definition a.b = el', 'model { a = el \n a.b = el }')
await probe('view w/o model errors', 'views { view v { include nope } }', m => Object.keys(m.views))
