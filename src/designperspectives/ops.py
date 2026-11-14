"""Model index and edit operations on a Structurizr workspace.

All edits made through the UI go through these functions, so the rules live in one place:
- IDs are readable slugs (e.g. "api-application"). Structurizr only requires IDs to be unique
  (structurizr-core SequentialIntegerIdGeneratorStrategy: "any non-numeric IDs are ignored").
- Names must be unique among people + software systems, among containers of one system, and
  among components of one container (structurizr-core Model.hydrate).
- Relationship descriptions must be unique per source/destination pair.

designPerspectives data stored on elements as Structurizr properties:
- `dp.owner`            owner (free text)
- `dp.links`            extra links, a JSON list of {"label", "url"}
- `dp.tag.<Group>`      the element's value in a tag group, e.g. `dp.tag.Risk = High`
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .sidecar import Sidecar
from .workspace import (
    Component,
    Container,
    Element,
    Person,
    Relationship,
    SoftwareSystem,
    Workspace,
    tags_for,
)

OWNER_KEY = "dp.owner"
LINKS_KEY = "dp.links"
TAG_PREFIX = "dp.tag."


class ModelError(ValueError):
    """An edit that would break the model's rules. Shown to the user as-is."""


# --------------------------------------------------------------------------- index


@dataclass
class Index:
    ws: Workspace
    elements: dict[str, Element] = field(default_factory=dict)
    kind: dict[str, str] = field(default_factory=dict)
    parent: dict[str, str | None] = field(default_factory=dict)
    children: dict[str, list[str]] = field(default_factory=dict)
    relationships: dict[str, Relationship] = field(default_factory=dict)
    rel_owner: dict[str, str] = field(default_factory=dict)

    def top(self, element_id: str) -> str:
        while self.parent.get(element_id):
            element_id = self.parent[element_id]  # type: ignore[assignment]
        return element_id

    def ancestors(self, element_id: str) -> list[str]:
        """The element itself, then its parent, grandparent, ..."""
        out = [element_id]
        while self.parent.get(out[-1]):
            out.append(self.parent[out[-1]])  # type: ignore[arg-type]
        return out

    def descendants(self, element_id: str) -> list[str]:
        out: list[str] = []
        stack = list(self.children.get(element_id, []))
        while stack:
            e = stack.pop()
            out.append(e)
            stack.extend(self.children.get(e, []))
        return out

    def is_external(self, element_id: str) -> bool:
        el = self.elements[self.top(element_id)]
        return getattr(el, "location", None) == "External"


def build_index(ws: Workspace) -> Index:
    idx = Index(ws=ws)

    def add(el: Element, kind: str, parent: str | None) -> None:
        if el.id in idx.elements:
            raise ModelError(f'Two elements share the ID "{el.id}".')
        idx.elements[el.id] = el
        idx.kind[el.id] = kind
        idx.parent[el.id] = parent
        idx.children.setdefault(el.id, [])
        if parent:
            idx.children[parent].append(el.id)
        for r in el.relationships:
            if r.id in idx.relationships:
                raise ModelError(f'Two relationships share the ID "{r.id}".')
            idx.relationships[r.id] = r
            idx.rel_owner[r.id] = el.id

    for p in ws.model.people:
        add(p, "person", None)
    for s in ws.model.software_systems:
        add(s, "softwareSystem", None)
        for c in s.containers:
            add(c, "container", s.id)
            for k in c.components:
                add(k, "component", c.id)
    return idx


# --------------------------------------------------------------------------- helpers


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "element"


def unique(base: str, taken: set[str], sep: str = "-") -> str:
    if base not in taken:
        return base
    n = 2
    while f"{base}{sep}{n}" in taken:
        n += 1
    return f"{base}{sep}{n}"


