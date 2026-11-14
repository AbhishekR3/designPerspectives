"""Model index and edit operations on a Structurizr workspace.

All edits made through the UI go through these functions, so the rules live in one place:
- IDs are readable slugs (e.g. "api-application"). Structurizr only requires IDs to be unique
  (structurizr-core SequentialIntegerIdGeneratorStrategy: "any non-numeric IDs are ignored").
- Names must be unique among people + software systems, among containers of one system, and
  among components of one container (structurizr-core Model.hydrate).
- Relationship descriptions must be unique per source/destination pair.
- Technology is a list of tags, stored in Structurizr's `technology` field as "A, B, C".

designPerspectives data stored on elements (and relationships) as Structurizr properties:
  dp.owner         owner (free text)                          elements
  dp.links         extra links, JSON [{"label","url"}]        elements
  dp.tag.<Group>   value in a tag group, e.g. dp.tag.Risk=High elements
  dp.archType      symbol/type (database, queue, ...)          elements
  dp.notes         free-form notes                             elements, relationships
  dp.details       JSON [{"title","columns","rows"}] tables    elements (connection info, columns, ...)
  dp.tradeoffs     JSON [{"kind","text"}]                      elements
  dp.usage         JSON [{"users","frequency","volume"}]       elements
  dp.sensitive     JSON [{"item","level"}]                     elements, relationships
  dp.code.paths    JSON ["path/relative/to/code/root", ...]    elements, relationships
  dp.kind          connector kind (data-pipeline, ...)         relationships
  dp.stages        JSON [{"id","name","technologies",...}]     relationships
"""

from __future__ import annotations

import json
import posixpath
import re
from dataclasses import dataclass, field

from .sidecar import Sidecar, Style
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
ARCH_KEY = "dp.archType"
NOTES_KEY = "dp.notes"
TRADEOFFS_KEY = "dp.tradeoffs"
USAGE_KEY = "dp.usage"
SENSITIVE_KEY = "dp.sensitive"
CODE_KEY = "dp.code.paths"
KIND_KEY = "dp.kind"
STAGES_KEY = "dp.stages"
DETAILS_KEY = "dp.details"

ARCH_TYPES = [
    ("box", "Box (generic)"),
    ("service", "Service / application"),
    ("web", "Web UI"),
    ("mobile", "Mobile app"),
    ("database", "Database"),
    ("cache", "Cache"),
    ("queue", "Queue / stream"),
    ("pipeline", "Pipeline / job"),
    ("storage", "Object / file storage"),
    ("cloud", "Cloud service"),
    ("document", "Document / file"),
]
SENSITIVITY = ["public", "internal", "confidential", "restricted"]
FREQUENCIES = ["rarely", "monthly", "weekly", "daily", "hourly", "continuous"]
TRADEOFF_KINDS = ["benefit", "cost", "risk"]
CONNECTOR_KINDS = [
    ("sync-api", "Synchronous API (REST / RPC)"),
    ("async-message", "Message / event"),
    ("stream", "Streaming"),
    ("data-pipeline", "Data pipeline (ETL / ELT)"),
    ("batch", "Batch job"),
    ("db-connection", "Database connection"),
    ("file-transfer", "File transfer"),
    ("cloud-service", "Cloud service call"),
    ("other", "Other"),
]
ENUMS = {
    "archTypes": [{"id": i, "label": label} for i, label in ARCH_TYPES],
    "sensitivity": SENSITIVITY,
    "frequencies": FREQUENCIES,
    "tradeoffKinds": TRADEOFF_KINDS,
    "connectorKinds": [{"id": i, "label": label} for i, label in CONNECTOR_KINDS],
}

SUGGESTED_TECH = [
    "Python", "Java", "Kotlin", "TypeScript", "JavaScript", "Go", "Rust", "C#", ".NET", "Ruby", "PHP", "SQL",
    "React", "Angular", "Vue", "Spring Boot", "Spring MVC", "FastAPI", "Django", "Flask", "Node.js", "Express",
    "PostgreSQL", "MySQL", "Oracle", "SQL Server", "MongoDB", "DynamoDB", "Redis", "Elasticsearch", "Snowflake",
    "Kafka", "RabbitMQ", "SQS", "SNS", "Kinesis", "Pub/Sub", "Airflow", "Spark", "dbt", "Flink",
    "HTTPS", "REST", "JSON", "gRPC", "GraphQL", "WebSocket", "SQL/TCP", "AMQP", "SFTP", "SMTP",
    "AWS Lambda", "AWS S3", "AWS Glue", "Azure Functions", "GCP Cloud Run", "Docker", "Kubernetes", "Terraform",
]


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


