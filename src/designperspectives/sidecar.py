"""designPerspectives-only data that Structurizr has no place for (`architecture/designperspectives.json`).

Holds tag-group definitions and user-made lenses. Tag *values* live on the elements themselves,
as Structurizr element properties named `dp.tag.<Group>` (see ops.py).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Level = Literal["landscape", "context", "container", "component"]
LEVELS: tuple[str, ...] = ("landscape", "context", "container", "component")


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True, alias_generator=to_camel)


class TagValue(_Base):
    name: str
    color: str  # CSS hex colour, e.g. "#d62728"


class TagGroup(_Base):
    name: str
    values: list[TagValue] = Field(default_factory=list)


class Lens(_Base):
    """A named set of defaults for one audience. Not access control: everything stays reachable."""

    id: str
    name: str
    visible_levels: list[Level] = Field(default_factory=lambda: list(LEVELS))
    default_overlay: str | None = None  # tag group name
    hidden_tag_groups: list[str] = Field(default_factory=list)
    show_technology: bool = True
    show_descriptions: bool = True
    builtin: bool = False


ENGINEER = Lens(
    id="engineer",
    name="Engineer",
    visible_levels=["container", "component"],
    default_overlay=None,
    hidden_tag_groups=[],
    show_technology=True,
    show_descriptions=True,
    builtin=True,
)
BUILTIN_LENSES = [ENGINEER]


class Sidecar(_Base):
    version: int = 1
    tag_groups: list[TagGroup] = Field(default_factory=list)
    lenses: list[Lens] = Field(default_factory=list)

    def dump(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        for lens in data.get("lenses", []):
            lens.pop("builtin", None)
        return data
