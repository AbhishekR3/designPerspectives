"""What each level shows, computed from the demo model."""

from designperspectives import diagrams, ops
from designperspectives.sidecar import Sidecar


def names(d):
    return sorted(n["name"] for n in d["nodes"])


def test_landscape_shows_people_and_systems(demo_ws):
    d = diagrams.diagram(demo_ws, "landscape")
    assert len(d["nodes"]) == 7
    assert all(n["kind"] in ("person", "softwareSystem") for n in d["nodes"])


def test_context_shows_system_and_neighbours(demo_ws):
    d = diagrams.diagram(demo_ws, "context-internet-banking-system")
    assert names(d) == ["E-mail System", "Internet Banking System", "Mainframe Banking System", "Personal Banking Customer"]


def test_container_view_includes_derived_edges(demo_ws):
    d = diagrams.diagram(demo_ws, "containers-internet-banking-system")
    assert d["boundary"]["name"] == "Internet Banking System"
    in_scope = sorted(n["name"] for n in d["nodes"] if n["inScope"])
    assert in_scope == ["API Application", "Database", "Mobile App", "Single-Page Application", "Web Application"]
    edges = {(e["source"], e["target"]): e for e in d["edges"]}
    # API Application -> Database exists only via Security Component -> Database.
    e = edges[("api-application", "database")]
    assert e["derived"] and e["relationshipIds"] == ["security-component--database"]
    assert e["description"] == "Reads from and writes to"
    # Explicit customer -> web application stays explicit.
    assert not edges[("personal-banking-customer", "web-application")]["derived"]
    # The system itself is the boundary, not a node.
    assert "internet-banking-system" not in {n["id"] for n in d["nodes"]}


def test_component_view_maps_outside_elements(demo_ws):
    d = diagrams.diagram(demo_ws, "components-api-application")
    outside = sorted(n["name"] for n in d["nodes"] if not n["inScope"])
    assert outside == ["Database", "E-mail System", "Mainframe Banking System", "Mobile App", "Single-Page Application"]


def test_explicit_relationship_suppresses_derived(demo_ws):
    d = diagrams.diagram(demo_ws, "landscape")
    pairs = [(e["source"], e["target"]) for e in d["edges"]]
    assert pairs.count(("personal-banking-customer", "internet-banking-system")) == 1


def test_rename_shows_in_every_diagram(demo_ws):
    ops.update_element(demo_ws, Sidecar(), "mainframe-banking-system", {"name": "Core Banking"})
    for key in ["landscape", "context-internet-banking-system", "containers-internet-banking-system", "components-api-application"]:
        assert "Core Banking" in names(diagrams.diagram(demo_ws, key)), key


def test_breadcrumb(demo_ws):
    d = diagrams.diagram(demo_ws, "components-api-application")
    assert [c["key"] for c in d["breadcrumb"]] == ["landscape", "containers-internet-banking-system", "components-api-application"]


def test_drill_keys(demo_ws):
    d = diagrams.diagram(demo_ws, "landscape")
    by = {n["id"]: n["drillKey"] for n in d["nodes"]}
    assert by["internet-banking-system"] == "containers-internet-banking-system"
    assert by["personal-banking-customer"] is None


def test_positions_are_stored_in_structurizr_units(demo_ws):
    diagrams.set_positions(demo_ws, "landscape", {"atm": {"x": 100, "y": 50.4}})
    v = diagrams.find_view(demo_ws, "landscape")
    ev = next(e for e in v.elements if e.id == "atm")
    assert (ev.x, ev.y) == (200, 101)
    pos = {n["id"]: n["position"] for n in diagrams.diagram(demo_ws, "landscape")["nodes"]}
    assert pos["atm"] == {"x": 100, "y": 50.5}


def test_opening_an_unlisted_diagram_creates_its_view(demo_ws):
    assert diagrams.find_view(demo_ws, "containers-atm") is None
    diagrams.set_positions(demo_ws, "containers-atm", {})
    assert diagrams.find_view(demo_ws, "containers-atm") is not None
    assert "containers-atm" in [d["key"] for d in diagrams.diagram_list(demo_ws)]


def test_sync_views_lists_shown_elements(demo_ws):
    s = ops.create_element(demo_ws, "softwareSystem", "Fraud Check")
    ops.create_relationship(demo_ws, "api-application", s, "Checks payments with")
    diagrams.sync_views(demo_ws)
    v = diagrams.find_view(demo_ws, "containers-internet-banking-system")
    assert "fraud-check" in [e.id for e in v.elements]
    assert "api-application--fraud-check" in [r.id for r in v.relationships]