def sibling_names(idx: Index, kind: str, parent_id: str | None, exclude: str | None = None) -> set[str]:
    """Names that a new/renamed element of this kind must not reuse."""
    if kind in ("person", "softwareSystem"):
        ids = [p.id for p in idx.ws.model.people] + [s.id for s in idx.ws.model.software_systems]
    else:
        ids = list(idx.children.get(parent_id or "", []))
    return {idx.elements[i].name for i in ids if i != exclude}


def get_props(el: Element | Relationship) -> dict[str, str]:
    return dict(el.properties or {})


def set_prop(el: Element | Relationship, key: str, value: str | None) -> None:
    props = get_props(el)
    if value is None or value == "":
        props.pop(key, None)
    else:
        props[key] = value
    el.properties = props or None


def element_tags(el: Element) -> dict[str, str]:
    return {k[len(TAG_PREFIX):]: v for k, v in get_props(el).items() if k.startswith(TAG_PREFIX)}


def element_links(el: Element) -> list[dict[str, str]]:
    raw = get_props(el).get(LINKS_KEY)
    if not raw:
        return []
    try:
        links = json.loads(raw)
        return [{"label": str(x.get("label", "")), "url": str(x.get("url", ""))} for x in links if isinstance(x, dict)]
    except (ValueError, AttributeError):
        return []


def element_summary(idx: Index, element_id: str) -> dict:
    """Flat description of one element, as the UI uses it."""
    el = idx.elements[element_id]
    return {
        "id": el.id,
        "kind": idx.kind[el.id],
        "name": el.name,
        "description": el.description or "",
        "technology": getattr(el, "technology", None) or "",
        "url": el.url or "",
        "owner": get_props(el).get(OWNER_KEY, ""),
        "links": element_links(el),
        "tags": element_tags(el),
        "parentId": idx.parent[el.id],
        "external": idx.is_external(el.id),
        "location": getattr(el, "location", None),
        "childCount": len(idx.children.get(el.id, [])),
    }


def relationship_summary(r: Relationship) -> dict:
    return {
        "id": r.id,
        "sourceId": r.source_id,
        "destinationId": r.destination_id,
        "description": r.description or "",
        "technology": r.technology or "",
    }


# --------------------------------------------------------------------------- elements

CHILD_KIND = {"softwareSystem": "container", "container": "component"}
DEFAULT_NAMES = {
    "person": "New person",
    "softwareSystem": "New system",
    "container": "New container",
    "component": "New component",
}


def create_element(
    ws: Workspace,
    kind: str,
    name: str | None = None,
    parent_id: str | None = None,
    description: str | None = None,
    technology: str | None = None,
    external: bool = False,
) -> str:
    idx = build_index(ws)
    if kind in ("person", "softwareSystem"):
        if parent_id:
            raise ModelError("People and software systems have no parent.")
    elif kind in ("container", "component"):
        if not parent_id or parent_id not in idx.elements:
            raise ModelError(f"A {kind} needs a parent.")
        if CHILD_KIND.get(idx.kind[parent_id]) != kind:
            want = "software system" if kind == "container" else "container"
            raise ModelError(f"A {kind} must sit inside a {want}.")
    else:
        raise ModelError(f"Unknown element type: {kind}")

    taken_names = sibling_names(idx, kind, parent_id)
    name = (name or "").strip()
    if not name:
        name = unique(DEFAULT_NAMES[kind], taken_names, sep=" ")
    elif name in taken_names:
        raise ModelError(f'The name "{name}" is already used here.')
    new_id = unique(slugify(name), set(idx.elements) | set(idx.relationships))
    common = {
        "id": new_id,
        "name": name,
        "description": description or None,
        "tags": tags_for(kind),
    }
    if kind == "person":
        ws.model.people.append(Person(**common, location="External" if external else None))
    elif kind == "softwareSystem":
        ws.model.software_systems.append(SoftwareSystem(**common, location="External" if external else None))
    elif kind == "container":
        parent = idx.elements[parent_id]  # type: ignore[index]
        assert isinstance(parent, SoftwareSystem)
        parent.containers.append(Container(**common, technology=technology or None))
    else:
        parent = idx.elements[parent_id]  # type: ignore[index]
        assert isinstance(parent, Container)
        parent.components.append(Component(**common, technology=technology or None))
    return new_id


