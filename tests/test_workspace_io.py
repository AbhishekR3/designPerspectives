"""Model I/O: reading and writing Structurizr workspace JSON."""

import json

from designperspectives.store import init_project
from designperspectives.validate import errors
from designperspectives.sidecar import Sidecar
from designperspectives.workspace import Workspace, dump_json, read_workspace

FOREIGN = {
    "id": 42,
    "name": "From Structurizr",
    "lastModifiedAgent": "structurizr-java/6.2.4",
    "configuration": {"scope": "SoftwareSystem"},
    "documentation": {"sections": []},
    "model": {
        "people": [{"id": "1", "name": "User", "tags": "Element,Person", "relationships": [
            {"id": "3", "sourceId": "1", "destinationId": "2", "description": "Uses", "interactionStyle": "Synchronous"}
        ]}],
        "softwareSystems": [{"id": "2", "name": "System", "tags": "Element,Software System",
                             "perspectives": [{"name": "Security", "value": "High"}]}],
        "deploymentNodes": [{"id": "9", "name": "Server", "environment": "Live"}],
    },
    "views": {
        "systemContextViews": [{"key": "SystemContext", "softwareSystemId": "2",
                                "elements": [{"id": "1", "x": 0, "y": 0}, {"id": "2", "x": 600, "y": 0}],
                                "relationships": [{"id": "3", "vertices": [{"x": 1, "y": 2}]}],
                                "paperSize": "A5_Landscape"}],
        "deploymentViews": [{"key": "Deploy", "environment": "Live", "elements": [{"id": "9"}]}],
        "configuration": {"styles": {"elements": [{"tag": "Person", "shape": "Person"}]}},
    },
}


def test_unknown_fields_survive_a_round_trip(tmp_path):
    ws = Workspace.model_validate(FOREIGN)
    again = json.loads(dump_json(ws))
    assert again["lastModifiedAgent"] == "structurizr-java/6.2.4"
    assert again["configuration"] == {"scope": "SoftwareSystem"}
    assert again["model"]["deploymentNodes"][0]["environment"] == "Live"
    assert again["model"]["softwareSystems"][0]["perspectives"][0]["value"] == "High"
    assert again["model"]["people"][0]["relationships"][0]["interactionStyle"] == "Synchronous"
    view = again["views"]["systemContextViews"][0]
    assert view["paperSize"] == "A5_Landscape"
    assert view["relationships"][0]["vertices"] == [{"x": 1, "y": 2}]
    assert again["views"]["deploymentViews"][0]["key"] == "Deploy"
    assert again["views"]["configuration"]["styles"]["elements"][0]["shape"] == "Person"


def test_foreign_workspace_is_valid():
    ws = Workspace.model_validate(FOREIGN)
    assert errors(ws, Sidecar()) == []


def test_demo_round_trip_is_byte_identical(demo_dir):
    path = demo_dir / "architecture" / "workspace.json"
    text = path.read_text()
    assert dump_json(read_workspace(path)) == text


def test_demo_is_valid(demo_ws, demo_dir):
    sidecar = Sidecar.model_validate_json((demo_dir / "architecture" / "designperspectives.json").read_text())
    assert errors(demo_ws, sidecar) == []


def test_empty_project(tmp_path):
    init_project(tmp_path, demo=False, name="Mine")
    data = json.loads((tmp_path / "architecture" / "workspace.json").read_text())
    assert data == {"name": "Mine", "model": {}, "views": {}}


def test_init_never_overwrites(demo_dir):
    import pytest

    with pytest.raises(FileExistsError):
        init_project(demo_dir)


def test_output_is_stable_and_readable(demo_dir):
    text = (demo_dir / "architecture" / "workspace.json").read_text()
    assert text.endswith("\n")
    assert '"id": "internet-banking-system"' in text  # readable IDs
    assert "\n  " in text  # indented
