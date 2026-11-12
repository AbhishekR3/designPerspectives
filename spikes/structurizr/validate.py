"""Spike check: every property in the sample exists in structurizr.yaml (OpenAPI), enums match, and id references resolve.
Usage: python3 -I validate.py structurizr.yaml sample.workspace.json"""
import sys, json, yaml
S = yaml.safe_load(open(sys.argv[1]))['components']['schemas']; W = json.load(open(sys.argv[2])); errs = []
def chk(v, sch, path):
    if '$ref' in sch: sch = S[sch['$ref'].split('/')[-1]]
    t = sch.get('type')
    if t == 'array':
        if not isinstance(v, list): errs.append(path + ': not array'); return
        for i, x in enumerate(v): chk(x, sch.get('items', {}), f'{path}[{i}]')
    elif t == 'object' and 'properties' in sch:
        for k, x in v.items():
            if k not in sch['properties']: errs.append(f'{path}.{k}: not in schema')
            else: chk(x, sch['properties'][k], f'{path}.{k}')
    elif 'enum' in sch and v not in sch['enum']: errs.append(f'{path}: {v!r} not in enum')
    elif t == 'string' and not isinstance(v, str): errs.append(f'{path}: not string')
    elif t == 'number' and not isinstance(v, (int, float)): errs.append(f'{path}: not number')
chk(W, S['Workspace'], 'workspace')
ids, rels = set(), {}
def walk(e):
    assert e['id'] not in ids, e['id']; ids.add(e['id'])
    for r in e.get('relationships', []):
        assert r['id'] not in ids; ids.add(r['id']); rels[r['id']] = r
        if r['sourceId'] != e['id']: errs.append(f"rel {r['id']} not stored on its source element")
    for k in ('containers', 'components', 'children', 'infrastructureNodes', 'containerInstances', 'softwareSystemInstances'):
        for c in e.get(k, []): walk(c)
m = W['model']
for k in ('people', 'softwareSystems', 'deploymentNodes'):
    for e in m.get(k, []): walk(e)
els = ids - set(rels)
for r in rels.values():
    for f in ('sourceId', 'destinationId'):
        if r[f] not in els: errs.append(f"rel {r['id']}.{f} dangling")
for vk, vs in W['views'].items():
    if vk == 'configuration': continue
    for v in vs:
        shown = {e['id'] for e in v.get('elements', [])}
        for e in shown - els: errs.append(f"{v['key']}: element {e} missing")
        for r in v.get('relationships', []):
            if r['id'] not in rels: errs.append(f"{v['key']}: relationship {r['id']} missing")
            elif not {rels[r['id']]['sourceId'], rels[r['id']]['destinationId']} <= shown: errs.append(f"{v['key']}: relationship {r['id']} endpoints not in view")
        for f in ('softwareSystemId', 'containerId'):
            if f in v and v[f] not in els: errs.append(f"{v['key']}.{f} dangling")
print(f'elements={len(els)} relationships={len(rels)} errors={len(errs)}'); print('\n'.join(errs))
sys.exit(1 if errs else 0)
