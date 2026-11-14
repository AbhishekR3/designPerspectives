"""Flows: ordered steps over relationships, stored as Structurizr dynamic views.

Each step is a RelationshipView with `order` ("1", "2", ...), a step `description`, and
`response` (true when the step is the reply travelling back along the relationship).

Structurizr restricts which elements a dynamic view may hold, depending on its scope
(structurizr-core DynamicView.checkElementCanBeAdded, checked 2026-11-14):
  - no scope:            people and software systems only
  - software system:     people, other software systems, containers (not the system itself)
  - container:           people, software systems, other containers, components
                         (not the container itself or its parent system)
  - never both an element and its own parent.
designPerspectives infers the scope from the steps and reports a warning when a flow cannot
meet these rules; the flow still works here but may not open in Structurizr.
"""

from __future__ import annotations

import json

from .diagrams import decorate, positions_of
from .ops import Index, ModelError, build_index, element_summary, relationship_summary, slugify, unique
from .sidecar import Sidecar
from .workspace import ElementView, RelationshipView, View, Workspace

FLOW_PROPERTY = "dp.flow"
STEP_DATA_PROPERTY = "dp.stepData"  # JSON {"<order>": {"example": str, "format": str}} on the flow's view


def _step_data(view: View) -> dict[str, dict]:
    try:
        data = json.loads((view.properties or {}).get(STEP_DATA_PROPERTY, "{}"))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _set_step_data(view: View, data: dict[str, dict]) -> None:
    props = dict(view.properties or {})
    data = {k: v for k, v in data.items() if v.get("example") or v.get("format")}
    if data:
        props[STEP_DATA_PROPERTY] = json.dumps(data, ensure_ascii=False)
    else:
        props.pop(STEP_DATA_PROPERTY, None)
    view.properties = props or None


def _flow_view(ws: Workspace, key: str) -> View:
    for v in ws.views.dynamic_views:
        if v.key == key:
            return v
    raise ModelError(f'No flow with key "{key}".')


def infer_scope(idx: Index, element_ids: list[str]) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    kinds = {e: idx.kind[e] for e in element_ids}
    components = [e for e, k in kinds.items() if k == "component"]
    containers = [e for e, k in kinds.items() if k == "container"]
    scope: str | None = None

    if components:
        parents = sorted({idx.parent[c] for c in components})  # type: ignore[misc]
        scope = parents[0]
        if len(parents) > 1:
            names = ", ".join(idx.elements[p].name for p in parents)  # type: ignore[index]
            warnings.append(f"Uses components from more than one container ({names}).")
        system = idx.parent[scope]  # type: ignore[index]
        for bad in (scope, system):
            if bad in kinds:
                warnings.append(f'Includes "{idx.elements[bad].name}", which contains other elements of this flow.')  # type: ignore[index]
    elif containers:
        systems = [idx.parent[c] for c in containers]
        scope = max(set(systems), key=systems.count)  # type: ignore[arg-type]
        if scope in kinds:
            warnings.append(f'Includes "{idx.elements[scope].name}", which contains other elements of this flow.')  # type: ignore[index]

    ids = set(element_ids)
    for e in element_ids:
        for a in idx.ancestors(e)[1:]:
            if a in ids and a != scope and a != (idx.parent.get(scope) if scope else None):
                warnings.append(f'Includes both "{idx.elements[e].name}" and its parent "{idx.elements[a].name}".')
    return scope, sorted(set(warnings))


def _endpoints(idx: Index, view: View) -> list[str]:
    out: list[str] = []
    for rv in view.relationships:
        r = idx.relationships.get(rv.id)
        if r is None:
            continue
        for e in (r.source_id, r.destination_id):
            if e not in out:
                out.append(e)
    return out


def _steps(view: View) -> list[RelationshipView]:
    def order_key(rv: RelationshipView):
        try:
            return (0, float(rv.order or 0), "")
        except ValueError:
            return (1, 0.0, rv.order or "")

    return sorted(view.relationships, key=order_key)


def list_flows(ws: Workspace) -> list[dict]:
    idx = build_index(ws)
    out = []
    for v in ws.views.dynamic_views:
        scope, warnings = infer_scope(idx, _endpoints(idx, v))
        data = _step_data(v)
        out.append(
            {
                "key": v.key,
                "title": v.title or v.description or v.key,
                "description": v.description or "",
                "scope": v.element_id,
                "warnings": warnings,
                "steps": [
                    {
                        "relationshipId": rv.id,
                        "description": rv.description or "",
                        "response": bool(rv.response),
                        "order": rv.order,
                        "example": data.get(rv.order or "", {}).get("example", ""),
                        "format": data.get(rv.order or "", {}).get("format", ""),
                    }
                    for rv in _steps(v)
                ],
            }
        )
    return out


