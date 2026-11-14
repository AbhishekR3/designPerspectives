"""Checks run before every save and by `dp validate`.

Structural rules mirror what structurizr-client WorkspaceUtils.loadWorkspaceFromJson rejects
(see structurizr-client/src/test/java/com/structurizr/api/WorkspaceRulesValidationTests.java,
checked 2026-11-14), so a file we write should load in Structurizr. Sidecar rules are ours.
"""

from __future__ import annotations

from collections import Counter

from .ops import TAG_PREFIX, ModelError, build_index, get_props
from .sidecar import LEVELS, Sidecar
from .workspace import VIEW_LISTS, Workspace


def errors(ws: Workspace, sidecar: Sidecar) -> list[str]:
    out: list[str] = []
    try:
        idx = build_index(ws)  # duplicate element / relationship IDs
    except ModelError as e:
        return [str(e)]

    # Names (Structurizr Model.hydrate)
    top = Counter(e.name for e in [*ws.model.people, *ws.model.software_systems])
    out += [f'A person or software system named "{n}" already exists.' for n, c in top.items() if c > 1]
    for s in ws.model.software_systems:
        for n, c in Counter(x.name for x in s.containers).items():
            if c > 1:
                out.append(f'A container named "{n}" already exists within "{s.name}".')
        for cont in s.containers:
            for n, c in Counter(x.name for x in cont.components).items():
                if c > 1:
                    out.append(f'A component named "{n}" already exists within "{cont.name}".')

    # Relationships
    pairs: Counter = Counter()
    for r in idx.relationships.values():
        for end in (r.source_id, r.destination_id):
            if end not in idx.elements:
                out.append(f'Relationship "{r.id}" points to a missing element "{end}".')
        if r.source_id not in idx.elements or r.destination_id not in idx.elements:
            continue
        pairs[(r.source_id, r.destination_id, r.description or "")] += 1
    for (a, b, d), c in pairs.items():
        if c > 1:
            out.append(
                f'A relationship with the description "{d}" already exists between '
                f'"{idx.elements[a].name}" and "{idx.elements[b].name}".'
            )

    # Views
    views = ws.views.all()
    for k, c in Counter(v.key for v in views).items():
        if c > 1:
            out.append(f"A view with the key {k} already exists.")
    # Element checks only for view types we model; deployment views hold deployment nodes.
    for v in (v for name in VIEW_LISTS for v in getattr(ws.views, name)):
        scope = v.software_system_id or v.container_id or v.element_id
        if scope and scope not in idx.elements:
            out.append(f'The view with key "{v.key}" is associated with an element (id={scope}), but that element does not exist in the model.')
        for e in v.elements:
            if e.id not in idx.elements:
                out.append(f'The view with key "{v.key}" references an element (id={e.id}), but that element does not exist in the model.')
        for r in v.relationships:
            if r.id not in idx.relationships:
                out.append(f'The view with key "{v.key}" references a relationship (id={r.id}), but that relationship does not exist in the model.')

    # Sidecar
    groups = {}
    for n, c in Counter(g.name for g in sidecar.tag_groups).items():
        if c > 1:
            out.append(f'Two tag groups are named "{n}".')
    for g in sidecar.tag_groups:
        if not g.name.strip():
            out.append("A tag group has an empty name.")
        groups[g.name] = {v.name for v in g.values}
        for n, c in Counter(v.name for v in g.values).items():
            if c > 1:
                out.append(f'Tag group "{g.name}" has the value "{n}" twice.')
    for el in idx.elements.values():
        for k, val in get_props(el).items():
            if k.startswith(TAG_PREFIX):
                group = k[len(TAG_PREFIX):]
                if group not in groups:
                    out.append(f'"{el.name}" has a value for tag group "{group}", which is not defined.')
                elif val not in groups[group]:
                    out.append(f'"{el.name}" has "{val}" for tag group "{group}", which is not one of its values.')
    for n, c in Counter(lens.id for lens in sidecar.lenses).items():
        if c > 1:
            out.append(f'Two lenses have the ID "{n}".')
    for lens in sidecar.lenses:
        if lens.id == "engineer":
            out.append('The lens ID "engineer" is reserved for the built-in Engineer lens.')
        bad = [lv for lv in lens.visible_levels if lv not in LEVELS]
        if bad:
            out.append(f'Lens "{lens.name}" has unknown levels: {", ".join(bad)}.')
        ov = lens.default_overlay
        # Default overlay: a tag group name, "@cost", "@tech", "@work:<type>" or "@char:<characteristic>".
        if ov in ("@cost", "@tech") or (ov and ov.startswith("@work:")):
            pass
        elif ov and ov.startswith("@char:"):
            if ov[6:] not in {c.name for c in sidecar.characteristics}:
                out.append(f'Lens "{lens.name}" uses characteristic "{ov[6:]}", which is not defined.')
        elif ov and ov not in groups:
            out.append(f'Lens "{lens.name}" uses tag group "{ov}", which is not defined.')
    return out