def get_json(el: Element | Relationship, key: str) -> list:
    raw = get_props(el).get(key)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    return data if isinstance(data, list) else []


def set_json(el: Element | Relationship, key: str, value: list | None) -> None:
    set_prop(el, key, json.dumps(value, ensure_ascii=False) if value else None)


def element_tags(el: Element) -> dict[str, str]:
    return {k[len(TAG_PREFIX):]: v for k, v in get_props(el).items() if k.startswith(TAG_PREFIX)}


def element_links(el: Element) -> list[dict[str, str]]:
    return [
        {"label": str(x.get("label", "")), "url": str(x.get("url", ""))}
        for x in get_json(el, LINKS_KEY)
        if isinstance(x, dict)
    ]


def split_tech(value: str | list[str] | None) -> list[str]:
    items = value if isinstance(value, list) else (value or "").split(",")
    out: list[str] = []
    for t in items:
        t = str(t).strip()
        if t and t not in out:
            out.append(t)
    return out


def join_tech(value: str | list[str] | None) -> str | None:
    return ", ".join(split_tech(value)) or None


# ---- cleaning of structured fields (raise ModelError with a readable message)


def clean_tradeoffs(items: list) -> list[dict]:
    out = []
    for x in items or []:
        text = str(x.get("text", "")).strip()
        if not text:
            continue
        kind = x.get("kind", "benefit")
        if kind not in TRADEOFF_KINDS:
            raise ModelError(f'Unknown tradeoff kind "{kind}".')
        out.append({"kind": kind, "text": text})
    return out


def clean_details(items: list) -> list[dict]:
    """Free tables of extra information, e.g. connection details or a database's columns."""
    out = []
    for x in items or []:
        title = str(x.get("title", "")).strip()
        columns = [str(c).strip() for c in x.get("columns") or []]
        if not title and not columns:
            continue
        if not columns or any(not c for c in columns):
            raise ModelError(f'Details table "{title}" needs a name for every column.')
        rows = []
        for r in x.get("rows") or []:
            cells = [str(c) for c in list(r)[: len(columns)]]
            cells += [""] * (len(columns) - len(cells))
            if any(c.strip() for c in cells):
                rows.append(cells)
        out.append({"title": title or "Details", "columns": columns, "rows": rows})
    return out


def clean_usage(items: list) -> list[dict]:
    out = []
    for x in items or []:
        users = str(x.get("users", "")).strip()
        if not users:
            continue
        freq = x.get("frequency", "daily")
        if freq not in FREQUENCIES:
            raise ModelError(f'Unknown usage frequency "{freq}".')
        row = {"users": users, "frequency": freq}
        volume = str(x.get("volume", "") or "").strip()
        if volume:
            row["volume"] = volume
        out.append(row)
    return out


def clean_sensitive(items: list) -> list[dict]:
    out = []
    for x in items or []:
        item = str(x.get("item", "")).strip()
        if not item:
            continue
        level = x.get("level", "confidential")
        if level not in SENSITIVITY:
            raise ModelError(f'Unknown sensitivity level "{level}".')
        out.append({"item": item, "level": level})
    return out


def clean_paths(paths: list) -> list[str]:
    out: list[str] = []
    for p in paths or []:
        p = str(p).strip().replace("\\", "/")
        if not p:
            continue
        norm = posixpath.normpath(p)
        if norm.startswith("/") or norm == ".." or norm.startswith("../") or re.match(r"^[A-Za-z]:", norm):
            raise ModelError(f'Code paths must be inside the code folder: "{p}".')
        if norm == ".":
            norm = "."
        if norm not in out:
            out.append(norm)
    return out


