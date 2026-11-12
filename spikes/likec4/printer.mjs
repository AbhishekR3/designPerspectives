// Prototype canonical printer: plain model object -> LikeC4 DSL text (deterministic).
// Input: { specification, elements[], relationships[], deployments[], views[] }
// Output: Map<fileName, text>. LF only, 2-space indent, trailing newline, sorted.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const by = (...fs) => (a, b) => { for (const f of fs) { const c = cmp(f(a), f(b)); if (c) return c } return 0 }

// Double-quoted string; backslash, quote and control characters are escaped so every string stays on one line.
export const str = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r') + '"'
// Markdown text ({md}) must use triple quotes to keep its md flag.
const md = (s) => '"""' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"""'
const text = (v) => (v == null ? null : typeof v === 'string' ? str(v) : 'md' in v ? md(v.md) : str(v.txt))

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_-]*$/
const ident = (s) => { if (!IDENT.test(s)) throw new Error(`printer: invalid identifier ${JSON.stringify(s)}`); return s }
const fqn = (s) => s.split('.').map(ident).join('.')

class Out {
  lines = []; depth = 0
  line(s = '') { this.lines.push(s === '' ? '' : '  '.repeat(this.depth) + s) }
  block(head, fn) { const at = this.lines.length; this.line(head + ' {'); this.depth++; fn(); this.depth--
    if (this.lines.length === at + 1) this.lines[at] = this.lines[at].slice(0, -2); else this.line('}') }
  toString() { return this.lines.join('\n') + '\n' }
}

function props(o, e, { withTitle = false } = {}) {
  for (const t of [...(e.tags ?? [])].sort()) o.line('#' + ident(t))
  if (withTitle && e.title) o.line('title ' + str(e.title))
  if (e.technology) o.line('technology ' + str(e.technology))
  if (e.summary) o.line('summary ' + text(e.summary))
  if (e.description) o.line('description ' + text(e.description))
  const mk = Object.keys(e.metadata ?? {}).sort()
  if (mk.length) o.block('metadata', () => { for (const k of mk) { const v = e.metadata[k]; o.line(`${ident(k)} ${Array.isArray(v) ? '[' + v.map(str).join(', ') + ']' : str(v)}`) } })
  for (const l of e.links ?? []) o.line(`link ${l.url}${l.title ? ' ' + str(l.title) : ''}`)
}
const styleBlock = (o, style) => { const ks = Object.keys(style ?? {}).sort(); if (ks.length) o.block('style', () => ks.forEach(k => o.line(`${k} ${style[k]}`))) }

function printSpec(spec) {
  const o = new Out()
  o.block('specification', () => {
    for (const [kw, rec] of [['element', spec.elements], ['deploymentNode', spec.deployments], ['relationship', spec.relationships]])
      for (const k of Object.keys(rec ?? {}).sort()) o.block(`${kw} ${ident(k)}`, () => styleBlock(o, rec[k].style))
    for (const t of Object.keys(spec.tags ?? {}).sort()) o.line(`tag ${ident(t)}`) // tag colours are auto-assigned; not printed
  })
  return o.toString()
}

function tree(items) { // items have dotted .id ; returns roots with .children sorted by id
  const nodes = new Map(items.map(e => [e.id, { e, children: [] }])); const roots = []
  for (const n of [...nodes.values()].sort(by(n => n.e.id))) {
    const i = n.e.id.lastIndexOf('.'); const p = i < 0 ? null : nodes.get(n.e.id.slice(0, i))
    if (i >= 0 && !p) throw new Error(`printer: missing parent of ${n.e.id}`)
    ;(p ? p.children : roots).push(n)
  }
  return roots
}

function printModel(elements, relationships) {
  const o = new Out()
  o.block('model', () => {
    const emit = (n) => { const e = n.e; const name = ident(e.id.split('.').pop())
      o.block(`${name} = ${ident(e.kind)}${e.title && e.title !== name ? ' ' + str(e.title) : ''}`, () => { props(o, e); n.children.forEach(emit) }) }
    tree(elements).forEach(emit)
    // all relationships at top level, fully qualified, sorted
    for (const r of [...relationships].sort(by(r => r.source, r => r.target, r => r.kind ?? '', r => r.title ?? '', r => JSON.stringify(r))))
      o.block(`${fqn(r.source)} ${r.kind ? `-[${ident(r.kind)}]->` : '->'} ${fqn(r.target)}${r.title ? ' ' + str(r.title) : ''}`, () => props(o, r))
  })
  return o.toString()
}

function printDeployment(items) {
  const o = new Out()
  o.block('deployment', () => {
    const emit = (n) => { const e = n.e; const name = ident(e.id.split('.').pop())
      if (e.element) o.block(`${name} = instanceOf ${fqn(e.element)}`, () => props(o, e, { withTitle: true }))
      else o.block(`${name} = ${ident(e.kind)}${e.title && e.title !== name ? ' ' + str(e.title) : ''}`, () => { props(o, e); n.children.forEach(emit) }) }
    tree(items).forEach(emit)
  })
  return o.toString()
}

const SEL = { children: '.*', descendants: '.**', expanded: '._' }
function expr(x) {
  if (x.wildcard) return '*'
  if (x.ref && Object.keys(x).every(k => k === 'ref' || k === 'selector')) {
    const base = fqn(x.ref.model ?? x.ref.deployment)
    if (x.selector && !SEL[x.selector]) throw new Error(`printer: unsupported selector ${x.selector}`)
    return base + (x.selector ? SEL[x.selector] : '')
  }
  throw new Error('printer: unsupported view expression ' + JSON.stringify(x))
}
function printViews(views) {
  const o = new Out()
  o.block('views', () => {
    for (const v of [...views].sort(by(v => v.id))) {
      const head = v._type === 'dynamic' ? `dynamic view ${ident(v.id)}` : v._type === 'deployment' ? `deployment view ${ident(v.id)}` : `view ${ident(v.id)}${v.viewOf ? ' of ' + fqn(v.viewOf) : ''}`
      o.block(head, () => {
        for (const t of [...(v.tags ?? [])].sort()) o.line('#' + ident(t))
        if (v.title) o.line('title ' + str(v.title))
        if (v.description) o.line('description ' + text(v.description))
        for (const l of v.links ?? []) o.line(`link ${l.url}${l.title ? ' ' + str(l.title) : ''}`)
        for (const s of v.steps ?? []) { // order is semantic: not sorted
          if (!('source' in s) || Object.keys(s).some(k => !['source', 'target', 'title', 'isBackward', 'astPath'].includes(k))) throw new Error('printer: unsupported dynamic step ' + JSON.stringify(s))
          o.line(s.isBackward ? `${fqn(s.target)} <- ${fqn(s.source)}${s.title ? ' ' + str(s.title) : ''}` : `${fqn(s.source)} -> ${fqn(s.target)}${s.title ? ' ' + str(s.title) : ''}`)
        }
        for (const r of v.rules ?? []) { // order is semantic: not sorted
          if (r.include) o.line('include ' + r.include.map(expr).join(', '))
          else if (r.exclude) o.line('exclude ' + r.exclude.map(expr).join(', '))
          else if (r.targets && r.style) o.block('style ' + r.targets.map(expr).join(', '), () => Object.keys(r.style).sort().forEach(k => o.line(`${k} ${r.style[k]}`)))
          else throw new Error('printer: unsupported view rule ' + JSON.stringify(r))
        }
      })
    }
  })
  return o.toString()
}

export function print(model) {
  return new Map([
    ['spec.c4', printSpec(model.specification)],
    ['model.c4', printModel(model.elements, model.relationships)],
    ['deployment.c4', printDeployment(model.deployments ?? [])],
    ['views.c4', printViews(model.views)],
  ])
}

// Builds the plain printer input from LikeC4 JSON dumps (computed model for elements/relations, parsed model for view rules).
export function fromLikeC4Json(computed, parsed) {
  const strip = ({ style, ...e }) => e
  return {
    specification: computed.specification,
    elements: Object.values(computed.elements).map(strip),
    relationships: Object.values(computed.relations).map(({ id, source, target, ...r }) => ({ ...r, source: source.model, target: target.model })),
    deployments: Object.values(computed.deployments.elements).map(strip),
    views: Object.values(parsed.views).filter(v => v.sourcePath), // drops the auto-generated `index` view
  }
}
