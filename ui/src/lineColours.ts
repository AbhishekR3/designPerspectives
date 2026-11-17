/**
 * The colours a diagram has by itself, before any overlay: lines by connection kind, a pipeline's own hue
 * (a connection with stages, and the inside of it), and a quiet tint per kind of box. Nothing here is stored in
 * the model: a colour is worked out from the kind or the ID, and a colour set by hand (`Style.stroke`, `Style.fill`)
 * and an overlay both win over it.
 */
import type { Diagram, DiagramEdge } from "../../src/shared/types.js";

export interface ConnectionLook {
  label: string;
  color: string;
  /** Besides the colour, a pattern, so kinds can be told apart without colour (SVG stroke-dasharray). */
  dash?: string;
}

/** Hues are spread around the wheel and chosen to read on the dark cards (#1c1f24) and on each other. */
export const CONNECTION_LOOK: Record<string, ConnectionLook> = {
  "sync-api": { label: "Synchronous API", color: "#60a5fa" },
  "async-message": { label: "Message / event", color: "#c084fc", dash: "9 5" },
  stream: { label: "Streaming", color: "#22d3ee", dash: "2 5" },
  "data-pipeline": { label: "Data pipeline", color: "#fb923c" },
  batch: { label: "Batch job", color: "#facc15", dash: "12 5 3 5" },
  "db-connection": { label: "Database connection", color: "#4ade80" },
  "file-transfer": { label: "File transfer", color: "#f472b6", dash: "5 4" },
  "cloud-service": { label: "Cloud service call", color: "#2dd4bf" },
  other: { label: "Other", color: "#94a3b8" },
};

/** One hue per pipeline (a connection with stages). Warm and cool hues alternate so neighbours differ. */
export const PIPELINE_HUES = ["#fb923c", "#38bdf8", "#f472b6", "#a3e635", "#a78bfa", "#facc15", "#2dd4bf", "#f87171"];

/** The same text always gives the same number, so a pipeline keeps its colour when others are added or removed. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // A final mix, because the low bits of this hash hardly differ for IDs that look alike (and the palette is picked by them).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const pipelineColor = (relationshipId: string): string => PIPELINE_HUES[hash(relationshipId) % PIPELINE_HUES.length]!;

/**
 * A line with no connection kind takes one from its technology when the technology names a well-known one (HTTPS,
 * SQL, Kafka, SFTP ...). This is a guess for colouring only: nothing is written to the model, and a kind set on
 * the line always wins. The first match counts, so a message queue is not taken for an API because of "JSON".
 */
const TECH_KIND: [RegExp, string][] = [
  [/\b(kafka|amqp|rabbitmq|mq|sqs|sns|pub\/?sub|nats|mqtt|jms|kinesis|event ?bridge)\b/i, "async-message"],
  [/\b(jdbc|odbc|sql|postgres(ql)?|mysql|mariadb|oracle|mongo(db)?|redis|memcached|cassandra|dynamodb)\b/i, "db-connection"],
  [/\b(sftp|ftps?|scp|ssh|s3|blob)\b/i, "file-transfer"],
  [/\b(https?|rest|grpc|graphql|soap|rpc|websocket)\b/i, "sync-api"],
];
export function kindOfLine(kind: string, technologies: string[]): string {
  if (CONNECTION_LOOK[kind]) return kind;
  const tech = technologies.join(" ");
  return TECH_KIND.find(([re]) => re.test(tech))?.[1] ?? "";
}

/** The kind each relationship's lines get (its own, or the one its technology names), by relationship ID. */
export function relationshipKinds(rels: { id: string; kind: string; technologies: string[] }[]): Map<string, string> {
  return new Map(rels.map((r) => [r.id, kindOfLine(r.kind, r.technologies)]));
}

export interface AutoLine {
  color: string;
  dash?: string;
  /** What the legend lists this line under. */
  group: string;
}

/**
 * The colour a line has by itself: its own pipeline hue when it has stages, else the colour of its connection kind;
 * a derived line (a summary of lower-level ones) and a line of no kind stay grey. In the inside view of a connection
 * every line takes the connection's colour.
 */
export function autoLine(
  e: Pick<DiagramEdge, "id" | "kind" | "technologies" | "stageCount" | "derived" | "relationshipIds">,
  diagram: { level: Diagram["level"]; connector?: Diagram["connector"] },
  relKinds?: ReadonlyMap<string, string>,
): AutoLine | null {
  if (diagram.level === "connector" && diagram.connector) {
    const stages = e.relationshipIds[0] === diagram.connector.relationshipId;
    return stages
      ? {
          color: pipelineColor(diagram.connector.relationshipId),
          group: "pipeline",
        }
      : null;
  }
  if (e.derived) {
    // A summary line takes the colour of the relationships behind it when they all have the same kind; otherwise it stays grey.
    const kinds = new Set(e.relationshipIds.map((id) => relKinds?.get(id) ?? ""));
    const only = kinds.size === 1 ? ([...kinds][0] ?? "") : "";
    const look = CONNECTION_LOOK[only];
    return look ? { color: look.color, group: only } : null;
  }
  if (e.stageCount > 0) return { color: pipelineColor(e.id), group: "pipeline" };
  const kind = kindOfLine(e.kind, e.technologies);
  const look = CONNECTION_LOOK[kind];
  return look ? { color: look.color, dash: look.dash, group: kind } : null;
}

/** What the legend shows for a diagram: each kind of line present, and whether any pipeline has its own colour. */
export function lineLegend(diagram: Diagram, relKinds?: ReadonlyMap<string, string>): { key: string; label: string; color: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const e of diagram.edges) {
    const a = autoLine(e, diagram, relKinds);
    if (a) counts.set(a.group, (counts.get(a.group) ?? 0) + 1);
  }
  const out: { key: string; label: string; color: string; n: number }[] = [];
  for (const [id, look] of Object.entries(CONNECTION_LOOK))
    if (counts.has(id))
      out.push({
        key: id,
        label: look.label,
        color: look.color,
        n: counts.get(id)!,
      });
  if (counts.has("pipeline"))
    out.push({
      key: "pipeline",
      label: "Pipeline with stages (own colour each)",
      color: PIPELINE_HUES[0]!,
      n: counts.get("pipeline")!,
    });
  return out;
}

/** The accent of a kind of box (icon, and the tint of its card). */
export const KIND_HUE: Record<string, string> = {
  person: "#f0abfc",
  softwareSystem: "#60a5fa",
  container: "#2dd4bf",
  component: "#a78bfa",
  stage: "#c4b5fd",
  file: "#86efac",
};

/**
 * The pipeline colour of the stages of a connection's inside view, getting stronger along the pipeline so the
 * order can be seen: the first stage is the palest, the last the fullest.
 */
export function stageAccent(relationshipId: string, index: number, count: number): { color: string; strength: number } {
  return {
    color: pipelineColor(relationshipId),
    strength: count <= 1 ? 1 : 0.55 + (0.45 * index) / (count - 1),
  };
}