def max_sensitivity(items: list[dict]) -> str | None:
    levels = [x.get("level") for x in items if x.get("level") in SENSITIVITY]
    return max(levels, key=SENSITIVITY.index) if levels else None


def clean_stages(items: list, idx: Index) -> list[dict]:
    out: list[dict] = []
    taken: set[str] = set()
    for x in items or []:
        name = str(x.get("name", "")).strip()
        if not name:
            raise ModelError("Every stage needs a name.")
        sid = str(x.get("id") or "").strip() or slugify(name)
        sid = unique(sid, taken)
        taken.add(sid)
        elem = x.get("elementId") or None
        if elem and elem not in idx.elements:
            raise ModelError(f'Stage "{name}" links to an element that does not exist.')
        stage = {"id": sid, "name": name}
        techs = split_tech(x.get("technologies") if "technologies" in x else x.get("technology"))
        if techs:
            stage["technologies"] = techs
        desc = str(x.get("description", "") or "").strip()
        if desc:
            stage["description"] = desc
        if elem:
            stage["elementId"] = elem
        arch = x.get("archType")
        if arch:
            if arch not in {a for a, _ in ARCH_TYPES}:
                raise ModelError(f'Unknown type "{arch}".')
            stage["archType"] = arch
        out.append(stage)
    return out


# ---- summaries


def element_summary(idx: Index, element_id: str) -> dict:
    """Flat description of one element, as the UI uses it."""
    el = idx.elements[element_id]
    props = get_props(el)
    techs = split_tech(getattr(el, "technology", None))
    sensitive = get_json(el, SENSITIVE_KEY)
    return {
        "id": el.id,
        "kind": idx.kind[el.id],
        "name": el.name,
        "description": el.description or "",
        "technology": ", ".join(techs),
        "technologies": techs,
        "url": el.url or "",
        "owner": props.get(OWNER_KEY, ""),
        "links": element_links(el),
        "tags": element_tags(el),
        "archType": props.get(ARCH_KEY, ""),
        "notes": props.get(NOTES_KEY, ""),
        "details": get_json(el, DETAILS_KEY),
        "tradeoffs": get_json(el, TRADEOFFS_KEY),
        "usage": get_json(el, USAGE_KEY),
        "sensitive": sensitive,
        "sensitivityLevel": max_sensitivity(sensitive),
        "codePaths": get_json(el, CODE_KEY),
        "parentId": idx.parent[el.id],
        "external": idx.is_external(el.id),
        "location": getattr(el, "location", None),
        "childCount": len(idx.children.get(el.id, [])),
    }


def relationship_summary(r: Relationship) -> dict:
    techs = split_tech(r.technology)
    sensitive = get_json(r, SENSITIVE_KEY)
    return {
        "id": r.id,
        "sourceId": r.source_id,
        "destinationId": r.destination_id,
        "description": r.description or "",
        "technology": ", ".join(techs),
        "technologies": techs,
        "kind": get_props(r).get(KIND_KEY, ""),
        "notes": get_props(r).get(NOTES_KEY, ""),
        "sensitive": sensitive,
        "sensitivityLevel": max_sensitivity(sensitive),
        "stages": get_json(r, STAGES_KEY),
        "codePaths": get_json(r, CODE_KEY),
    }


def technology_catalog(idx: Index) -> list[str]:
    seen: dict[str, None] = {}
    for el in idx.elements.values():
        for t in split_tech(getattr(el, "technology", None)):
            seen[t] = None
    for r in idx.relationships.values():
        for t in split_tech(r.technology):
            seen[t] = None
        for s in get_json(r, STAGES_KEY):
            for t in s.get("technologies", []):
                seen[t] = None
    for t in SUGGESTED_TECH:
        seen.setdefault(t, None)
    return list(seen)


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
    technology: str | list[str] | None = None,
    external: bool = False,
    arch_type: str | None = None,
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
        el: Element = Person(**common, location="External" if external else None)
        ws.model.people.append(el)  # type: ignore[arg-type]
    elif kind == "softwareSystem":
        el = SoftwareSystem(**common, location="External" if external else None)
        ws.model.software_systems.append(el)  # type: ignore[arg-type]
    elif kind == "container":
        parent = idx.elements[parent_id]  # type: ignore[index]
        assert isinstance(parent, SoftwareSystem)
        el = Container(**common, technology=join_tech(technology))
        parent.containers.append(el)  # type: ignore[arg-type]
    else:
        parent = idx.elements[parent_id]  # type: ignore[index]
        assert isinstance(parent, Container)
        el = Component(**common, technology=join_tech(technology))
        parent.components.append(el)  # type: ignore[arg-type]
    if arch_type:
        _set_arch(el, arch_type)
    return new_id


