"""Pydantic models for the subset of the Structurizr workspace JSON that designPerspectives uses.

Field names follow the schema in structurizr/structurizr, module `structurizr-json/structurizr.yaml`
(checked 2026-11-14, see docs/reviews/stage-a_review.md, section A0).

Every model allows extra fields, so anything we do not model (deployment nodes, documentation,
styles, ...) is kept as-is when a workspace is read and written back.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Kind = Literal["person", "softwareSystem", "container", "component"]

# Tags Structurizr gives every element/relationship of a type ("Element,Person" etc.).
DEFAULT_TAGS: dict[str, list[str]] = {
    "person": ["Element", "Person"],
    "softwareSystem": ["Element", "Software System"],
    "container": ["Element", "Container"],
    "component": ["Element", "Component"],
    "relationship": ["Relationship"],
}


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True, alias_generator=to_camel)


class Relationship(_Base):
    id: str
    source_id: str
    destination_id: str
    description: str | None = None
    technology: str | None = None
    tags: str | None = None
    url: str | None = None
    properties: dict[str, str] | None = None


class _Element(_Base):
    id: str
    name: str
    description: str | None = None
    tags: str | None = None
    url: str | None = None
    properties: dict[str, str] | None = None
    relationships: list[Relationship] = Field(default_factory=list)


class Person(_Element):
    location: str | None = None


class Component(_Element):
    technology: str | None = None


class Container(_Element):
    technology: str | None = None
    components: list[Component] = Field(default_factory=list)


class SoftwareSystem(_Element):
    location: str | None = None
    containers: list[Container] = Field(default_factory=list)


Element = Person | SoftwareSystem | Container | Component


class Model(_Base):
    people: list[Person] = Field(default_factory=list)
    software_systems: list[SoftwareSystem] = Field(default_factory=list)


class ElementView(_Base):
    id: str
    x: int | None = None
    y: int | None = None


class RelationshipView(_Base):
    id: str
    description: str | None = None
    order: str | None = None
    response: bool | None = None


class View(_Base):
    """One view. The same class is used for every view type; the scope field differs by type."""

    key: str
    order: int | None = None
    title: str | None = None
    description: str | None = None
    properties: dict[str, str] | None = None
    software_system_id: str | None = None  # system context and container views
    container_id: str | None = None  # component views
    element_id: str | None = None  # dynamic views (optional scope)
    elements: list[ElementView] = Field(default_factory=list)
    relationships: list[RelationshipView] = Field(default_factory=list)


VIEW_LISTS = (
    "system_landscape_views",
    "system_context_views",
    "container_views",
    "component_views",
    "dynamic_views",
)


class Views(_Base):
    system_landscape_views: list[View] = Field(default_factory=list)
    system_context_views: list[View] = Field(default_factory=list)
    container_views: list[View] = Field(default_factory=list)
    component_views: list[View] = Field(default_factory=list)
    dynamic_views: list[View] = Field(default_factory=list)

    def all(self) -> list[View]:
        out: list[View] = []
        for name in VIEW_LISTS:
            out.extend(getattr(self, name))
        # View types we do not model (deployment, filtered, image) still have keys.
        for name, value in (self.model_extra or {}).items():
            if name.endswith("Views") and isinstance(value, list):
                out.extend(View.model_validate(v) for v in value if isinstance(v, dict) and "key" in v)
        return out


class Workspace(_Base):
    id: int | None = None
    name: str
    description: str | None = None
    properties: dict[str, str] | None = None
    model: Model
    views: Views


def dump_json(obj: BaseModel | dict) -> str:
    """Serialise with stable formatting so `git diff` stays readable."""
    data = obj.model_dump(by_alias=True, exclude_none=True, exclude_defaults=True) if isinstance(obj, BaseModel) else obj
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def empty_workspace(name: str = "Workspace") -> Workspace:
    return Workspace(name=name, model=Model(), views=Views())


def read_workspace(path: Path) -> Workspace:
    return Workspace.model_validate_json(path.read_text(encoding="utf-8"))


def tags_for(kind: str, extra: list[str] | None = None) -> str:
    tags = list(DEFAULT_TAGS[kind])
    for t in extra or []:
        if t not in tags:
            tags.append(t)
    return ",".join(tags)
