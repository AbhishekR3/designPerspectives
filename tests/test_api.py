"""The owner's Stage A checklist (steps 2-9), exercised through the HTTP API."""

import json
import subprocess

from fastapi.testclient import TestClient

from designperspectives.server import create_app


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_state(client):
    s = ok(client.get("/api/state"))
    assert s["workspace"]["name"] == "Big Bank plc"
    assert [l["id"] for l in s["lenses"]] == ["engineer", "security-review", "product-owner"]
    assert s["loadErrors"] == []


def test_step2_new_system_with_three_containers(client):
    sid = ok(client.post("/api/elements", json={"kind": "softwareSystem", "name": "Loans", "diagramKey": "landscape", "position": {"x": 10, "y": 20}}))["id"]
    ids = [ok(client.post("/api/elements", json={"kind": "container", "name": n, "parentId": sid}))["id"] for n in ("UI", "API", "DB")]
    ok(client.post("/api/relationships", json={"sourceId": ids[0], "destinationId": ids[1], "description": "Calls", "technology": "HTTPS"}))
    ok(client.post("/api/relationships", json={"sourceId": ids[1], "destinationId": ids[2], "description": "Reads"}))
    d = ok(client.get(f"/api/diagrams/containers-{sid}"))
    assert sorted(n["name"] for n in d["nodes"]) == ["API", "DB", "UI"]
    assert len(d["edges"]) == 2
    land = ok(client.get("/api/diagrams/landscape"))
    loans = next(n for n in land["nodes"] if n["id"] == sid)
    assert loans["position"] == {"x": 10, "y": 20}


def test_step3_drill_and_breadcrumb(client):
    land = ok(client.get("/api/diagrams/landscape"))
    ibs = next(n for n in land["nodes"] if n["name"] == "Internet Banking System")
    cont = ok(client.get(f"/api/diagrams/{ibs['drillKey']}"))
    api = next(n for n in cont["nodes"] if n["name"] == "API Application")
    comp = ok(client.get(f"/api/diagrams/{api['drillKey']}"))
    assert [c["label"] for c in comp["breadcrumb"]] == ["Landscape", "Internet Banking System", "Internet Banking System", "API Application"]


def test_step4_rename_everywhere(client):
    ok(client.patch("/api/elements/e-mail-system", json={"name": "Mail Gateway"}))
    for key in ["landscape", "context-internet-banking-system", "containers-internet-banking-system", "components-api-application"]:
        names = [n["name"] for n in ok(client.get(f"/api/diagrams/{key}"))["nodes"]]
        assert "Mail Gateway" in names and "E-mail System" not in names


def test_step5_connections_in_state(client):
    s = ok(client.get("/api/state"))
    incoming = [r for r in s["relationships"] if r["destinationId"] == "security-component"]
    outgoing = [r for r in s["relationships"] if r["sourceId"] == "security-component"]
    assert len(incoming) == 2 and len(outgoing) == 1


def test_step6_tag_group_and_overlay_data(client):
    ok(client.post("/api/tag-groups", json={"name": "Priority", "values": [
        {"name": "High", "color": "#d62728"}, {"name": "Medium", "color": "#ff7f0e"}, {"name": "Low", "color": "#2ca02c"}]}))
    for e, v in [("api-application", "High"), ("database", "Medium"), ("mobile-app", "Low")]:
        ok(client.patch(f"/api/elements/{e}", json={"tags": {"Priority": v}}))
    d = ok(client.get("/api/diagrams/containers-internet-banking-system"))
    tags = {n["id"]: n["tags"].get("Priority") for n in d["nodes"]}
    assert tags["api-application"] == "High" and tags["web-application"] is None
    # Rename a value: elements follow. Remove a value: elements lose it.
    ok(client.put("/api/tag-groups/Priority", json={"name": "Priority level", "values": [
        {"name": "Severe", "color": "#d62728", "previousName": "High"}, {"name": "Low", "color": "#2ca02c", "previousName": "Low"}]}))
    els = {e["id"]: e["tags"] for e in ok(client.get("/api/state"))["elements"]}
    assert els["api-application"]["Priority level"] == "Severe"
    assert "Priority level" not in els["database"]
    r = client.patch("/api/elements/database", json={"tags": {"Priority level": "Medium"}})
    assert r.status_code == 422


def test_step7_five_step_flow(client):
    key = ok(client.post("/api/flows", json={"title": "Pay a bill"}))["key"]
    rels = ["personal-banking-customer--single-page-application", "single-page-application--accounts-summary-controller",
            "accounts-summary-controller--mainframe-banking-system-facade", "mainframe-banking-system-facade--mainframe-banking-system",
            "single-page-application--accounts-summary-controller"]
    steps = [{"relationshipId": r} for r in rels]
    steps[-1]["response"] = True
    ok(client.put(f"/api/flows/{key}", json={"steps": steps}))
    d = ok(client.get(f"/api/diagrams/{key}"))
    assert d["level"] == "flow" and len(d["flow"]["steps"]) == 5


def test_step8_lenses(client):
    lid = ok(client.post("/api/lenses", json={"name": "Business", "visibleLevels": ["landscape", "context"], "showTechnology": False}))["id"]
    lenses = ok(client.get("/api/state"))["lenses"]
    assert [l["id"] for l in lenses][0] == "engineer" and [l["id"] for l in lenses][-1] == lid
    assert client.put("/api/lenses/engineer", json={"name": "E"}).status_code == 403
    assert client.post("/api/lenses", json={"name": "Business"}).status_code == 422


def test_step9_persisted_and_readable(demo_dir):
    c1 = TestClient(create_app(demo_dir))
    ok(c1.post("/api/elements", json={"kind": "person", "name": "Auditor"}))
    c2 = TestClient(create_app(demo_dir))  # "close and reopen"
    names = [e["name"] for e in ok(c2.get("/api/state"))["elements"]]
    assert "Auditor" in names
    data = json.loads((demo_dir / "architecture" / "workspace.json").read_text())
    assert any(p["id"] == "auditor" for p in data["model"]["people"])


def test_invalid_edit_is_refused_and_not_written(client, demo_dir):
    path = demo_dir / "architecture" / "workspace.json"
    before = path.read_text()
    r = client.post("/api/elements", json={"kind": "person", "name": "ATM"})  # clashes with system "ATM"
    assert r.status_code == 422 and "already used" in r.json()["detail"]
    assert path.read_text() == before


def test_external_file_change_is_picked_up(client, demo_dir):
    path = demo_dir / "architecture" / "workspace.json"
    data = json.loads(path.read_text())
    data["name"] = "Changed on disk"
    path.write_text(json.dumps(data, indent=2))
    assert ok(client.get("/api/state"))["workspace"]["name"] == "Changed on disk"


def test_delete_element_and_relationship(client):
    ok(client.delete("/api/relationships/security-component--database"))
    ok(client.delete("/api/elements/api-application"))
    s = ok(client.get("/api/state"))
    ids = {e["id"] for e in s["elements"]}
    assert "api-application" not in ids and "sign-in-controller" not in ids
    assert client.get("/api/diagrams/components-api-application").status_code == 404
    sign_in = next(f for f in s["flows"] if f["title"] == "Sign in")
    assert sign_in["steps"] == []


def test_cli_validate(demo_dir):
    r = subprocess.run(["dp", "validate", str(demo_dir)], capture_output=True, text=True)
    assert r.returncode == 0 and r.stdout.strip() == "OK"
