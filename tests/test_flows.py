"""Flows stored as Structurizr dynamic views."""

import pytest

from designperspectives import flows, ops
from designperspectives.ops import ModelError, build_index


def test_demo_flow(demo_ws):
    [f] = flows.list_flows(demo_ws)
    assert f["title"] == "Sign in"
    assert len(f["steps"]) == 6
    assert [s["order"] for s in f["steps"]] == ["1", "2", "3", "4", "5", "6"]
    assert f["steps"][3]["response"] is True
    assert f["scope"] == "api-application"
    assert f["warnings"] == []


def test_create_and_edit_flow(demo_ws):
    key = flows.create_flow(demo_ws, "Withdraw cash")
    flows.update_flow(demo_ws, key, {"steps": [
        {"relationshipId": "personal-banking-customer--atm", "description": "Asks for cash"},
        {"relationshipId": "atm--mainframe-banking-system"},
    ]})
    f = next(f for f in flows.list_flows(demo_ws) if f["key"] == key)
    assert f["scope"] is None  # people and systems only: unscoped
    assert f["warnings"] == []
    view = next(v for v in demo_ws.views.dynamic_views if v.key == key)
    assert [e.id for e in view.elements] == ["personal-banking-customer", "atm", "mainframe-banking-system"]


def test_unknown_relationship_rejected(demo_ws):
    key = flows.create_flow(demo_ws, "X")
    with pytest.raises(ModelError):
        flows.update_flow(demo_ws, key, {"steps": [{"relationshipId": "nope"}]})


def test_scope_warning_for_components_of_two_containers(demo_ws):
    k2 = ops.create_element(demo_ws, "component", "Renderer", "web-application")
    ops.create_relationship(demo_ws, k2, "sign-in-controller", "Calls")
    idx = build_index(demo_ws)
    scope, warnings = flows.infer_scope(idx, [k2, "sign-in-controller"])
    assert warnings and "more than one container" in warnings[0]


def test_deleting_relationship_removes_its_steps(demo_ws):
    ops.delete_relationship(demo_ws, "security-component--database")
    flows.sync_flows(demo_ws)
    [f] = flows.list_flows(demo_ws)
    assert len(f["steps"]) == 4


def test_flow_diagram(demo_ws):
    d = flows.flow_diagram(demo_ws, "flow-sign-in")
    assert len(d["nodes"]) == 4
    e = next(e for e in d["edges"] if e["id"] == "sign-in-controller--security-component")
    assert e["steps"] == [2, 5]
