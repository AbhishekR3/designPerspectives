"""Diagrams: what each C4 level shows, computed from the one model.

A diagram's content is always derived from the model (like `include *` in Structurizr DSL),
so a rename or a new relationship shows up in every diagram that contains the element.

Diagram keys (also used as Structurizr view keys):
  landscape                 all people and software systems
  context-<systemId>        a system and everything it talks to
  containers-<systemId>     the containers of a system, plus the people/systems they talk to
  components-<containerId>  the components of a container, plus what they talk to
  flow-<name>               a flow (Structurizr dynamic view), see flows.py

Relationships between lower-level elements are shown at higher levels as *derived* edges
(e.g. Customer -> Web Application appears as Customer -> Internet Banking System on the
landscape) unless an explicit relationship already joins the two shown elements.

Positions: Structurizr renders boxes at 450x300 px; the UI draws them at 225x150. Positions
are stored in Structurizr units (UI value x 2) so a layout made here looks the same there.
"""

from __future__ import annotations

from dataclasses import dataclass

from .ops import Index, build_index, element_summary
from .workspace import VIEW_LISTS, ElementView, RelationshipView, View, Workspace

SCALE = 2
LEVEL_OF_PREFIX = {"context-": "context", "containers-": "container", "components-": "component"}
VIEW_LIST_OF_LEVEL = {
    "landscape": "system_landscape_views",
    "context": "system_context_views",
    "container": "container_views",
    "component": "component_views",
}
LEVEL_PROPERTY = "dp.level"


@dataclass(frozen=True)
class DiagramRef:
    key: str
    level: str  # landscape | context | container | component
    scope: str | None  # element ID the diagram is about


def parse_key(key: str) -> DiagramRef | None:
    if key == "landscape":
        return DiagramRef(key, "landscape", None)
    for prefix, level in LEVEL_OF_PREFIX.items():
        if key.startswith(prefix) and len(key) > len(prefix):
            return DiagramRef(key, level, key[len(prefix):])
    return None


def key_for(level: str, scope: str | None) -> str:
    if level == "landscape":
        return "landscape"
    prefix = {v: k for k, v in LEVEL_OF_PREFIX.items()}[level]
    return f"{prefix}{scope}"


def valid_ref(idx: Index, ref: DiagramRef) -> bool:
    if ref.level == "landscape":
        return True
    if ref.scope not in idx.elements:
        return False
    kind = idx.kind[ref.scope]
    return (ref.level in ("context", "container") and kind == "softwareSystem") or (
        ref.level == "component" and kind == "container"
    )


# --------------------------------------------------------------------------- content


def _mapper(idx: Index, ref: DiagramRef):
    """Return (in_scope ids, map function element -> shown node or None)."""
    if ref.level == "landscape":
        in_scope = [p.id for p in idx.ws.model.people] + [s.id for s in idx.ws.model.software_systems]
        return in_scope, idx.top

    if ref.level == "context":
        return [ref.scope], idx.top

    if ref.level == "container":
        system = ref.scope
        in_scope = list(idx.children[system])

        def m(e: str) -> str | None:
            chain = idx.ancestors(e)
            if chain[-1] == system:
                return None if e == system else chain[-2]  # the container
            return chain[-1]

        return in_scope, m

    # component
    container = ref.scope
    system = idx.parent[container]
    in_scope = list(idx.children[container])

    def m(e: str) -> str | None:
        chain = idx.ancestors(e)
        if container in chain:
            return None if e == container else chain[chain.index(container) - 1]
        if chain[-1] == system:
            return None if e == system else chain[-2]  # a sibling container
        return chain[-1]

    return in_scope, m