def _set_arch(el: Element, arch: str | None) -> None:
    if arch and arch not in {a for a, _ in ARCH_TYPES}:
        raise ModelError(f'Unknown type "{arch}".')
    set_prop(el, ARCH_KEY, None if arch in (None, "", "box") else arch)


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
        el.technology = join_tech(patch["technology"])  # type: ignore[union-attr]
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
        set_json(el, LINKS_KEY, links)
    if "external" in patch:
        if kind not in ("person", "softwareSystem"):
            raise ModelError("Only people and software systems can be marked external.")
        el.location = "External" if patch["external"] else None  # type: ignore[union-attr]
    if "archType" in patch:
        _set_arch(el, patch["archType"])
    if "notes" in patch:
        set_prop(el, NOTES_KEY, (patch["notes"] or "").strip("\n") or None)
    if "details" in patch:
        set_json(el, DETAILS_KEY, clean_details(patch["details"]))
    if "tradeoffs" in patch:
        set_json(el, TRADEOFFS_KEY, clean_tradeoffs(patch["tradeoffs"]))
    if "usage" in patch:
        set_json(el, USAGE_KEY, clean_usage(patch["usage"]))
    if "sensitive" in patch:
        set_json(el, SENSITIVE_KEY, clean_sensitive(patch["sensitive"]))
    if "codePaths" in patch:
        set_json(el, CODE_KEY, clean_paths(patch["codePaths"]))
    if "tags" in patch:
        groups = {g.name: g for g in sidecar.tag_groups}
        for group, value in (patch["tags"] or {}).items():
            if group not in groups:
                raise ModelError(f'No tag group named "{group}".')
            if value is not None and value not in {v.name for v in groups[group].values}:
                raise ModelError(f'"{value}" is not a value of tag group "{group}".')
            set_prop(el, TAG_PREFIX + group, value)


def duplicate_element(ws: Workspace, sidecar: Sidecar, element_id: str) -> str:
    """Copy one element (not its children or connections) next to the original."""
    idx = build_index(ws)
    if element_id not in idx.elements:
        raise ModelError(f'No element with ID "{element_id}".')
    src = idx.elements[element_id]
    kind = idx.kind[element_id]
    parent = idx.parent[element_id]
    taken = sibling_names(idx, kind, parent)
    name = unique(f"{src.name} copy", taken, sep=" ")
    new_id = create_element(
        ws, kind, name, parent, src.description, getattr(src, "technology", None), getattr(src, "location", None) == "External"
    )
    new = build_index(ws).elements[new_id]
    new.url = src.url
    new.properties = dict(src.properties) if src.properties else None
    if element_id in sidecar.styles:
        sidecar.styles[new_id] = sidecar.styles[element_id].model_copy(deep=True)
    return new_id


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
    # Connector stages that linked to a deleted element keep their name but lose the link.
    for el in build_index(ws).elements.values():
        for r in el.relationships:
            stages = get_json(r, STAGES_KEY)
            if any(s.get("elementId") in gone for s in stages):
                for s in stages:
                    if s.get("elementId") in gone:
                        s.pop("elementId", None)
                set_json(r, STAGES_KEY, stages)
    return gone


# --------------------------------------------------------------------------- relationships


def create_relationship(
    ws: Workspace,
    source_id: str,
    destination_id: str,
    description: str | None = None,
    technology: str | list[str] | None = None,
    kind: str | None = None,
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
        technology=join_tech(technology),
        tags=tags_for("relationship"),
    )
    if kind:
        _set_kind(rel, kind)
    idx.elements[source_id].relationships.append(rel)
    return rel_id


