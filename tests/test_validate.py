"""Validation rules (mirroring Structurizr's loader) and sidecar rules."""

from designperspectives.sidecar import Lens, Sidecar, TagGroup, TagValue
from designperspectives.validate import errors
from designperspectives.workspace import Workspace


def ws(data):
    return Workspace.model_validate({"name": "T", "views": {}, **data})


def test_duplicate_top_level_names():
    w = ws({"model": {"people": [{"id": "a", "name": "X"}], "softwareSystems": [{"id": "b", "name": "X"}]}})
    assert errors(w, Sidecar()) == ['A person or software system named "X" already exists.']


def test_duplicate_ids():
    w = ws({"model": {"people": [{"id": "a", "name": "X"}, {"id": "a", "name": "Y"}]}})
    assert "share the ID" in errors(w, Sidecar())[0]


def test_duplicate_relationship_descriptions():
    w = ws({"model": {"people": [{"id": "a", "name": "A", "relationships": [
        {"id": "r1", "sourceId": "a", "destinationId": "b", "description": "Uses"},
        {"id": "r2", "sourceId": "a", "destinationId": "b", "description": "Uses"}]}],
        "softwareSystems": [{"id": "b", "name": "B"}]}})
    assert errors(w, Sidecar()) == ['A relationship with the description "Uses" already exists between "A" and "B".']


def test_view_references():
    w = ws({"model": {}, "views": {"systemLandscapeViews": [{"key": "L", "elements": [{"id": "zz"}]}],
                                   "containerViews": [{"key": "L", "softwareSystemId": "q"}]}})
    e = errors(w, Sidecar())
    assert "A view with the key L already exists." in e
    assert any("references an element (id=zz)" in x for x in e)
    assert any("associated with an element (id=q)" in x for x in e)


def test_sidecar_rules():
    w = ws({"model": {"people": [{"id": "a", "name": "A", "properties": {"dp.tag.Risk": "Huge", "dp.tag.Cost": "Low"}}]}})
    sc = Sidecar(
        tag_groups=[TagGroup(name="Risk", values=[TagValue(name="High", color="#f00")])],
        lenses=[Lens(id="x", name="X", default_overlay="Nope")],
    )
    e = errors(w, sc)
    assert '"A" has "Huge" for tag group "Risk", which is not one of its values.' in e
    assert '"A" has a value for tag group "Cost", which is not defined.' in e
    assert 'Lens "X" uses tag group "Nope", which is not defined.' in e
