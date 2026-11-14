"""Stage A2: styles, layouts, tags, notes/tradeoffs/usage/sensitive, connectors, code, undo."""

from __future__ import annotations

import pytest

from designperspectives import code, diagrams
from designperspectives.ops import build_index
from designperspectives.sidecar import Sidecar


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_technology_is_tags(client):
    el = next(e for e in ok(client.get("/api/state"))["elements"] if e["id"] == "single-page-application")
    assert el["technologies"] == ["JavaScript", "Angular"]
    ok(client.patch("/api/elements/single-page-application", json={"technology": ["TypeScript", "Angular", "Angular"]}))
    el = next(e for e in ok(client.get("/api/state"))["elements"] if e["id"] == "single-page-application")
    assert el["technologies"] == ["TypeScript", "Angular"] and el["technology"] == "TypeScript, Angular"
    assert "Redis" in ok(client.get("/api/state"))["technologies"]


def test_notes_tradeoffs_usage_sensitive(client):
    patch = {
        "notes": "free text\nsecond line",
        "tradeoffs": [{"kind": "risk", "text": "SPOF"}, {"kind": "cost", "text": ""}],
        "usage": [{"users": "Customers", "frequency": "hourly"}],
        "sensitive": [{"item": "PAN", "level": "restricted"}, {"item": "Logs", "level": "internal"}],
    }
    ok(client.patch("/api/elements/web-application", json=patch))
    el = next(e for e in ok(client.get("/api/state"))["elements"] if e["id"] == "web-application")
    assert el["notes"] == "free text\nsecond line"
    assert el["tradeoffs"] == [{"kind": "risk", "text": "SPOF"}]  # empty rows dropped
    assert el["usage"] == [{"users": "Customers", "frequency": "hourly"}]
    assert el["sensitivityLevel"] == "restricted"
    assert client.patch("/api/elements/web-application", json={"usage": [{"users": "x", "frequency": "yearly"}]}).status_code == 422
    assert client.patch("/api/elements/web-application", json={"sensitive": [{"item": "x", "level": "secret"}]}).status_code == 422


def test_arch_type_and_connector_kind(client):
    ok(client.patch("/api/elements/database", json={"archType": "storage"}))
    assert client.patch("/api/elements/database", json={"archType": "banana"}).status_code == 422
    rid = ok(client.post("/api/relationships", json={"sourceId": "web-application", "destinationId": "database", "kind": "db-connection", "technology": ["JDBC"]}))["id"]
    rel = next(r for r in ok(client.get("/api/state"))["relationships"] if r["id"] == rid)
    assert rel["kind"] == "db-connection" and rel["technologies"] == ["JDBC"]
    assert client.patch(f"/api/relationships/{rid}", json={"kind": "carrier-pigeon"}).status_code == 422


def test_stages_and_connector_diagram(client):
    d = ok(client.get("/api/diagrams/connector-event-stream--data-warehouse"))
    assert [n["name"] for n in d["nodes"]] == ["Event Stream", "Consume events", "Mask PII", "Load to warehouse", "Data Warehouse"]
    assert len(d["edges"]) == 4 and d["c4"] == "C3"
    mask = next(n for n in d["nodes"] if n["name"] == "Mask PII")
    assert mask["drillKey"] == "code-pii-masker"
    r = client.patch("/api/relationships/event-stream--data-warehouse", json={"stages": [{"name": "X", "elementId": "nope"}]})
    assert r.status_code == 422
    # deleting an implementing element keeps the stage but drops the link
    ok(client.delete("/api/elements/pii-masker"))
    stages = next(r for r in ok(client.get("/api/state"))["relationships"] if r["id"] == "event-stream--data-warehouse")["stages"]
    assert len(stages) == 3 and all(s.get("elementId") != "pii-masker" for s in stages)


def test_derived_edge_points_to_where_it_is_drawn(client):
    d = ok(client.get("/api/diagrams/landscape"))
    derived = [e for e in d["edges"] if e["derived"]]
    assert derived and any(t["key"].startswith(("containers-", "components-", "context-")) for e in derived for t in e["drillTargets"])
    explicit = [e for e in d["edges"] if not e["derived"]]
    assert all(e["detailKey"] == f"connector-{e['id']}" for e in explicit)


def test_diagram_tree_levels_and_indent(client):
    tree = ok(client.get("/api/state"))["diagrams"]
    by = {d["key"]: d for d in tree}
    assert by["landscape"]["c4"] == "C1" and by["landscape"]["depth"] == 0
    assert by["context-internet-banking-system"]["depth"] == 1
    assert by["containers-internet-banking-system"]["c4"] == "C2" and by["containers-internet-banking-system"]["depth"] == 2
    assert by["components-api-application"]["c4"] == "C3" and by["components-api-application"]["depth"] == 3
    assert by["code-sign-in-controller"]["c4"] == "C4" and by["code-sign-in-controller"]["depth"] == 4


def test_styles_validate_and_prune(client):
    ok(client.put("/api/styles/atm", json={"fill": "#ff0000", "strokeStyle": "dotted", "fontSize": 18}))
    n = next(n for n in ok(client.get("/api/diagrams/landscape"))["nodes"] if n["id"] == "atm")
    assert n["style"] == {"fill": "#ff0000", "strokeStyle": "dotted", "fontSize": 18}
    assert client.put("/api/styles/atm", json={"fill": "red"}).status_code == 422
    assert client.put("/api/styles/nothing", json={"fill": "#ffffff"}).status_code == 422
    ok(client.delete("/api/elements/atm"))
    assert "atm" not in ok(client.get("/api/state"))["styles"]


