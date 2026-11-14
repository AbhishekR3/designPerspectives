"""Code level (C4): the files behind a component or connector, and the imports between them.

An element or relationship lists code paths (`dp.code.paths`, relative to the code root; a path may be
a file or a folder). The code diagram shows one box per source file and one line per import found by a
deterministic scan: Python via `ast`, JavaScript/TypeScript via a regex over import/require statements.
Only imports that resolve to another file in the same diagram are drawn.

File read/write is restricted to the code root: paths are resolved and must stay inside it.
"""

from __future__ import annotations

import ast
import posixpath
import re
from pathlib import Path

from .diagrams import DiagramRef, scope_name, title_of
from .ops import CODE_KEY, Index, ModelError, get_json

SOURCE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".java", ".kt", ".go", ".rs", ".cs", ".sql", ".yaml", ".yml", ".json", ".md"}
SKIP_DIRS = {"__pycache__", "node_modules", ".git", ".venv", "venv", "dist", "build", ".idea"}
MAX_FILES = 60
MAX_BYTES = 1_000_000
JS_IMPORT = re.compile(r"""(?:import\s[^'"]*?from\s*|import\s*|require\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]""")


def safe_path(code_root: Path | None, rel: str) -> Path:
    """Resolve `rel` under the code root, refusing anything that escapes it."""
    if code_root is None:
        raise ModelError("No code folder is set. Start the app with --code-root <folder>.")
    root = code_root.resolve()
    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise ModelError("That path is outside the code folder.")
    return target


def _rel(root: Path, p: Path) -> str:
    return p.relative_to(root).as_posix()


def expand_paths(code_root: Path | None, paths: list[str]) -> tuple[list[str], list[str]]:
    """Files for a list of paths (folders expanded). Returns (files, missing paths)."""
    files: list[str] = []
    missing: list[str] = []
    if code_root is None:
        return files, list(paths)
    root = code_root.resolve()
    for p in paths:
        try:
            target = safe_path(code_root, p)
        except ModelError:
            missing.append(p)
            continue
        if target.is_file():
            files.append(_rel(root, target))
        elif target.is_dir():
            for f in sorted(target.rglob("*")):
                if any(part in SKIP_DIRS for part in f.relative_to(root).parts):
                    continue
                if f.is_file() and f.suffix in SOURCE_EXT:
                    files.append(_rel(root, f))
        else:
            missing.append(p)
    seen: dict[str, None] = {}
    for f in files:
        seen.setdefault(f, None)
    return list(seen)[:MAX_FILES], missing


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:MAX_BYTES]
    except OSError:
        return ""


