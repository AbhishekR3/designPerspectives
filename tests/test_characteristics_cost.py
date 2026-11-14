"""Stage A3: architecture characteristics (ratings 1-5) and cost line items with roll-up."""

from __future__ import annotations

import json

from designperspectives.sidecar import DEFAULT_CHARACTERISTICS, CostSettings, Sidecar


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def element(client, el_id):
    return next(e for e in ok(client.get("/api/state"))["elements"] if e["id"] == el_id)


def test_default_characteristics_and_cost_settings(client):
    s = ok(client.get("/api/state"))
    names = [c["name"] for c in s["characteristics"]]
    assert {"Scalability", "Deployability", "Testability"} <= set(names)
    assert s["costSettings"]["currency"] == "USD"
    assert s["costSettings"]["bands"][-1]["max"] is None
    assert "characteristics" in s["sections"] and "cost" in s["sections"]


def test_rate_characteristics(client):
    ok(
        client.patch(
            "/api/elements/web-application",
            json={
                "characteristics": [
                    {"name": "Scalability", "rating": 4, "driving": True, "note": " stateless "},
                    {"name": "Testability", "rating": "2"},
                    {"name": "Security"},  # nothing set: dropped
                ]
            },
        )
    )
    el = element(client, "web-application")
    assert el["characteristics"] == [
        {"name": "Scalability", "rating": 4, "driving": True, "note": "stateless"},
        {"name": "Testability", "rating": 2},
    ]
    bad = [
        [{"name": "Scalability", "rating": 6}],
        [{"name": "Scalability", "rating": "high"}],
        [{"name": "Prettiness", "rating": 3}],
    ]
    for rows in bad:
        assert client.patch("/api/elements/web-application", json={"characteristics": rows}).status_code == 422


def test_cost_items_total_and_rollup(client):
    ok(client.patch("/api/elements/sign-in-controller", json={"cost": [{"item": "Licence", "monthly": "12.5"}]}))
    api = element(client, "api-application")
    own = sum(x["monthly"] for x in api["cost"])
    assert api["costTotal"] == own
    assert api["costRollup"] == round(own + 12.5, 2)
    system = element(client, "internet-banking-system")
    assert system["costTotal"] == 0
    assert system["costRollup"] >= api["costRollup"]
    assert client.patch("/api/elements/web-application", json={"cost": [{"item": "x", "monthly": -1}]}).status_code == 422
    assert client.patch("/api/elements/web-application", json={"cost": [{"item": "", "monthly": 5}]}).status_code == 422
    ok(client.patch("/api/elements/web-application", json={"cost": [{"item": "", "monthly": ""}]}))
    assert element(client, "web-application")["cost"] == []


def test_rename_and_remove_characteristics(client, demo_dir):
    defs = ok(client.get("/api/state"))["characteristics"]
    body = []
    for c in defs:
        if c["name"] == "Testability":
            continue  # removed
        if c["name"] == "Scalability":
            body.append({"name": "Scale", "description": c["description"], "previousName": "Scalability"})
        else:
            body.append(c)
    body.append({"name": "Observability", "description": "How well it can be monitored."})
    ok(client.put("/api/characteristics", json=body))
    api = element(client, "api-application")
    names = [r["name"] for r in api["characteristics"]]
    assert "Scale" in names and "Scalability" not in names and "Testability" not in names
    sc = json.loads((demo_dir / "architecture" / "designperspectives.json").read_text())
    assert any(c["name"] == "Observability" for c in sc["characteristics"])
    assert client.put("/api/characteristics", json=[{"name": "A"}, {"name": "A"}]).status_code == 422


def test_cost_settings(client):
    s = ok(client.get("/api/state"))["costSettings"]
    s["currency"] = "EUR"
    s["bands"][1]["max"] = 50
    ok(client.put("/api/cost-settings", json=s))
    assert ok(client.get("/api/state"))["costSettings"]["currency"] == "EUR"
    unordered = {"currency": "EUR", "bands": [{"name": "A", "max": 10, "color": "#000000"}, {"name": "B", "max": 5, "color": "#000000"}, {"name": "C", "color": "#000000"}]}
    assert client.put("/api/cost-settings", json=unordered).status_code == 422
    closed = {"currency": "EUR", "bands": [{"name": "A", "max": 10, "color": "#000000"}]}
    assert client.put("/api/cost-settings", json=closed).status_code == 422


def test_defaults_are_not_written():
    data = Sidecar().dump()
    assert "characteristics" not in data and "cost" not in data
    sc = Sidecar(characteristics=DEFAULT_CHARACTERISTICS[:2], cost=CostSettings(currency="GBP"))
    data = sc.dump()
    assert len(data["characteristics"]) == 2 and data["cost"]["currency"] == "GBP"


def test_lens_default_overlay_may_be_cost_or_characteristic(demo_ws):
    from designperspectives.sidecar import Lens
    from designperspectives.validate import errors

    ok_sc = Sidecar(lenses=[Lens(id="a", name="A", default_overlay="@cost"), Lens(id="b", name="B", default_overlay="@char:Scalability")])
    bad_sc = Sidecar(lenses=[Lens(id="c", name="C", default_overlay="@char:Nope")])
    lens_errors = lambda sc: [e for e in errors(demo_ws, sc) if "Lens" in e]  # noqa: E731
    assert lens_errors(ok_sc) == []
    assert any("Nope" in e for e in lens_errors(bad_sc))


def test_create_typed_element_with_unique_name(client):
    a = ok(client.post("/api/elements", json={"kind": "container", "parentId": "internet-banking-system", "name": "Database", "archType": "database", "uniqueName": True}))
    el = element(client, a["id"])
    assert el["name"] == "Database 2" and el["archType"] == "database"
    r = client.post("/api/elements", json={"kind": "container", "parentId": "internet-banking-system", "name": "Database"})
    assert r.status_code == 422


def test_work_items_on_elements_and_relationships(client):
    work = [
        {"type": "security", "title": "CVE in TLS library", "url": "https://example.com/cve", "status": "open", "severity": "high"},
        {"type": "pr", "title": "", "url": "https://example.com/pr/12", "status": "done"},
        {"type": "backlog", "title": "", "url": ""},  # empty: dropped
    ]
    ok(client.patch("/api/elements/web-application", json={"work": work}))
    el = element(client, "web-application")
    assert el["work"][0]["severity"] == "high" and el["work"][1]["title"] == "https://example.com/pr/12"
    assert len(el["work"]) == 2
    for bad in (
        [{"type": "epic", "title": "x"}],
        [{"type": "pr", "title": "x", "status": "merged"}],
        [{"type": "pr", "title": "x", "url": "javascript:alert(1)"}],
        [{"type": "pr", "title": "x", "severity": "urgent"}],
    ):
        assert client.patch("/api/elements/web-application", json={"work": bad}).status_code == 422
    rel = ok(client.get("/api/state"))["relationships"][0]
    ok(client.patch(f"/api/relationships/{rel['id']}", json={"work": [{"type": "update", "title": "Move to TLS 1.3"}]}))
    rel2 = next(r for r in ok(client.get("/api/state"))["relationships"] if r["id"] == rel["id"])
    assert rel2["work"] == [{"type": "update", "title": "Move to TLS 1.3", "status": "open"}]
    assert {t["id"] for t in ok(client.get("/api/state"))["enums"]["workTypes"]} == {"security", "pr", "issue", "backlog", "update"}