def create_flow(ws: Workspace, title: str, description: str = "") -> str:
    title = (title or "").strip()
    if not title:
        raise ModelError("A flow needs a name.")
    taken = {v.key for v in ws.views.all()}
    key = unique(f"flow-{slugify(title)}", taken)
    ws.views.dynamic_views.append(
        View(key=key, title=title, description=description or None, properties={FLOW_PROPERTY: "true"})
    )
    return key


def update_flow(ws: Workspace, key: str, patch: dict) -> None:
    idx = build_index(ws)
    view = _flow_view(ws, key)
    if "title" in patch:
        title = (patch["title"] or "").strip()
        if not title:
            raise ModelError("A flow needs a name.")
        view.title = title
    if "description" in patch:
        view.description = patch["description"] or None
    if "steps" in patch:
        steps = []
        data: dict[str, dict] = {}
        for i, s in enumerate(patch["steps"] or [], start=1):
            rid = s.get("relationshipId")
            if rid not in idx.relationships:
                raise ModelError(f'Step {i}: no relationship with ID "{rid}".')
            data[str(i)] = {"example": (s.get("example") or "").strip("\n"), "format": (s.get("format") or "").strip()}
            steps.append(
                RelationshipView(
                    id=rid,
                    order=str(i),
                    description=(s.get("description") or "").strip() or None,
                    response=bool(s.get("response")),
                )
            )
        view.relationships = steps
        _set_step_data(view, data)
    sync_flow(idx, view)


def delete_flow(ws: Workspace, key: str) -> None:
    _flow_view(ws, key)
    ws.views.dynamic_views = [v for v in ws.views.dynamic_views if v.key != key]


def sync_flow(idx: Index, view: View) -> None:
    """Element list = endpoints of the steps (positions kept); scope re-inferred for our flows."""
    if (view.properties or {}).get(FLOW_PROPERTY) == "true":
        # Drop steps whose relationship is gone and renumber, keeping each step's example data.
        old = _step_data(view)
        kept: list[RelationshipView] = []
        data: dict[str, dict] = {}
        for rv in _steps(view):
            if rv.id not in idx.relationships:
                continue
            n = str(len(kept) + 1)
            if rv.order in old:
                data[n] = old[rv.order]
            rv.order = n
            kept.append(rv)
        view.relationships = kept
        _set_step_data(view, data)
    else:
        view.relationships = [rv for rv in view.relationships if rv.id in idx.relationships]
    ids = _endpoints(idx, view)
    old = {e.id: e for e in view.elements}
    view.elements = [old.get(i) or ElementView(id=i) for i in ids]
    if (view.properties or {}).get(FLOW_PROPERTY) == "true":
        scope, _ = infer_scope(idx, ids)
        view.element_id = scope


def sync_flows(ws: Workspace) -> None:
    idx = build_index(ws)
    for v in ws.views.dynamic_views:
        sync_flow(idx, v)


def flow_diagram(ws: Workspace, key: str, sidecar: Sidecar | None = None) -> dict | None:
    idx = build_index(ws)
    try:
        view = _flow_view(ws, key)
    except ModelError:
        return None
    pos = positions_of(view)
    steps = _steps(view)
    nodes = []
    for e in _endpoints(idx, view):
        s = element_summary(idx, e)
        s["inScope"] = True
        s["position"] = pos.get(e)
        s["drillKey"] = None
        nodes.append(s)
    edges: dict[str, dict] = {}
    for n, rv in enumerate(steps, start=1):
        r = idx.relationships[rv.id]
        summ = relationship_summary(r)
        edge = edges.setdefault(
            r.id,
            {
                "id": r.id,
                "source": r.source_id,
                "target": r.destination_id,
                "description": r.description or "",
                "technology": summ["technology"],
                "technologies": summ["technologies"],
                "kind": summ["kind"],
                "sensitivityLevel": summ["sensitivityLevel"],
                "hasNotes": bool(summ["notes"]),
                "stageCount": len(summ["stages"]),
                "derived": False,
                "relationshipIds": [r.id],
                "detailKey": None,
                "drillTargets": [],
                "steps": [],
            },
        )
        edge["steps"].append(n)
    flows = {f["key"]: f for f in list_flows(ws)}
    d = {
        "key": key,
        "level": "flow",
        "c4": "",
        "scope": view.element_id,
        "title": view.title or key,
        "breadcrumb": [{"key": "landscape", "label": "Landscape", "level": "landscape"},
                       {"key": key, "label": f"Flow: {view.title or key}", "level": "flow"}],
        "boundary": None,
        "nodes": nodes,
        "edges": list(edges.values()),
        "addable": [],
        "flow": flows[key],
    }
    decorate(d, sidecar)
    return d
