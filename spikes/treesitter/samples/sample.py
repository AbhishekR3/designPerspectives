import os
import sys as system
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional
from . import sibling
from ..pkg.mod import thing as renamed

DEFAULT_DEPTH = 3
_cache: dict[str, int] = {}


@dataclass
class Element:
    id: str
    kind: str
    tags: list[str] = field(default_factory=list)

    def label(self) -> str:
        return f"{self.kind}:{self.id}"


class Workspace:
    def __init__(self, root: Path) -> None:
        self.root = root

    def walk(self) -> Iterator[Path]:
        for base, _dirs, files in os.walk(self.root):
            for name in files:
                yield Path(base) / name


def count(root: str, depth: Optional[int] = None) -> int:
    return sum(1 for _ in Workspace(Path(root)).walk())


async def main() -> None:
    print(count(system.argv[1] if len(system.argv) > 1 else "."), renamed, sibling)
