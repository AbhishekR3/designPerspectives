"""Reading and writing the two model files in `<project>/architecture/`.

- `workspace.json`           Structurizr workspace (model, views, positions, flows)
- `designperspectives.json`  sidecar (tag groups, lenses)

Every edit runs on a copy; the copy is synced, validated and written atomically, then becomes
current. An edit is refused if it adds a validation error (errors already in a file opened from
elsewhere are reported but do not block unrelated edits). Files changed on disk (e.g. by
`git checkout`) are picked up on the next request.
"""

from __future__ import annotations

import os
import tempfile
import threading
from importlib import resources
from pathlib import Path
from typing import Any, Callable

from .diagrams import sync_views
from .flows import sync_flows
from .ops import ModelError
from .sidecar import Sidecar
from .validate import errors
from .workspace import Workspace, dump_json, empty_workspace, read_workspace

ARCH_DIR = "architecture"
WORKSPACE_FILE = "workspace.json"
SIDECAR_FILE = "designperspectives.json"


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class Project:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.dir = self.root / ARCH_DIR
        self.ws_path = self.dir / WORKSPACE_FILE
        self.sc_path = self.dir / SIDECAR_FILE
        self.lock = threading.RLock()
        self._stamp: tuple | None = None
        self.load()

    # ---------------------------------------------------------------- load

    def _file_stamp(self) -> tuple:
        def st(p: Path):
            try:
                s = p.stat()
                return (s.st_mtime_ns, s.st_size)
            except FileNotFoundError:
                return None

        return (st(self.ws_path), st(self.sc_path))

    def load(self) -> None:
        with self.lock:
            if not self.ws_path.exists():
                raise FileNotFoundError(f"No {ARCH_DIR}/{WORKSPACE_FILE} in {self.root}")
            self.workspace = read_workspace(self.ws_path)
            if self.sc_path.exists():
                self.sidecar = Sidecar.model_validate_json(self.sc_path.read_text(encoding="utf-8"))
            else:
                self.sidecar = Sidecar()
            self.load_errors = errors(self.workspace, self.sidecar)
            self._stamp = self._file_stamp()

    def reload_if_changed(self) -> bool:
        with self.lock:
            if self._file_stamp() != self._stamp:
                self.load()
                return True
            return False

    # ---------------------------------------------------------------- edit

    def edit(self, fn: Callable[[Workspace, Sidecar], Any]) -> Any:
        with self.lock:
            self.reload_if_changed()
            ws = self.workspace.model_copy(deep=True)
            sc = self.sidecar.model_copy(deep=True)
            result = fn(ws, sc)
            sync_views(ws)
            sync_flows(ws)
            before = set(self.load_errors)
            new = [e for e in errors(ws, sc) if e not in before]
            if new:
                raise ModelError(" ".join(new))
            self.write(ws, sc)
            return result

    def write(self, ws: Workspace, sc: Sidecar) -> None:
        with self.lock:
            _atomic_write(self.ws_path, dump_json(ws))
            _atomic_write(self.sc_path, dump_json(sc.dump()))
            self.workspace, self.sidecar = ws, sc
            self.load_errors = errors(ws, sc)
            self._stamp = self._file_stamp()


# -------------------------------------------------------------------- init


def demo_files() -> tuple[str, str]:
    base = resources.files("designperspectives") / "demo"
    return (base / WORKSPACE_FILE).read_text(encoding="utf-8"), (base / SIDECAR_FILE).read_text(encoding="utf-8")


def init_project(root: Path, demo: bool = True, name: str | None = None) -> Path:
    """Create `<root>/architecture/` with the demo model or an empty one. Never overwrites."""
    arch = Path(root) / ARCH_DIR
    ws_path = arch / WORKSPACE_FILE
    if ws_path.exists():
        raise FileExistsError(f"{ws_path} already exists")
    arch.mkdir(parents=True, exist_ok=True)
    if demo:
        ws_text, sc_text = demo_files()
    else:
        ws = empty_workspace(name or Path(root).resolve().name or "Workspace")
        ws_text, sc_text = dump_json(ws), dump_json(Sidecar().dump())
    _atomic_write(ws_path, ws_text)
    _atomic_write(arch / SIDECAR_FILE, sc_text)
    return arch


def static_dir() -> Path | None:
    p = Path(str(resources.files("designperspectives") / "static"))
    return p if (p / "index.html").exists() else None

