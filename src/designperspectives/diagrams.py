"""Diagrams: what each C4 level shows, computed from the one model.

A diagram's content is always derived from the model (like `include *` in Structurizr DSL),
so a rename or a new relationship shows up in every diagram that contains the element.

Diagram keys (also used as Structurizr view keys where a view exists):
  landscape                 all people and software systems                      C1
  context-<systemId>        a system and everything it talks to                  C1
  containers-<systemId>     the containers of a system, plus what they talk to   C2
  components-<containerId>  the components of a container, plus what they talk to C3
  code-<id>                 files mapped to an element/connector, imports between them  C4
  connector-<relId>         the inside of one relationship: stages of a pipeline/protocol
  flow-<name>               a flow (Structurizr dynamic view), see flows.py

Relationships between lower-level elements are shown at higher levels as *derived* edges
(e.g. Customer -> Web Application appears as Customer -> Internet Banking System on the
landscape) unless an explicit relationship already joins the two shown elements.

Positions: Structurizr renders boxes at 450x300 px; the UI draws them at 225x150. Positions
are stored in Structurizr units (UI value x 2) so a layout made here looks the same there.
Diagrams with no Structurizr view (connector, code) keep positions in the sidecar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .ops import (
    CODE_KEY,
    STAGES_KEY,
    Index,
    build_index,
    element_summary,
    get_json,
    relationship_summary,
)
from .sidecar import Sidecar
from .workspace import VIEW_LISTS, ElementView, RelationshipView, View, Workspace

SCALE = 2
PREFIX_LEVEL = {
    "context-": "context",
    "containers-": "container",
    "components-": "component",
    "code-": "code",
    "connector-": "connector",
}
VIEW_LIST_OF_LEVEL = {
    "landscape": "system_landscape_views",
    "context": "system_context_views",
    "container": "container_views",
    "component": "component_views",
}
C4_OF_LEVEL = {"landscape": "C1", "context": "C1", "container": "C2", "component": "C3", "code": "C4", "connector": "C3"}
LEVEL_PROPERTY = "dp.level"


@dataclass(frozen=True)
class DiagramRef:
    key: str
    level: str  # landscape | context | container | component | code | connector
    scope: str | None  # element (or relationship) ID the diagram is about


def parse_key(key: str) -> DiagramRef | None:
    if key == "landscape":
        return DiagramRef(key, "landscape", None)
    for prefix, level in PREFIX_LEVEL.items():
        if key.startswith(prefix) and len(key) > len(prefix):
            return DiagramRef(key, level, key[len(prefix):])
    return None


def key_for(level: str, scope: str | None) -> str:
    if level == "landscape":
        return "landscape"
    prefix = {v: k for k, v in PREFIX_LEVEL.items()}[level]
    return f"{prefix}{scope}"


def valid_ref(idx: Index, ref: DiagramRef) -> bool:
    if ref.level == "landscape":
        return True
    if ref.level == "connector":
        return ref.scope in idx.relationships
    if ref.level == "code":
        return ref.scope in idx.elements or ref.scope in idx.relationships
    if ref.scope not in idx.elements:
        return False
    kind = idx.kind[ref.scope]
    return (ref.level in ("context", "container") and kind == "softwareSystem") or (
        ref.level == "component" and kind == "container"
    )


def key_is_valid(ws: Workspace, idx: Index, key: str) -> bool:
    ref = parse_key(key)
    if ref is not None and valid_ref(idx, ref):
        return True
    return any(v.key == key for v in ws.views.dynamic_views)


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
            summ = relationship_summary(r)
            explicit.append(
                {
                    "id": r.id,
                    "source": a,
                    "target": b,
                    "description": r.description or "",
                    "technology": summ["technology"],
                    "technologies": summ["technologies"],
                    "kind": summ["kind"],
                    "sensitivityLevel": summ["sensitivityLevel"],
                    "hasNotes": bool(summ["notes"]),
                    "stageCount": len(summ["stages"]),
                    "openWork": sum(1 for w in summ["work"] if w.get("status") != "done"),
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
        techs: list[str] = []
        for i in rel_ids:
            for t in relationship_summary(idx.relationships[i])["technologies"]:
                if t not in techs:
                    techs.append(t)
        edges.append(
            {
                "id": f"derived:{a}->{b}",
                "source": a,
                "target": b,
                "description": descs[0] if len(descs) == 1 else f"{len(rel_ids)} relationships",
                "technology": ", ".join(techs),
                "technologies": techs,
                "kind": "",
                "sensitivityLevel": None,
                "hasNotes": False,
                "stageCount": 0,
                "openWork": 0,
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


# --------------------------------------------------------------------------- tree, titles, drilling


def home_key(idx: Index, element_id: str) -> str:
    """The diagram where an element is drawn as one of its own boxes."""
    kind = idx.kind[element_id]
    if kind == "container":
        return key_for("container", idx.parent[element_id])
    if kind == "component":
        return key_for("component", idx.parent[element_id])
    return "landscape"


def _candidate_refs(idx: Index) -> list[DiagramRef]:
    """Every static diagram that could exist, most detailed level first."""
    refs: list[DiagramRef] = []
    for s in idx.ws.model.software_systems:
        for c in s.containers:
            refs.append(DiagramRef(key_for("component", c.id), "component", c.id))
    for s in idx.ws.model.software_systems:
        refs.append(DiagramRef(key_for("container", s.id), "container", s.id))
    for s in idx.ws.model.software_systems:
        refs.append(DiagramRef(key_for("context", s.id), "context", s.id))
    refs.append(DiagramRef("landscape", "landscape", None))
    return refs


def drawn_in_map(idx: Index) -> dict[str, str]:
    """For each relationship, the most detailed diagram that draws it as a line of its own
    (or, failing that, one that shows it as part of a derived line)."""
    drawn: dict[str, str] = {}
    fallback: dict[str, str] = {}
    for ref in _candidate_refs(idx):
        _, edges = compute(idx, ref)
        for e in edges:
            if e["derived"]:
                for rid in e["relationshipIds"]:
                    fallback.setdefault(rid, ref.key)
            else:
                drawn.setdefault(e["id"], ref.key)
    return {**fallback, **drawn}


def drill_key(idx: Index, element_id: str) -> str | None:
    kind = idx.kind[element_id]
    if kind == "softwareSystem":
        return key_for("container", element_id)
    if kind == "container":
        return key_for("component", element_id)
    if kind == "component" and get_json(idx.elements[element_id], CODE_KEY):
        return key_for("code", element_id)
    return None


def parent_key(idx: Index, ref: DiagramRef, drawn: dict[str, str]) -> str | None:
    if ref.level == "landscape":
        return None
    if ref.level == "context":
        return "landscape"
    if ref.level == "container":
        return key_for("context", ref.scope)
    if ref.level == "component":
        return key_for("container", idx.parent[ref.scope])  # type: ignore[index]
    if ref.level == "connector":
        return drawn.get(ref.scope, "landscape")  # type: ignore[arg-type]
    if ref.level == "code":
        if ref.scope in idx.elements:
            return home_key(idx, ref.scope)  # type: ignore[arg-type]
        return key_for("connector", ref.scope)
    return "landscape"


def scope_name(idx: Index, ref: DiagramRef) -> str:
    if ref.level == "landscape":
        return "Landscape"
    if ref.level == "connector":
        r = idx.relationships[ref.scope]  # type: ignore[index]
        return f"{idx.elements[r.source_id].name} → {idx.elements[r.destination_id].name}"
    if ref.scope in idx.elements:
        return idx.elements[ref.scope].name
    r = idx.relationships[ref.scope]  # type: ignore[index]
    return f"{idx.elements[r.source_id].name} → {idx.elements[r.destination_id].name}"


def title_of(idx: Index, ref: DiagramRef) -> str:
    if ref.level == "landscape":
        return "System landscape"
    name = scope_name(idx, ref)
    return {
        "context": f"{name} — context",
        "container": f"{name} — containers",
        "component": f"{name} — components",
        "code": f"{name} — code",
        "connector": f"{name} — connector detail",
    }[ref.level]


def breadcrumb(idx: Index, ref: DiagramRef, drawn: dict[str, str]) -> list[dict]:
    chain: list[DiagramRef] = []
    cur: DiagramRef | None = ref
    while cur is not None and len(chain) < 8:
        chain.append(cur)
        pk = parent_key(idx, cur, drawn)
        nxt = parse_key(pk) if pk else None
        cur = nxt if (nxt and valid_ref(idx, nxt)) else None
    return [
        {"key": c.key, "label": scope_name(idx, c), "level": c.level, "c4": C4_OF_LEVEL.get(c.level, "")}
        for c in reversed(chain)
    ]


def addable_kinds(ref: DiagramRef) -> list[str]:
    """Element types the canvas can create on this diagram."""
    if ref.level in ("landscape", "context"):
        return ["person", "softwareSystem"]
    if ref.level == "container":
        return ["container", "person", "softwareSystem"]
    if ref.level == "component":
        return ["component", "person", "softwareSystem"]
    if ref.level == "connector":
        return ["stage"]
    return []


# --------------------------------------------------------------------------- diagram payload


def diagram(ws: Workspace, key: str, sidecar: Sidecar | None = None, code_root: Path | None = None) -> dict | None:
    idx = build_index(ws)
    ref = parse_key(key)
    if ref is None or not valid_ref(idx, ref):
        return None
    drawn = drawn_in_map(idx)
    if ref.level == "connector":
        from .connectors import connector_diagram

        d = connector_diagram(idx, ref)
    elif ref.level == "code":
        from .code import code_diagram

        d = code_diagram(idx, ref, code_root)
    else:
        d = _static_diagram(ws, idx, ref, drawn)
    d["breadcrumb"] = breadcrumb(idx, ref, drawn)
    d["c4"] = C4_OF_LEVEL.get(ref.level, "")
    d["addable"] = addable_kinds(ref)
    decorate(d, sidecar)
    return d


def _static_diagram(ws: Workspace, idx: Index, ref: DiagramRef, drawn: dict[str, str]) -> dict:
    node_ids, edges = compute(idx, ref)
    pos = positions_of(find_view(ws, ref.key))
    scope_set = set(_mapper(idx, ref)[0])
    nodes = []
    for n in node_ids:
        s = element_summary(idx, n)
        s["inScope"] = n in scope_set
        s["position"] = pos.get(n)
        s["drillKey"] = drill_key(idx, n)
        nodes.append(s)
    for e in edges:
        if e["derived"]:
            e["detailKey"] = None
            e["drillTargets"] = _drill_targets(idx, e["relationshipIds"], drawn)
        else:
            e["detailKey"] = key_for("connector", e["id"])
            e["drillTargets"] = []
    boundary = None
    if ref.level in ("container", "component"):
        boundary = {"id": ref.scope, "name": idx.elements[ref.scope].name, "kind": idx.kind[ref.scope]}  # type: ignore[index]
    return {
        "key": ref.key,
        "level": ref.level,
        "scope": ref.scope,
        "title": title_of(idx, ref),
        "boundary": boundary,
        "nodes": nodes,
        "edges": edges,
    }


def _drill_targets(idx: Index, rel_ids: list[str], drawn: dict[str, str]) -> list[dict]:
    out = []
    for rid in rel_ids:
        key = drawn.get(rid)
        ref = parse_key(key) if key else None
        if ref is None:
            continue
        r = idx.relationships[rid]
        out.append(
            {
                "relationshipId": rid,
                "key": key,
                "title": title_of(idx, ref),
                "label": f"{idx.elements[r.source_id].name} → {idx.elements[r.destination_id].name}",
                "description": r.description or "",
            }
        )
    return out


def decorate(d: dict, sidecar: Sidecar | None) -> None:
    """Attach styles, box sizes and edge geometry from the sidecar."""
    layout = sidecar.layouts.get(d["key"]) if sidecar else None
    for n in d["nodes"]:
        style = sidecar.styles.get(n["id"]) if sidecar else None
        n["style"] = style.model_dump(by_alias=True, exclude_none=True) if style else {}
        size = layout.sizes.get(n["id"]) if layout else None
        n["size"] = {"w": size.w, "h": size.h} if size else None
        if n.get("position") is None and layout and n["id"] in layout.positions:
            p = layout.positions[n["id"]]
            n["position"] = {"x": p.x, "y": p.y}
    for e in d["edges"]:
        style = sidecar.styles.get(e["id"]) if sidecar else None
        e["style"] = style.model_dump(by_alias=True, exclude_none=True) if style else {}
        lay = layout.edges.get(e["id"]) if layout else None
        e["layout"] = lay.model_dump(by_alias=True, exclude_none=True) if lay else {}


# --------------------------------------------------------------------------- diagram list


def diagram_refs(idx: Index) -> list[DiagramRef]:
    """Diagrams kept as Structurizr views: the landscape, every system with containers, every
    container with components, and any such diagram that already has a stored view (i.e. was
    opened and laid out). Other diagrams are still reachable by drilling down."""
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
        if (
            ref
            and ref.key not in have
            and ref.level in VIEW_LIST_OF_LEVEL
            and valid_ref(idx, ref)
        ):
            refs.append(ref)
            have.add(ref.key)
    return refs


def diagram_list(ws: Workspace) -> list[dict]:
    """The sidebar tree: C1 landscape and contexts, C2 containers, C3 components, C4 code."""
    idx = build_index(ws)
    drawn = drawn_in_map(idx)
    refs = {r.key: r for r in diagram_refs(idx)}
    # Code diagrams for mapped elements; connector details for connectors with stages or code.
    for el_id, el in idx.elements.items():
        if get_json(el, CODE_KEY):
            ref = DiagramRef(key_for("code", el_id), "code", el_id)
            refs[ref.key] = ref
    for rid, r in idx.relationships.items():
        if get_json(r, STAGES_KEY) or get_json(r, CODE_KEY):
            ref = DiagramRef(key_for("connector", rid), "connector", rid)
            refs[ref.key] = ref
        if get_json(r, CODE_KEY):
            ref = DiagramRef(key_for("code", rid), "code", rid)
            refs[ref.key] = ref
    # Make sure every diagram's parent is in the list too.
    changed = True
    while changed:
        changed = False
        for ref in list(refs.values()):
            pk = parent_key(idx, ref, drawn)
            if pk and pk not in refs:
                pref = parse_key(pk)
                if pref and valid_ref(idx, pref):
                    refs[pk] = pref
                    changed = True

    children: dict[str | None, list[DiagramRef]] = {}
    for ref in refs.values():
        children.setdefault(parent_key(idx, ref, drawn), []).append(ref)

    out: list[dict] = []

    def walk(pk: str | None, depth: int) -> None:
        for ref in children.get(pk, []):
            out.append(
                {
                    "key": ref.key,
                    "level": ref.level,
                    "scope": ref.scope,
                    "title": title_of(idx, ref),
                    "label": scope_name(idx, ref),
                    "parentKey": pk,
                    "c4": C4_OF_LEVEL.get(ref.level, ""),
                    "depth": depth,
                }
            )
            walk(ref.key, depth + 1)

    walk(None, 0)
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


def has_structurizr_view(idx: Index, key: str) -> bool:
    ref = parse_key(key)
    return bool(ref and ref.level in VIEW_LIST_OF_LEVEL and valid_ref(idx, ref))


def set_positions(ws: Workspace, key: str, positions: dict[str, dict[str, float]]) -> None:
    """Store UI positions (UI units) for elements on a diagram or flow."""
    idx = build_index(ws)
    ref = parse_key(key)
    if ref is not None and ref.level in VIEW_LIST_OF_LEVEL and valid_ref(idx, ref):
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
