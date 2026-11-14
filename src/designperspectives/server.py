"""Local web server: a JSON API over the model files, plus the built browser UI."""

from __future__ import annotations

from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from . import code as codemod
from . import diagrams, flows, ops
from .ops import ModelError, build_index, element_summary, relationship_summary, slugify, unique
from .sidecar import BUILTIN_LENSES, SECTIONS, DiagramLayout, EdgeLayout, Lens, Point, Size, Sidecar, TagGroup, TagValue
from .store import Project, static_dir
from .workspace import Workspace


class _In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Position(_In):
    x: float
    y: float


class NewElement(_In):
    kind: str
    name: str | None = None
    parent_id: str | None = None
    description: str | None = None
    technology: str | list[str] | None = None
    external: bool = False
    arch_type: str | None = None
    diagram_key: str | None = None
    position: Position | None = None


class NewRelationship(_In):
    source_id: str
    destination_id: str
    description: str | None = None
    technology: str | list[str] | None = None
    kind: str | None = None


class TagValueIn(_In):
    name: str
    color: str
    previous_name: str | None = None


class TagGroupIn(_In):
    name: str
    values: list[TagValueIn] = []


class LensIn(_In):
    name: str
    visible_levels: list[str] = ["landscape", "context", "container", "component"]
    default_overlay: str | None = None
    hidden_tag_groups: list[str] = []
    show_technology: bool = True
    show_descriptions: bool = True
    visible_sections: list[str] = list(SECTIONS)


class NewFlow(_In):
    title: str
    description: str | None = None


def state(project: Project) -> dict:
    ws, sc = project.workspace, project.sidecar
    idx = build_index(ws)
    lenses = [lens.model_dump(by_alias=True) for lens in [*BUILTIN_LENSES, *sc.lenses]]
    return {
        "workspace": {"name": ws.name, "description": ws.description or ""},
        "root": str(project.root),
        "elements": [element_summary(idx, e) for e in idx.elements],
        "relationships": [relationship_summary(r) for r in idx.relationships.values()],
        "diagrams": diagrams.diagram_list(ws),
        "tagGroups": [g.model_dump(by_alias=True) for g in sc.tag_groups],
        "lenses": lenses,
        "flows": flows.list_flows(ws),
        "loadErrors": project.load_errors,
        "enums": ops.ENUMS,
        "technologies": ops.technology_catalog(idx),
        "styles": {k: v.model_dump(by_alias=True, exclude_none=True) for k, v in sc.styles.items()},
        "sections": list(SECTIONS),
        "canUndo": bool(project.undo_stack),
        "canRedo": bool(project.redo_stack),
        "codeRoot": str(project.code_root),
    }