def compute(idx: Index, ref: DiagramRef) -> tuple[list[str], list[dict]]:
    """Node IDs and edges shown on a diagram."""
    in_scope, m = _mapper(idx, ref)
    scope_set = set(in_scope)
    nodes = list(in_scope)
    seen = set(nodes)

    explicit: list[dict] = []
    derived: dict[tuple[str, str], list[str]] = {}
    for r in idx.relationships.values():
        a, b = m(r.source_id), m(r.destination_id)
        if a is None or b is None or a == b:
            continue
        if ref.level != "landscape" and a not in scope_set and b not in scope_set:
            continue
        for n in (a, b):
            if n not in seen:
                seen.add(n)
                nodes.append(n)
        if a == r.source_id and b == r.destination_id:
            explicit.append(
                {
                    "id": r.id,
                    "source": a,
                    "target": b,
                    "description": r.description or "",
                    "technology": r.technology or "",
                    "derived": False,
                    "relationshipIds": [r.id],
                }
            )
        else:
            derived.setdefault((a, b), []).append(r.id)

    explicit_pairs = {(e["source"], e["target"]) for e in explicit}
    edges = list(explicit)
    for (a, b), rel_ids in derived.items():
        if (a, b) in explicit_pairs:
            continue
        descs = sorted({idx.relationships[i].description or "" for i in rel_ids} - {""})
        techs = sorted({idx.relationships[i].technology or "" for i in rel_ids} - {""})
        edges.append(
            {
                "id": f"derived:{a}->{b}",
                "source": a,
                "target": b,
                "description": descs[0] if len(descs) == 1 else f"{len(rel_ids)} relationships",
                "technology": ", ".join(techs),
                "derived": True,
                "relationshipIds": sorted(rel_ids),
            }
        )
    return nodes, edges


def find_view(ws: Workspace, key: str) -> View | None:
    for list_name in VIEW_LISTS:
        for v in getattr(ws.views, list_name):
            if v.key == key:
                return v
    return None


def positions_of(view: View | None) -> dict[str, dict[str, float]]:
    if not view:
        return {}
    return {
        e.id: {"x": e.x / SCALE, "y": e.y / SCALE}
        for e in view.elements
        if e.x is not None and e.y is not None
    }


def title_of(idx: Index, ref: DiagramRef) -> str:
    if ref.level == "landscape":
        return "System landscape"
    name = idx.elements[ref.scope].name  # type: ignore[index]
    return {
        "context": f"{name} — context",
        "container": f"{name} — containers",
        "component": f"{name} — components",
    }[ref.level]


def breadcrumb(idx: Index, ref: DiagramRef) -> list[dict]:
    crumbs = [{"key": "landscape", "label": "Landscape", "level": "landscape"}]
    if ref.level == "landscape":
        return crumbs
    if ref.level == "context":
        crumbs.append({"key": ref.key, "label": f"{idx.elements[ref.scope].name} (context)", "level": "context"})
        return crumbs
    system = ref.scope if ref.level == "container" else idx.parent[ref.scope]  # type: ignore[index]
    crumbs.append({"key": key_for("container", system), "label": idx.elements[system].name, "level": "container"})
    if ref.level == "component":
        crumbs.append({"key": ref.key, "label": idx.elements[ref.scope].name, "level": "component"})
    return crumbs


def diagram(ws: Workspace, key: str) -> dict | None:
    idx = build_index(ws)
    ref = parse_key(key)
    if ref is None or not valid_ref(idx, ref):
        return None
    node_ids, edges = compute(idx, ref)
    pos = positions_of(find_view(ws, key))
    scope_set = set(_mapper(idx, ref)[0])
    nodes = []
    for n in node_ids:
        s = element_summary(idx, n)
        s["inScope"] = n in scope_set
        s["position"] = pos.get(n)
        s["drillKey"] = drill_key(idx, n)
        nodes.append(s)
    boundary = None
    if ref.level in ("container", "component"):
        boundary = {"id": ref.scope, "name": idx.elements[ref.scope].name, "kind": idx.kind[ref.scope]}  # type: ignore[index]
    return {
        "key": key,
        "level": ref.level,
        "scope": ref.scope,
        "title": title_of(idx, ref),
        "breadcrumb": breadcrumb(idx, ref),
        "boundary": boundary,
        "nodes": nodes,
        "edges": edges,
        "addable": addable_kinds(ref),
    }


def drill_key(idx: Index, element_id: str) -> str | None:
    kind = idx.kind[element_id]
    if kind == "softwareSystem":
        return key_for("container", element_id)
    if kind == "container":
        return key_for("component", element_id)
    return None


