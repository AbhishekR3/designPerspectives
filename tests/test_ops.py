"""Model edits and the rules they enforce."""

import pytest

from designperspectives import ops
from designperspectives.ops import ModelError, build_index
from designperspectives.sidecar import Sidecar, TagGroup, TagValue
from designperspectives.workspace import empty_workspace


@pytest.fixture
def ws():
    return empty_workspace("T")


def test_ids_are_slugs_and_unique(ws):
    a = ops.create_element(ws, "softwareSystem", "Shop")
    c1 = ops.create_element(ws, "container", "API", a)
    b = ops.create_element(ws, "softwareSystem", "Warehouse")
    c2 = ops.create_element(ws, "container", "API", b)  # same name, different system: allowed
    assert (a, c1, c2) == ("shop", "api", "api-2")


def test_default_names_are_numbered(ws):
    a = ops.create_element(ws, "person")
    b = ops.create_element(ws, "person")
    idx = build_index(ws)
    assert [idx.elements[a].name, idx.elements[b].name] == ["New person", "New person 2"]


def test_names_unique_among_people_and_systems(ws):
    ops.create_element(ws, "person", "Bank")
    with pytest.raises(ModelError):
        ops.create_element(ws, "softwareSystem", "Bank")


def test_containers_need_a_system(ws):
    p = ops.create_element(ws, "person", "P")
    with pytest.raises(ModelError):
        ops.create_element(ws, "container", "C", p)
    with pytest.raises(ModelError):
        ops.create_element(ws, "component", "K")


def test_rename_checks_siblings(ws):
    s = ops.create_element(ws, "softwareSystem", "S")
    a = ops.create_element(ws, "container", "A", s)
    ops.create_element(ws, "container", "B", s)
    with pytest.raises(ModelError):
        ops.update_element(ws, Sidecar(), a, {"name": "B"})
    ops.update_element(ws, Sidecar(), a, {"name": "A2", "technology": "Python"})
    el = build_index(ws).elements[a]
    assert (el.id, el.name, el.technology) == ("a", "A2", "Python")  # ID is stable across renames


def test_owner_links_and_tags_are_properties(ws):
    sc = Sidecar(tag_groups=[TagGroup(name="Risk", values=[TagValue(name="High", color="#f00")])])
    s = ops.create_element(ws, "softwareSystem", "S")
    ops.update_element(ws, sc, s, {"owner": "Team A", "links": [{"label": "Repo", "url": "https://x"}], "tags": {"Risk": "High"}})
    el = build_index(ws).elements[s]
    assert el.properties["dp.owner"] == "Team A"
    assert el.properties["dp.tag.Risk"] == "High"
    assert ops.element_links(el) == [{"label": "Repo", "url": "https://x"}]
    with pytest.raises(ModelError):
        ops.update_element(ws, sc, s, {"tags": {"Risk": "Extreme"}})
    with pytest.raises(ModelError):
        ops.update_element(ws, sc, s, {"tags": {"Cost": "Low"}})
    ops.update_element(ws, sc, s, {"tags": {"Risk": None}, "owner": ""})
    assert build_index(ws).elements[s].properties is not None  # links remain
    assert "dp.tag.Risk" not in build_index(ws).elements[s].properties


def test_relationship_rules(ws):
    s = ops.create_element(ws, "softwareSystem", "S")
    c = ops.create_element(ws, "container", "C", s)
    p = ops.create_element(ws, "person", "P")
    with pytest.raises(ModelError):
        ops.create_relationship(ws, s, s)
    with pytest.raises(ModelError):
        ops.create_relationship(ws, s, c)  # parent -> child
    r1 = ops.create_relationship(ws, p, c)
    r2 = ops.create_relationship(ws, p, c)
    idx = build_index(ws)
    assert (r1, r2) == ("p--c", "p--c-2")
    assert [idx.relationships[r1].description, idx.relationships[r2].description] == ["Uses", "Uses 2"]
    with pytest.raises(ModelError):
        ops.create_relationship(ws, p, c, "Uses")
    with pytest.raises(ModelError):
        ops.update_relationship(ws, r2, {"description": "Uses"})


def test_delete_cascades(ws):
    s = ops.create_element(ws, "softwareSystem", "S")
    c = ops.create_element(ws, "container", "C", s)
    k = ops.create_element(ws, "component", "K", c)
    p = ops.create_element(ws, "person", "P")
    ops.create_relationship(ws, p, k)
    ops.create_relationship(ws, k, p, "Notifies")
    gone = ops.delete_element(ws, s)
    idx = build_index(ws)
    assert gone == {s, c, k}
    assert list(idx.elements) == [p]
    assert idx.relationships == {}