def create_app(root: Path, code_root: Path | None = None) -> FastAPI:
    project = Project(root, code_root)
    app = FastAPI(title="designPerspectives", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.project = project

    @app.exception_handler(ModelError)
    async def model_error(_: Request, exc: ModelError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    def edit(fn):
        return project.edit(fn)

    # ------------------------------------------------------------ read

    @app.get("/api/state")
    def get_state():
        project.reload_if_changed()
        return state(project)

    @app.get("/api/diagrams/{key}")
    def get_diagram(key: str):
        project.reload_if_changed()
        d = diagrams.diagram(project.workspace, key, project.sidecar, project.code_root) or flows.flow_diagram(
            project.workspace, key, project.sidecar
        )
        if d is None:
            raise HTTPException(404, f"No diagram {key}")
        return d

    @app.put("/api/diagrams/{key}/positions")
    def put_positions(key: str, positions: dict[str, Position] = Body(..., embed=True)):
        def fn(ws: Workspace, _: Sidecar):
            try:
                diagrams.set_positions(ws, key, {k: v.model_dump() for k, v in positions.items()})
            except KeyError:
                raise HTTPException(404, f"No diagram {key}")

        edit(fn)
        return {"ok": True}

    # ------------------------------------------------------------ workspace

    @app.patch("/api/workspace")
    def patch_workspace(patch: dict = Body(...)):
        def fn(ws: Workspace, _: Sidecar):
            if "name" in patch:
                name = (patch["name"] or "").strip()
                if not name:
                    raise ModelError("The workspace needs a name.")
                ws.name = name
            if "description" in patch:
                ws.description = patch["description"] or None

        edit(fn)
        return {"ok": True}

    # ------------------------------------------------------------ elements

    @app.post("/api/elements")
    def post_element(body: NewElement):
        def fn(ws: Workspace, _: Sidecar):
            new_id = ops.create_element(
                ws, body.kind, body.name, body.parent_id, body.description, body.technology, body.external, body.arch_type
            )
            if body.diagram_key and body.position:
                diagrams.set_positions(ws, body.diagram_key, {new_id: body.position.model_dump()})
            return new_id

        return {"id": edit(fn)}

    @app.patch("/api/elements/{element_id}")
    def patch_element(element_id: str, patch: dict = Body(...)):
        edit(lambda ws, sc: ops.update_element(ws, sc, element_id, patch))
        return {"ok": True}

    @app.delete("/api/elements/{element_id}")
    def delete_element(element_id: str):
        gone = edit(lambda ws, _: ops.delete_element(ws, element_id))
        return {"deleted": sorted(gone)}

    # ------------------------------------------------------------ relationships

    @app.post("/api/relationships")
    def post_relationship(body: NewRelationship):
        rid = edit(
            lambda ws, _: ops.create_relationship(
                ws, body.source_id, body.destination_id, body.description, body.technology, body.kind
            )
        )
        return {"id": rid}

    @app.patch("/api/relationships/{rel_id}")
    def patch_relationship(rel_id: str, patch: dict = Body(...)):
        edit(lambda ws, _: ops.update_relationship(ws, rel_id, patch))
        return {"ok": True}

    @app.delete("/api/relationships/{rel_id}")
    def delete_relationship(rel_id: str):
        edit(lambda ws, _: ops.delete_relationship(ws, rel_id))
        return {"ok": True}

    # ------------------------------------------------------------ tag groups

    def _group_values(body: TagGroupIn) -> list[TagValue]:
        return [TagValue(name=v.name.strip(), color=v.color) for v in body.values if v.name.strip()]

    @app.post("/api/tag-groups")
    def post_tag_group(body: TagGroupIn):
        def fn(_: Workspace, sc: Sidecar):
            name = body.name.strip()
            if not name:
                raise ModelError("A tag group needs a name.")
            if any(g.name == name for g in sc.tag_groups):
                raise ModelError(f'A tag group named "{name}" already exists.')
            sc.tag_groups.append(TagGroup(name=name, values=_group_values(body)))

        edit(fn)
        return {"ok": True}

    @app.put("/api/tag-groups/{name}")
    def put_tag_group(name: str, body: TagGroupIn):
        def fn(ws: Workspace, sc: Sidecar):
            group = next((g for g in sc.tag_groups if g.name == name), None)
            if group is None:
                raise ModelError(f'No tag group named "{name}".')
            new_name = body.name.strip()
            if not new_name:
                raise ModelError("A tag group needs a name.")
            if new_name != name:
                if any(g.name == new_name for g in sc.tag_groups):
                    raise ModelError(f'A tag group named "{new_name}" already exists.')
                ops.rename_tag_group_everywhere(ws, sc, name, new_name)
            values = _group_values(body)
            renames = {
                v.previous_name: v.name.strip()
                for v in body.values
                if v.previous_name and v.name.strip() and v.previous_name != v.name.strip()
            }
            ops.rewrite_tag_values(ws, new_name, renames, {v.name for v in values})
            group.name = new_name
            group.values = values

        edit(fn)
        return {"ok": True}

    @app.delete("/api/tag-groups/{name}")
    def delete_tag_group(name: str):
        def fn(ws: Workspace, sc: Sidecar):
            if not any(g.name == name for g in sc.tag_groups):
                raise ModelError(f'No tag group named "{name}".')
            ops.remove_tag_group_everywhere(ws, sc, name)
            sc.tag_groups = [g for g in sc.tag_groups if g.name != name]

        edit(fn)
        return {"ok": True}

    # ------------------------------------------------------------ lenses

    def _lens(body: LensIn, lens_id: str) -> Lens:
        name = body.name.strip()
        if not name:
            raise ModelError("A lens needs a name.")
        if not body.visible_levels:
            raise ModelError("A lens must show at least one level.")
        return Lens(
            id=lens_id,
            name=name,
            visible_levels=body.visible_levels,  # type: ignore[arg-type]
            default_overlay=body.default_overlay or None,
            hidden_tag_groups=body.hidden_tag_groups,
            show_technology=body.show_technology,
            show_descriptions=body.show_descriptions,
            visible_sections=body.visible_sections,
        )

    @app.post("/api/lenses")
    def post_lens(body: LensIn):
        def fn(_: Workspace, sc: Sidecar):
            taken = {lens.id for lens in sc.lenses} | {b.id for b in BUILTIN_LENSES}
            lens_id = unique(slugify(body.name), taken)
            if any(lens.name == body.name.strip() for lens in [*BUILTIN_LENSES, *sc.lenses]):
                raise ModelError(f'A lens named "{body.name.strip()}" already exists.')
            sc.lenses.append(_lens(body, lens_id))
            return lens_id

        return {"id": edit(fn)}

    @app.put("/api/lenses/{lens_id}")
    def put_lens(lens_id: str, body: LensIn):
        if lens_id in {b.id for b in BUILTIN_LENSES}:
            raise HTTPException(403, "Built-in lenses cannot be changed. Duplicate it instead.")

        def fn(_: Workspace, sc: Sidecar):
            for i, lens in enumerate(sc.lenses):
                if lens.id == lens_id:
                    if any(o.name == body.name.strip() and o.id != lens_id for o in [*BUILTIN_LENSES, *sc.lenses]):
                        raise ModelError(f'A lens named "{body.name.strip()}" already exists.')
                    sc.lenses[i] = _lens(body, lens_id)
                    return
            raise ModelError(f'No lens with ID "{lens_id}".')

        edit(fn)
        return {"ok": True}

    @app.delete("/api/lenses/{lens_id}")
    def delete_lens(lens_id: str):
        if lens_id in {b.id for b in BUILTIN_LENSES}:
            raise HTTPException(403, "Built-in lenses cannot be deleted.")

        def fn(_: Workspace, sc: Sidecar):
            if not any(lens.id == lens_id for lens in sc.lenses):
                raise ModelError(f'No lens with ID "{lens_id}".')
            sc.lenses = [lens for lens in sc.lenses if lens.id != lens_id]

        edit(fn)
        return {"ok": True}

    # ------------------------------------------------------------ layout, styles, history

    @app.put("/api/diagrams/{key}/layout")
    def put_layout(key: str, patch: dict = Body(...)):
        """Merge sizes / edge geometry / positions (connector and code diagrams) into the sidecar.
        A null value removes that entry."""

        def fn(ws: Workspace, sc: Sidecar):
            if not diagrams.key_is_valid(ws, build_index(ws), key):
                raise HTTPException(404, f"No diagram {key}")
            lay = sc.layouts.setdefault(key, DiagramLayout())
            for eid, v in (patch.get("sizes") or {}).items():
                if v is None:
                    lay.sizes.pop(eid, None)
                else:
                    lay.sizes[eid] = Size(w=max(80, float(v["w"])), h=max(50, float(v["h"])))
            for eid, v in (patch.get("edges") or {}).items():
                if v is None:
                    lay.edges.pop(eid, None)
                else:
                    lay.edges[eid] = EdgeLayout.model_validate(v)
            for eid, v in (patch.get("positions") or {}).items():
                if v is None:
                    lay.positions.pop(eid, None)
                else:
                    lay.positions[eid] = Point(x=float(v["x"]), y=float(v["y"]))

        edit(fn)
        return {"ok": True}

    @app.put("/api/styles/{target:path}")
    def put_style(target: str, patch: dict | None = Body(None)):
        edit(lambda ws, sc: ops.set_style(ws, sc, target, patch))
        return {"ok": True}

    @app.post("/api/elements/{element_id}/duplicate")
    def duplicate(element_id: str):
        return {"id": edit(lambda ws, sc: ops.duplicate_element(ws, sc, element_id))}

    @app.post("/api/undo")
    def undo():
        return {"ok": project.undo()}

    @app.post("/api/redo")
    def redo():
        return {"ok": project.redo()}

    # ------------------------------------------------------------ code

    @app.get("/api/code/tree")
    def code_tree(path: str = ""):
        return {"entries": codemod.list_tree(project.code_root, path)}

    @app.get("/api/code/file")
    def code_read(path: str):
        return codemod.read_file(project.code_root, path)

    @app.put("/api/code/file")
    def code_write(body: dict = Body(...)):
        return codemod.write_file(project.code_root, body.get("path", ""), body.get("content", ""), body.get("mtime"))

    # ------------------------------------------------------------ flows

    @app.post("/api/flows")
    def post_flow(body: NewFlow):
        return {"key": edit(lambda ws, _: flows.create_flow(ws, body.title, body.description or ""))}

    @app.put("/api/flows/{key}")
    def put_flow(key: str, patch: dict = Body(...)):
        edit(lambda ws, _: flows.update_flow(ws, key, patch))
        return {"ok": True}

    @app.delete("/api/flows/{key}")
    def delete_flow(key: str):
        edit(lambda ws, _: flows.delete_flow(ws, key))
        return {"ok": True}

    # ------------------------------------------------------------ UI

    ui = static_dir()
    if ui is not None:
        app.mount("/assets", StaticFiles(directory=ui / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def index(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            f = (ui / path).resolve()
            if path and f.is_file() and ui.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(ui / "index.html")
    else:

        @app.get("/", include_in_schema=False)
        def no_ui():
            return JSONResponse(
                {"detail": "The browser UI is not built. Run `npm ci && npm run build` in ui/, or use the API at /api/docs."}
            )

    return app
