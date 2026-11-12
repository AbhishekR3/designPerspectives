import { fromSources } from '@likec4/language-services/node'
const spec = `specification {
  element person
  element softwareSystem
  element container
  element component
  deploymentNode environment
  deploymentNode node
  relationship calls
  tag dpContext
  tag ext
}
`
const model = `model {
  customer = person "Customer" { description "A customer." }
  ibs = softwareSystem "IBS" {
    spa = container "SPA" { technology "Angular" }
    api = container "API" { technology "Java"
      sec = component "Security" { technology "Spring Bean" }
    }
  }
  cb = softwareSystem "Core Banking" { #ext }
  customer -[calls]-> ibs.spa "Uses the app via"
  ibs.spa -[calls]-> ibs.api "Makes API calls to" { technology "JSON/HTTPS"
    metadata { dpKey "x" } }
  ibs.api -[calls]-> cb "Calls" { technology "XML/HTTPS" }
}
`
const deployment = `deployment {
  live = environment "Live" {
    dc = node "Data centre" { technology "DC"
      app = node "app-server" { api = instanceOf ibs.api }
    }
  }
}
`
const views = `views {
  view context of ibs { #dpContext
    title "System Context View: IBS"
    include ibs, -> ibs ->
  }
  view containers of ibs { title "Container View: IBS"
    include * }
  view landscape { title "System Landscape View" include * }
  dynamic view signin { title "Dynamic View: sign in"
    customer -> ibs.spa "Signs in using"
    ibs.spa -> ibs.api "Calls" }
  deployment view live { title "Deployment View: Live" include live.** }
}
`
const l = await fromSources({ 'spec.c4': spec, 'model.c4': model, 'deployment.c4': deployment, 'views.c4': views + '\nmodel {{ \n' }, { logger: false, printErrors: false })
console.log('ERRORS', JSON.stringify(l.getErrors(), null, 0).slice(0, 800))
await l.dispose()
const g = await fromSources({ 'spec.c4': spec, 'model.c4': model, 'deployment.c4': deployment, 'views.c4': views }, { logger: false, printErrors: false })
console.log('errors', g.getErrors().length, JSON.stringify(g.getErrors()).slice(0,500))
const lm = await g.layoutedModel()
for (const id of ['context','containers','landscape','signin','live']) {
  const v = lm.$data.views[id]
  console.log(id, v._type, v.viewOf, JSON.stringify(v.tags), 'nodes:', v.nodes.map(n=>`${n.id}(${n.kind},p=${n.parent},${n.children.length})`).join(' '), '| edges:', v.edges.map(e=>`${e.source}->${e.target}:${e.label}`).join('; '))
}
const pm = await g.parsedModel?.()
console.log('parsed keys', pm ? Object.keys(pm.$data ?? pm) : 'none')
const pv = (pm.$data ?? pm).views
console.log(JSON.stringify(pv.context.rules), JSON.stringify(pv.live.rules), JSON.stringify(pv.signin.steps))
const cm = (await g.computedModel()).$data
console.log(JSON.stringify(Object.values(cm.relations)[1]))
console.log(JSON.stringify(cm.deployments.elements))
console.log(JSON.stringify(cm.elements['ibs.api']))
await g.dispose()
