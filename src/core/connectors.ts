/**
 * Connector detail: the inside of one relationship.
 *
 * A relationship can describe how it is implemented as an ordered list of *stages*
 * (e.g. Kafka topic -> Mask PII (Spark) -> Load (Airflow DAG) -> Warehouse). Stages are stored on
 * the relationship (`dp.stages`) and are not model elements, so they never clash with the C4
 * hierarchy. A stage may link to a model element (a component or container that implements it);
 * double-clicking such a stage opens that element's own diagram.
 *
 * Diagram key: `connector-<relationshipId>`. Boxes: the relationship's source, its stages, its target.
 */

import { drillKey, homeKey, keyFor, scopeName, titleOf, type DiagramRef, type RawDiagram, type RawEdge, type RawNode } from "./diagrams.js";
import { ARCH_KEY, CODE_KEY, elementSummary, getJson, getProps, relationshipSummary, splitTech, type Index } from "./modelEdits.js";
import type { DiagramNode } from "../shared/types.js";

export function stageNodeId(relId: string, stageId: string): string {
  return `stage:${relId}:${stageId}`;
}

/** Fields every synthetic box (stage, file) carries, so the UI can treat it like an element. */
export function blankNode(): Omit<DiagramNode, "id" | "kind" | "name" | "style" | "size"> {
  return {
    description: "",
    technology: "",
    technologies: [],
    url: "",
    owner: "",
    links: [],
    tags: {},
    archType: "",
    notes: "",
    details: [],
    tradeoffs: [],
    usage: [],
    sensitive: [],
    sensitivityLevel: null,
    codePaths: [],
    characteristics: [],
    cost: [],
    work: [],
    costTotal: 0,
    costRollup: 0,
    parentId: null,
    external: false,
    location: null,
    childCount: 0,
    runUrl: "",
    otelService: "",
    catalogId: "",
    data: [],
    inScope: true,
    position: null,
    drillKey: null,
  };
}

/** Where double-clicking a stage that links to this element should go. */
function targetKey(idx: Index, elementId: string): string {
  return drillKey(idx, elementId) ?? homeKey(idx, elementId);
}

export function connectorDiagram(idx: Index, ref: DiagramRef): RawDiagram {
  const rel = idx.relationships.get(ref.scope!)!;
  const summ = relationshipSummary(rel);
  const nodes: RawNode[] = [rel.sourceId, rel.destinationId].map((end) => ({
    ...elementSummary(idx, end),
    inScope: true,
    position: null,
    drillKey: drillKey(idx, end),
  }));
  const chain = [nodes[0]!.id];
  for (const st of summ.stages) {
    const nid = stageNodeId(rel.id, st.id);
    const techs = splitTech(st.technologies);
    const linked = st.elementId && idx.elements.has(st.elementId) ? st.elementId : null;
    nodes.splice(nodes.length - 1, 0, {
      ...blankNode(),
      id: nid,
      kind: "stage",
      name: st.name,
      description: st.description ?? "",
      technology: techs.join(", "),
      technologies: techs,
      archType: st.archType || "pipeline",
      drillKey: linked ? targetKey(idx, linked) : null,
      stageId: st.id,
      linkedElementId: linked,
      linkedElementName: linked ? idx.elements.get(linked)!.name : null,
    });
    chain.push(nid);
  }
  chain.push(nodes[nodes.length - 1]!.id);
  const direct = chain.length === 2;
  const edges: RawEdge[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({
      id: `conn:${rel.id}:${i}`,
      source: chain[i]!,
      target: chain[i + 1]!,
      description: direct ? rel.description || "" : "",
      technology: direct ? summ.technology : "",
      technologies: direct ? summ.technologies : [],
      kind: "",
      sensitivityLevel: null,
      hasNotes: false,
      stageCount: 0,
      derived: false,
      relationshipIds: [rel.id],
      detailKey: null,
      drillTargets: [],
    });
  }
  const hasCode = getJson(rel, CODE_KEY).length > 0;
  return {
    key: ref.key,
    level: "connector",
    scope: rel.id,
    title: titleOf(idx, ref),
    boundary: null,
    nodes,
    edges,
    connector: {
      relationshipId: rel.id,
      name: scopeName(idx, ref),
      description: rel.description || "",
      kind: summ.kind,
      technologies: summ.technologies,
      hasCode,
      codeKey: hasCode ? keyFor("code", rel.id) : null,
      archType: getProps(rel)[ARCH_KEY] ?? "",
    },
  };
}