def addable_kinds(ref: DiagramRef) -> list[str]:
    """Element types the canvas can create on this diagram."""
    if ref.level in ("landscape", "context"):
        return ["person", "softwareSystem"]
    if ref.level == "container":
        return ["container", "person", "softwareSystem"]
    return ["component", "person", "softwareSystem"]


# --------------------------------------------------------------------------- diagram list


def diagram_refs(idx: Index) -> list[DiagramRef]:
    """Diagrams offered in the sidebar and kept as Structurizr views: the landscape, every system
    with containers, every container with components, and any diagram that already has a stored
    view (i.e. was opened and laid out). Other diagrams are still reachable by drilling down."""
    refs = [DiagramRef("landscape", "landscape", None)]
    for s in idx.ws.model.software_systems:
        if s.containers:
            refs.append(DiagramRef(key_for("context", s.id), "context", s.id))
            refs.append(DiagramRef(key_for("container", s.id), "container", s.id))
        for c in s.containers:
            if c.components:
                refs.append(DiagramRef(key_for("component", c.id), "component", c.id))
    have = {r.key for r in refs}
    for v in idx.ws.views.all():
        ref = parse_key(v.key)
        if ref and ref.key not in have and valid_ref(idx, ref):
            refs.append(ref)
            have.add(ref.key)
    return refs


def diagram_list(ws: Workspace) -> list[dict]:
    idx = build_index(ws)
    out = []
    for ref in diagram_refs(idx):
        parent = None
        if ref.level == "component":
            parent = key_for("container", idx.parent[ref.scope])  # type: ignore[index]
        elif ref.level in ("context", "container"):
            parent = "landscape"
        out.append({"key": ref.key, "level": ref.level, "scope": ref.scope, "title": title_of(idx, ref), "parentKey": parent})
    return out


# --------------------------------------------------------------------------- Structurizr views


def _ensure_view(ws: Workspace, idx: Index, ref: DiagramRef) -> View:
    v = find_view(ws, ref.key)
    if v is not None:
        return v
    v = View(key=ref.key, properties={LEVEL_PROPERTY: ref.level})
    if ref.level in ("context", "container"):
        v.software_system_id = ref.scope
    elif ref.level == "component":
        v.container_id = ref.scope
    v.description = title_of(idx, ref)
    getattr(ws.views, VIEW_LIST_OF_LEVEL[ref.level]).append(v)
    return v


def set_positions(ws: Workspace, key: str, positions: dict[str, dict[str, float]]) -> None:
    """Store UI positions (UI units) for elements on a diagram or flow."""
    idx = build_index(ws)
    ref = parse_key(key)
    if ref is not None and valid_ref(idx, ref):
        view = _ensure_view(ws, idx, ref)
    else:
        view = find_view(ws, key)
        if view is None:
            raise KeyError(key)
    by_id = {e.id: e for e in view.elements}
    for element_id, p in positions.items():
        if element_id not in idx.elements:
            continue
        ev = by_id.get(element_id)
        if ev is None:
            ev = ElementView(id=element_id)
            view.elements.append(ev)
            by_id[element_id] = ev
        ev.x = int(round(p["x"] * SCALE))
        ev.y = int(round(p["y"] * SCALE))


def sync_views(ws: Workspace) -> None:
    """Make every designPerspectives view list exactly the elements and explicit relationships its
    diagram shows, so Structurizr renders the same content. Keeps stored positions."""
    idx = build_index(ws)
    for ref in diagram_refs(idx):
        view = _ensure_view(ws, idx, ref)
        node_ids, edges = compute(idx, ref)
        old = {e.id: e for e in view.elements}
        view.elements = [old.get(n) or ElementView(id=n) for n in node_ids]
        old_rels = {r.id: r for r in view.relationships}
        rel_ids = [e["id"] for e in edges if not e["derived"]]
        view.relationships = [old_rels.get(r) or RelationshipView(id=r) for r in rel_ids]
    _renumber(ws)


def _renumber(ws: Workspace) -> None:
    """Give views without an `order` the next free number (Structurizr shows views in this order)."""
    views = ws.views.all()
    used = [v.order for v in views if v.order is not None]
    n = max(used, default=0)
    for list_name in VIEW_LISTS:
        for v in getattr(ws.views, list_name):
            if v.order is None:
                n += 1
                v.order = n