def _py_modules(rel: str, source: str) -> list[tuple[str, int]]:
    """(dotted module, relative level) for each import in a Python file."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    out: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.extend((a.name, 0) for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level and not base:
                out.extend((a.name, node.level) for a in node.names)
            else:
                out.append((base, node.level))
                out.extend((f"{base}.{a.name}" if base else a.name, node.level) for a in node.names)
    return out


def _resolve_py(rel: str, module: str, level: int, files: set[str]) -> str | None:
    parts = module.split(".") if module else []
    here = posixpath.dirname(rel)
    bases: list[str] = []
    if level:
        base = here
        for _ in range(level - 1):
            base = posixpath.dirname(base)
        bases = [base]
    else:
        # absolute import: try from the code root and from every parent folder of this file
        bases = [""]
        cur = here
        while cur:
            bases.append(cur)
            cur = posixpath.dirname(cur)
    for base in bases:
        stem = posixpath.join(base, *parts) if parts else base
        for cand in (f"{stem}.py", posixpath.join(stem, "__init__.py")):
            cand = posixpath.normpath(cand)
            if cand in files and cand != rel:
                return cand
    return None


def _resolve_js(rel: str, spec: str, files: set[str]) -> str | None:
    if not spec.startswith("."):
        return None
    stem = posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec))
    exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"]
    for e in exts:
        if stem + e in files and stem + e != rel:
            return stem + e
    for e in exts[1:]:
        cand = posixpath.join(stem, "index" + e)
        if cand in files:
            return cand
    return None


def scan_imports(code_root: Path, files: list[str]) -> list[tuple[str, str]]:
    """Import edges (from file, to file) among the given files."""
    fileset = set(files)
    edges: dict[tuple[str, str], None] = {}
    for rel in files:
        suffix = posixpath.splitext(rel)[1]
        if suffix not in (".py", ".js", ".jsx", ".ts", ".tsx", ".mjs"):
            continue
        source = _read(code_root.resolve() / rel)
        targets: list[str | None] = []
        if suffix == ".py":
            targets = [_resolve_py(rel, m, lvl, fileset) for m, lvl in _py_modules(rel, source)]
        else:
            targets = [_resolve_js(rel, spec, fileset) for spec in JS_IMPORT.findall(source)]
        for t in targets:
            if t and t != rel:
                edges[(rel, t)] = None
    return list(edges)


def file_node(rel: str, root: Path | None) -> dict:
    name = posixpath.basename(rel)
    folder = posixpath.dirname(rel)
    lines = None
    if root is not None:
        try:
            lines = sum(1 for _ in (root.resolve() / rel).open("rb"))
        except OSError:
            lines = None
    return {
        "id": f"file:{rel}",
        "kind": "file",
        "name": name,
        "description": folder,
        "technology": "",
        "technologies": [],
        "url": "",
        "owner": "",
        "links": [],
        "tags": {},
        "archType": "document",
        "notes": "",
        "tradeoffs": [],
        "usage": [],
        "sensitive": [],
        "sensitivityLevel": None,
        "codePaths": [rel],
        "parentId": None,
        "external": False,
        "location": None,
        "childCount": 0,
        "inScope": True,
        "position": None,
        "drillKey": None,
        "filePath": rel,
        "lineCount": lines,
    }


def code_diagram(idx: Index, ref: DiagramRef, code_root: Path | None) -> dict:
    owner = idx.elements.get(ref.scope) or idx.relationships.get(ref.scope)  # type: ignore[arg-type]
    paths = get_json(owner, CODE_KEY) if owner is not None else []
    files, missing = expand_paths(code_root, paths)
    nodes = [file_node(f, code_root) for f in files]
    edges = []
    if code_root is not None:
        for a, b in scan_imports(code_root, files):
            edges.append(
                {
                    "id": f"file:{a}->{b}",
                    "source": f"file:{a}",
                    "target": f"file:{b}",
                    "description": "imports",
                    "technology": "",
                    "technologies": [],
                    "kind": "",
                    "sensitivityLevel": None,
                    "hasNotes": False,
                    "stageCount": 0,
                    "derived": False,
                    "relationshipIds": [],
                    "detailKey": None,
                    "drillTargets": [],
                }
            )
    return {
        "key": ref.key,
        "level": "code",
        "scope": ref.scope,
        "title": title_of(idx, ref),
        "boundary": None,
        "nodes": nodes,
        "edges": edges,
        "code": {
            "ownerName": scope_name(idx, ref),
            "paths": paths,
            "missing": missing,
            "hasRoot": code_root is not None,
            "truncated": len(files) >= MAX_FILES,
        },
    }


# --------------------------------------------------------------------------- file API


def list_tree(code_root: Path | None, rel: str = "") -> list[dict]:
    """Entries of one folder under the code root, for the path picker."""
    target = safe_path(code_root, rel)
    if not target.is_dir():
        raise ModelError("That is not a folder.")
    root = code_root.resolve()  # type: ignore[union-attr]
    out = []
    for p in sorted(target.iterdir(), key=lambda q: (not q.is_dir(), q.name.lower())):
        if p.name in SKIP_DIRS or p.name.startswith("."):
            continue
        out.append({"name": p.name, "path": _rel(root, p), "type": "dir" if p.is_dir() else "file"})
    return out


def read_file(code_root: Path | None, rel: str) -> dict:
    target = safe_path(code_root, rel)
    if not target.is_file():
        raise ModelError("No such file.")
    if target.stat().st_size > MAX_BYTES:
        raise ModelError("File is too large to open here (over 1 MB).")
    data = target.read_bytes()
    if b"\0" in data:
        raise ModelError("This looks like a binary file.")
    return {"path": rel, "content": data.decode("utf-8", errors="replace"), "mtime": target.stat().st_mtime}


def write_file(code_root: Path | None, rel: str, content: str, expected_mtime: float | None = None) -> dict:
    target = safe_path(code_root, rel)
    if not target.is_file():
        raise ModelError("No such file. New files cannot be created from here.")
    if expected_mtime is not None and abs(target.stat().st_mtime - expected_mtime) > 0.001:
        raise ModelError("The file changed on disk since you opened it. Reopen it to see the new version.")
    target.write_text(content, encoding="utf-8")
    return {"path": rel, "mtime": target.stat().st_mtime}
