"""designPerspectives-only data that Structurizr has no place for (`architecture/designperspectives.json`).

Holds:
- tag-group definitions and lenses
- `styles`:  colours/line styles per element or relationship ID (global, all diagrams)
- `layouts`: per-diagram data: box sizes, edge geometry (anchors, bend point, label position, routing),
             and, for diagrams Structurizr has no view for (connector detail, code), box positions

Tag *values* and descriptive fields live on the elements themselves, as Structurizr element
properties named `dp.*` (see ops.py).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Level = Literal["landscape", "context", "container", "component", "code"]
LEVELS: tuple[str, ...] = ("landscape", "context", "container", "component", "code")
SECTIONS: tuple[str, ...] = ("technology", "notes", "tradeoffs", "usage", "sensitive", "code")


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
    visible_levels: list[Level] = Field(default_factory=lambda: list(LEVELS))  # type: ignore[arg-type]
    default_overlay: str | None = None  # tag group name
    hidden_tag_groups: list[str] = Field(default_factory=list)
    visible_sections: list[str] = Field(default_factory=lambda: list(SECTIONS))  # object-panel sections
    show_technology: bool = True
    show_descriptions: bool = True
    builtin: bool = False


ENGINEER = Lens(
    id="engineer",
    name="Engineer",
    visible_levels=["container", "component", "code"],
    default_overlay=None,
    hidden_tag_groups=[],
    visible_sections=list(SECTIONS),
    show_technology=True,
    show_descriptions=True,
    builtin=True,
)
BUILTIN_LENSES = [ENGINEER]


class Style(_Base):
    """Look of one element or relationship. Every field is optional; unset means the default."""

    fill: str | None = None
    text: str | None = None
    stroke: str | None = None
    stroke_style: Literal["solid", "dashed", "dotted"] | None = None
    stroke_width: float | None = None
    font_size: int | None = None
    arrow: Literal["end", "start", "both", "none"] | None = None  # relationships only


class Point(_Base):
    x: float
    y: float


class Size(_Base):
    w: float
    h: float


class EdgeLayout(_Base):
    """Geometry of one edge on one diagram. Anchors are fractions (0..1) of the box, on its border."""

    source_anchor: Point | None = None
    target_anchor: Point | None = None
    control: Point | None = None  # bend point, absolute diagram coordinates
    label_t: float | None = None  # label position along the line, 0..1
    label_offset: float | None = None  # label distance from the line (px, signed)
    routing: Literal["straight", "curved", "orthogonal"] | None = None


class DiagramLayout(_Base):
    sizes: dict[str, Size] = Field(default_factory=dict)
    edges: dict[str, EdgeLayout] = Field(default_factory=dict)
    positions: dict[str, Point] = Field(default_factory=dict)


class Sidecar(_Base):
    version: int = 1
    tag_groups: list[TagGroup] = Field(default_factory=list)
    lenses: list[Lens] = Field(default_factory=list)
    styles: dict[str, Style] = Field(default_factory=dict)
    layouts: dict[str, DiagramLayout] = Field(default_factory=dict)

    def dump(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        for lens in data.get("lenses", []):
            lens.pop("builtin", None)
        data["styles"] = {k: v for k, v in data.get("styles", {}).items() if v}
        layouts = {}
        for key, lay in data.get("layouts", {}).items():
            lay = {k: v for k, v in lay.items() if v}
            if lay:
                layouts[key] = lay
        data["layouts"] = layouts
        for k in ("styles", "layouts"):
            if not data[k]:
                data.pop(k)
        return data