def update_element(ws: Workspace, sidecar: Sidecar, element_id: str, patch: dict) -> None:
    idx = build_index(ws)
    if element_id not in idx.elements:
        raise ModelError(f'No element with ID "{element_id}".')
    el = idx.elements[element_id]
    kind = idx.kind[element_id]

    if "name" in patch:
        name = (patch["name"] or "").strip()
        if not name:
            raise ModelError("Name cannot be empty.")
        if name in sibling_names(idx, kind, idx.parent[element_id], exclude=element_id):
            raise ModelError(f'The name "{name}" is already used here.')
        el.name = name
    if "description" in patch:
        el.description = patch["description"] or None
    if "technology" in patch:
        if kind not in ("container", "component"):
            raise ModelError("Only containers and components have a technology.")
        el.technology = patch["technology"] or None  # type: ignore[union-attr]
    if "url" in patch:
        el.url = patch["url"] or None
    if "owner" in patch:
        set_prop(el, OWNER_KEY, (patch["owner"] or "").strip() or None)
    if "links" in patch:
        links = [
            {"label": (x.get("label") or "").strip(), "url": (x.get("url") or "").strip()}
            for x in patch["links"] or []
            if (x.get("url") or "").strip()
        ]
        set_prop(el, LINKS_KEY, json.dumps(links, ensure_ascii=False) if links else None)
    if "external" in patch:
        if kind not in ("person", "softwareSystem"):
            raise ModelError("Only people and software systems can be marked external.")
        el.location = "External" if patch["external"] else None  # type: ignore[union-attr]
    if "tags" in patch:
        groups = {g.name: g for g in sidecar.tag_groups}
        for group, value in (patch["tags"] or {}).items():
            if group not in groups:
                raise ModelError(f'No tag group named "{group}".')
            if value is not None and value not in {v.name for v in groups[group].values}:
                raise ModelError(f'"{value}" is not a value of tag group "{group}".')
            set_prop(el, TAG_PREFIX + group, value)


def delete_element(ws: Workspace, element_id: str) -> set[str]:
    """Delete an element, its children, and every relationship touching any of them."""
    idx = build_index(ws)
    if element_id not in idx.elements:
        raise ModelError(f'No element with ID "{element_id}".')
    gone = {element_id, *idx.descendants(element_id)}

    ws.model.people = [p for p in ws.model.people if p.id not in gone]
    ws.model.software_systems = [s for s in ws.model.software_systems if s.id not in gone]
    for s in ws.model.software_systems:
        s.containers = [c for c in s.containers if c.id not in gone]
        for c in s.containers:
            c.components = [k for k in c.components if k.id not in gone]

    gone_rels = {r.id for r in idx.relationships.values() if r.source_id in gone or r.destination_id in gone}
    _drop_relationships(ws, gone_rels)
    _drop_from_views(ws, gone, gone_rels)
    return gone


# --------------------------------------------------------------------------- relationships


def create_relationship(
    ws: Workspace,
    source_id: str,
    destination_id: str,
    description: str | None = None,
    technology: str | None = None,
) -> str:
    idx = build_index(ws)
    for e in (source_id, destination_id):
        if e not in idx.elements:
            raise ModelError(f'No element with ID "{e}".')
    if source_id == destination_id:
        raise ModelError("An element cannot have a relationship with itself.")
    if destination_id in idx.ancestors(source_id) or source_id in idx.ancestors(destination_id):
        raise ModelError("Relationships between a parent and its own child are not allowed.")

    existing = {
        (r.description or "") for r in idx.relationships.values()
        if r.source_id == source_id and r.destination_id == destination_id
    }
    description = (description or "").strip()
    if not description:
        description = unique("Uses", existing, sep=" ")
    elif description in existing:
        raise ModelError(f'A relationship "{description}" already exists between these two elements.')

    base = f"{source_id}--{destination_id}"
    rel_id = unique(base, set(idx.relationships) | set(idx.elements))
    rel = Relationship(
        id=rel_id,
        source_id=source_id,
        destination_id=destination_id,
        description=description,
        technology=technology or None,
        tags=tags_for("relationship"),
    )
    idx.elements[source_id].relationships.append(rel)
    return rel_id


