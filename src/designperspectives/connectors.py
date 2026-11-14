"""Connector detail: the inside of one relationship.

A relationship can describe how it is implemented as an ordered list of *stages*
(e.g. Kafka topic -> Mask PII (Spark) -> Load (Airflow DAG) -> Warehouse). Stages are stored on
the relationship (`dp.stages`) and are not model elements, so they never clash with the C4
hierarchy. A stage may link to a model element (a component or container that implements it);
double-clicking such a stage opens that element's own diagram.

Diagram key: `connector-<relationshipId>`. Boxes: the relationship's source, its stages, its target.
"""

from __future__ import annotations

from .diagrams import DiagramRef, drill_key, home_key, key_for, scope_name, title_of
from .ops import ARCH_KEY, CODE_KEY, Index, element_summary, get_json, get_props, relationship_summary, split_tech


def stage_node_id(rel_id: str, stage_id: str) -> str:
    return f"stage:{rel_id}:{stage_id}"


def _target_key(idx: Index, element_id: str) -> str:
    """Where double-clicking a stage that links to this element should go."""
    return drill_key(idx, element_id) or home_key(idx, element_id)


def connector_diagram(idx: Index, ref: DiagramRef) -> dict:
    rel = idx.relationships[ref.scope]  # type: ignore[index]
    summ = relationship_summary(rel)
    nodes = []
    for end in (rel.source_id, rel.destination_id):
        s = element_summary(idx, end)
        s["inScope"] = True
        s["position"] = None
        s["drillKey"] = drill_key(idx, end)
        nodes.append(s)
    src, dst = nodes
    chain = [src["id"]]
    for st in summ["stages"]:
        nid = stage_node_id(rel.id, st["id"])
        techs = split_tech(st.get("technologies"))
        linked = st.get("elementId")
        nodes.insert(
            len(nodes) - 1,
            {
                "id": nid,
                "kind": "stage",
                "name": st["name"],
                "description": st.get("description", ""),
                "technology": ", ".join(techs),
                "technologies": techs,
                "url": "",
                "owner": "",
                "links": [],
                "tags": {},
                "archType": st.get("archType") or "pipeline",
                "notes": "",
                "tradeoffs": [],
                "usage": [],
                "sensitive": [],
                "sensitivityLevel": None,
                "codePaths": [],
                "parentId": None,
                "external": False,
                "location": None,
                "childCount": 0,
                "inScope": True,
                "position": None,
                "drillKey": _target_key(idx, linked) if linked and linked in idx.elements else None,
                "stageId": st["id"],
                "linkedElementId": linked if linked in idx.elements else None,
                "linkedElementName": idx.elements[linked].name if linked in idx.elements else None,
            },
        )
        chain.append(nid)
    chain.append(dst["id"])
    edges = []
    for i, (a, b) in enumerate(zip(chain, chain[1:])):
        edges.append(
            {
                "id": f"conn:{rel.id}:{i}",
                "source": a,
                "target": b,
                "description": rel.description or "" if len(chain) == 2 else "",
                "technology": summ["technology"] if len(chain) == 2 else "",
                "technologies": summ["technologies"] if len(chain) == 2 else [],
                "kind": "",
                "sensitivityLevel": None,
                "hasNotes": False,
                "stageCount": 0,
                "derived": False,
                "relationshipIds": [rel.id],
                "detailKey": None,
                "drillTargets": [],
            }
        )
    return {
        "key": ref.key,
        "level": "connector",
        "scope": rel.id,
        "title": title_of(idx, ref),
        "boundary": None,
        "nodes": nodes,
        "edges": edges,
        "connector": {
            "relationshipId": rel.id,
            "name": scope_name(idx, ref),
            "description": rel.description or "",
            "kind": summ["kind"],
            "technologies": summ["technologies"],
            "hasCode": bool(get_json(rel, CODE_KEY)),
            "codeKey": key_for("code", rel.id) if get_json(rel, CODE_KEY) else None,
            "archType": get_props(rel).get(ARCH_KEY, ""),
        },
    }