def test_layout_sizes_and_edge_geometry(client, demo_dir):
    rid = "atm--mainframe-banking-system"
    ok(client.put("/api/diagrams/landscape/layout", json={
        "sizes": {"atm": {"w": 300, "h": 90}},
        "edges": {rid: {"sourceAnchor": {"x": 0.5, "y": 1}, "targetAnchor": {"x": 0, "y": 0.5}, "control": {"x": 5, "y": 6}, "labelT": 0.3, "labelOffset": -12, "routing": "orthogonal"}},
    }))
    d = ok(client.get("/api/diagrams/landscape"))
    assert next(n for n in d["nodes"] if n["id"] == "atm")["size"] == {"w": 300, "h": 90}
    e = next(e for e in d["edges"] if e["id"] == rid)
    assert e["layout"]["routing"] == "orthogonal" and e["layout"]["labelT"] == 0.3
    # survives reopening the files
    from fastapi.testclient import TestClient
    from designperspectives.server import create_app

    d2 = ok(TestClient(create_app(demo_dir)).get("/api/diagrams/landscape"))
    assert next(n for n in d2["nodes"] if n["id"] == "atm")["size"] == {"w": 300, "h": 90}
    assert client.put("/api/diagrams/nope/layout", json={}).status_code == 404


def test_code_diagram_imports_and_file_api(client, demo_dir):
    d = ok(client.get("/api/diagrams/code-sign-in-controller"))
    assert [n["name"] for n in d["nodes"]] == ["sign_in.py", "security.py", "store.py"]
    pairs = {(e["source"].split("/")[-1], e["target"].split("/")[-1]) for e in d["edges"]}
    assert pairs == {("sign_in.py", "security.py"), ("security.py", "store.py")}
    f = ok(client.get("/api/code/file", params={"path": "sample_code/api/store.py"}))
    ok(client.put("/api/code/file", json={"path": "sample_code/api/store.py", "content": f["content"] + "\n# x\n", "mtime": f["mtime"]}))
    assert (demo_dir / "sample_code/api/store.py").read_text().endswith("# x\n")
    # a stale mtime is refused
    assert client.put("/api/code/file", json={"path": "sample_code/api/store.py", "content": "", "mtime": f["mtime"]}).status_code == 422


@pytest.mark.parametrize("bad", ["../secret.txt", "/etc/passwd", "sample_code/../../x"])
def test_code_paths_cannot_escape_root(client, bad):
    assert client.get("/api/code/file", params={"path": bad}).status_code == 422
    assert client.patch("/api/elements/sign-in-controller", json={"codePaths": [bad]}).status_code == 422


def test_scanner_resolves_js_and_relative_imports(tmp_path):
    (tmp_path / "a.ts").write_text("import { b } from './b';\nconst c = require('./lib/c');\nimport x from 'react';")
    (tmp_path / "b.ts").write_text("export const b = 1;")
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib/c.js").write_text("module.exports = 1")
    (tmp_path / "p.py").write_text("from . import q\nimport q2")
    (tmp_path / "q.py").write_text("")
    (tmp_path / "q2.py").write_text("")
    files = ["a.ts", "b.ts", "lib/c.js", "p.py", "q.py", "q2.py"]
    assert set(code.scan_imports(tmp_path, files)) == {("a.ts", "b.ts"), ("a.ts", "lib/c.js"), ("p.py", "q.py"), ("p.py", "q2.py")}


def test_undo_redo(client):
    n = len(ok(client.get("/api/state"))["elements"])
    ok(client.post("/api/elements", json={"kind": "person", "name": "Auditor"}))
    s = ok(client.get("/api/state"))
    assert len(s["elements"]) == n + 1 and s["canUndo"] and not s["canRedo"]
    assert ok(client.post("/api/undo"))["ok"]
    s = ok(client.get("/api/state"))
    assert len(s["elements"]) == n and s["canRedo"]
    assert ok(client.post("/api/redo"))["ok"]
    assert len(ok(client.get("/api/state"))["elements"]) == n + 1
    assert ok(client.post("/api/redo"))["ok"] is False


def test_duplicate_element(client):
    new = ok(client.post("/api/elements/api-application/duplicate"))["id"]
    s = ok(client.get("/api/state"))
    el = next(e for e in s["elements"] if e["id"] == new)
    assert el["name"] == "API Application copy" and el["technologies"] == ["Java", "Spring MVC"] and el["notes"]


def test_lens_sections_roundtrip(client):
    lid = ok(client.post("/api/lenses", json={"name": "Lean", "visibleSections": ["notes"]}))["id"]
    lens = next(l for l in ok(client.get("/api/state"))["lenses"] if l["id"] == lid)
    assert lens["visibleSections"] == ["notes"]


def test_example_tag_groups_in_demo(client):
    groups = {g["name"]: [v["name"] for v in g["values"]] for g in ok(client.get("/api/state"))["tagGroups"]}
    assert groups["Risk"] == ["Low", "Medium", "High"] and groups["Lifecycle"] == ["Planned", "Live", "Deprecated"]


def test_sidecar_dump_omits_empty(demo_ws):
    sc = Sidecar()
    assert sc.dump() == {"version": 1, "tagGroups": [], "lenses": []}
    assert diagrams.parse_key("connector-x--y").level == "connector"
    assert build_index(demo_ws).kind["atm"] == "softwareSystem"