def update_relationship(ws: Workspace, rel_id: str, patch: dict) -> None:
    idx = build_index(ws)
    if rel_id not in idx.relationships:
        raise ModelError(f'No relationship with ID "{rel_id}".')
    r = idx.relationships[rel_id]
    if "description" in patch:
        description = (patch["description"] or "").strip()
        clash = any(
            o.id != rel_id and o.source_id == r.source_id and o.destination_id == r.destination_id
            and (o.description or "") == description
            for o in idx.relationships.values()
        )
        if clash:
            raise ModelError(f'A relationship "{description}" already exists between these two elements.')
        r.description = description or None
    if "technology" in patch:
        r.technology = patch["technology"] or None


def delete_relationship(ws: Workspace, rel_id: str) -> None:
    idx = build_index(ws)
    if rel_id not in idx.relationships:
        raise ModelError(f'No relationship with ID "{rel_id}".')
    _drop_relationships(ws, {rel_id})
    _drop_from_views(ws, set(), {rel_id})


def _drop_relationships(ws: Workspace, rel_ids: set[str]) -> None:
    if not rel_ids:
        return
    idx = build_index(ws)
    for el in idx.elements.values():
        el.relationships = [r for r in el.relationships if r.id not in rel_ids]


def _drop_from_views(ws: Workspace, element_ids: set[str], rel_ids: set[str]) -> None:
    """Remove references to deleted things from every view; drop views whose scope is gone."""
    from .workspace import VIEW_LISTS

    for list_name in VIEW_LISTS:
        kept = []
        for v in getattr(ws.views, list_name):
            scope = v.software_system_id or v.container_id or v.element_id
            if scope and scope in element_ids:
                if (v.properties or {}).get("dp.flow") == "true":
                    v.element_id = None  # our flows: scope is re-inferred from the remaining steps
                else:
                    continue
            v.elements = [e for e in v.elements if e.id not in element_ids]
            v.relationships = [r for r in v.relationships if r.id not in rel_ids]
            kept.append(v)
        setattr(ws.views, list_name, kept)


# --------------------------------------------------------------------------- tag groups


def rename_tag_group_everywhere(ws: Workspace, sidecar: Sidecar, old: str, new: str) -> None:
    idx = build_index(ws)
    for el in idx.elements.values():
        props = get_props(el)
        if TAG_PREFIX + old in props:
            value = props.pop(TAG_PREFIX + old)
            props[TAG_PREFIX + new] = value
            el.properties = props
    for lens in sidecar.lenses:
        if lens.default_overlay == old:
            lens.default_overlay = new
        lens.hidden_tag_groups = [new if g == old else g for g in lens.hidden_tag_groups]


def rewrite_tag_values(ws: Workspace, group: str, renames: dict[str, str], allowed: set[str]) -> None:
    """Apply value renames, then clear values that are no longer allowed."""
    idx = build_index(ws)
    key = TAG_PREFIX + group
    for el in idx.elements.values():
        value = get_props(el).get(key)
        if value is None:
            continue
        value = renames.get(value, value)
        set_prop(el, key, value if value in allowed else None)


def remove_tag_group_everywhere(ws: Workspace, sidecar: Sidecar, group: str) -> None:
    idx = build_index(ws)
    for el in idx.elements.values():
        set_prop(el, TAG_PREFIX + group, None)
    for lens in sidecar.lenses:
        if lens.default_overlay == group:
            lens.default_overlay = None
        lens.hidden_tag_groups = [g for g in lens.hidden_tag_groups if g != group]
