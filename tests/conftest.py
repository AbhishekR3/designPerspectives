from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from designperspectives.server import create_app
from designperspectives.store import init_project
from designperspectives.workspace import Workspace, read_workspace


@pytest.fixture
def demo_dir(tmp_path: Path) -> Path:
    init_project(tmp_path, demo=True)
    return tmp_path


@pytest.fixture
def demo_ws(demo_dir: Path) -> Workspace:
    return read_workspace(demo_dir / "architecture" / "workspace.json")


@pytest.fixture
def client(demo_dir: Path) -> TestClient:
    return TestClient(create_app(demo_dir))