def _set_kind(r: Relationship, kind: str | None) -> None:
    if kind and kind not in {k for k, _ in CONNECTOR_KINDS}:
        raise ModelError(f'Unknown connector kind "{kind}".')
    set_prop(r, KIND_KEY, kind or None)


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
        r.technology = join_tech(patch["technology"])
    if "kind" in patch:
        _set_kind(r, patch["kind"])
    if "notes" in patch:
        set_prop(r, NOTES_KEY, (patch["notes"] or "").strip("\n") or None)
    if "sensitive" in patch:
        set_json(r, SENSITIVE_KEY, clean_sensitive(patch["sensitive"]))
    if "codePaths" in patch:
        set_json(r, CODE_KEY, clean_paths(patch["codePaths"]))
    if "stages" in patch:
        set_json(r, STAGES_KEY, clean_stages(patch["stages"], idx))


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


# --------------------------------------------------------------------------- styles


_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean_style(patch: dict) -> Style:
    out: dict = {}
    for key in ("fill", "text", "stroke"):
        v = patch.get(key)
        if v:
            if not _COLOR.match(v):
                raise ModelError(f'"{v}" is not a colour like #1168bd.')
            out[key] = v.lower()
    if patch.get("strokeStyle"):
        if patch["strokeStyle"] not in ("solid", "dashed", "dotted"):
            raise ModelError("Line style must be solid, dashed or dotted.")
        out["stroke_style"] = patch["strokeStyle"]
    if patch.get("strokeWidth") not in (None, ""):
        w = float(patch["strokeWidth"])
        if not 0.5 <= w <= 10:
            raise ModelError("Line width must be between 0.5 and 10.")
        out["stroke_width"] = w
    if patch.get("fontSize") not in (None, ""):
        f = int(patch["fontSize"])
        if not 8 <= f <= 40:
            raise ModelError("Font size must be between 8 and 40.")
        out["font_size"] = f
    if patch.get("arrow"):
        if patch["arrow"] not in ("end", "start", "both", "none"):
            raise ModelError("Arrow must be end, start, both or none.")
        out["arrow"] = patch["arrow"]
    return Style(**out)


def style_target_exists(idx: Index, target: str) -> bool:
    if target in idx.elements or target in idx.relationships:
        return True
    if target.startswith("derived:") and "->" in target:
        a, b = target[len("derived:"):].split("->", 1)
        return a in idx.elements and b in idx.elements
    if target.startswith("conn:") or target.startswith("stage:"):
        return target.split(":")[1] in idx.relationships
    if target.startswith("file:"):
        return True
    return False


def set_style(ws: Workspace, sidecar: Sidecar, target: str, patch: dict | None) -> None:
    idx = build_index(ws)
    if not style_target_exists(idx, target):
        raise ModelError(f'Nothing to style with ID "{target}".')
    style = clean_style(patch or {})
    if style.model_dump(exclude_none=True):
        sidecar.styles[target] = style
    else:
        sidecar.styles.pop(target, None)


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


# --------------------------------------------------------------------------- housekeeping


def _id_still_valid(idx: Index, key: str) -> bool:
    if key in idx.elements or key in idx.relationships:
        return True
    if key.startswith("file:"):
        return True
    if key.startswith("stage:") or key.startswith("conn:"):
        return key.split(":")[1] in idx.relationships
    if key.startswith("derived:") and "->" in key:
        a, b = key[len("derived:"):].split("->", 1)
        return a in idx.elements and b in idx.elements
    return False


def prune(ws: Workspace, sidecar: Sidecar) -> None:
    """Drop sidecar entries (styles, layouts) that refer to things that no longer exist."""
    from .diagrams import key_is_valid

    idx = build_index(ws)
    sidecar.styles = {k: v for k, v in sidecar.styles.items() if _id_still_valid(idx, k)}
    layouts = {}
    for key, lay in sidecar.layouts.items():
        if not key_is_valid(ws, idx, key):
            continue
        lay.sizes = {k: v for k, v in lay.sizes.items() if _id_still_valid(idx, k)}
        lay.positions = {k: v for k, v in lay.positions.items() if _id_still_valid(idx, k)}
        lay.edges = {k: v for k, v in lay.edges.items() if _id_still_valid(idx, k)}
        layouts[key] = lay
    sidecar.layouts = layouts
