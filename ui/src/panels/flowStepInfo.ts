import type { AppState, ElementSummary, Flow, FlowStep, Relationship, WorkItem } from "../../../src/shared/types.js";

/** What one flow step means for a reader: who sends and receives, what data moves, from and to which files, and the details of the connection. Pure, so the panel, the step list and the player card agree. */

export interface StepEnd {
  id: string;
  name: string;
  kind: string;
  /** The element's technologies, or its single technology text. */
  technology: string;
  /** The file where the data leaves (sender) or arrives (receiver), or "". */
  file: string;
  /** The code diagram of this end can be opened (the element has code paths and is not a person). */
  codeKey: string | null;
}

export interface StepData {
  /** The sample, or "". */
  example: string;
  format: string;
  /** "step" (set on the step), "relationship" (the relationship's own sample), "stage" (a connector stage's output), or "" when nothing is recorded. */
  from: "step" | "relationship" | "stage" | "";
  /** A short text for one line: the format and the main fields, or the first words. */
  summary: string;
}

export interface StepLink {
  /** 1-based step number. */
  step: number;
  /** What came in / goes on, in a few words. */
  summary: string;
}

export interface StepInfo {
  /** 1-based. */
  number: number;
  total: number;
  response: boolean;
  rel: Relationship;
  text: string;
  sender: StepEnd;
  receiver: StepEnd;
  output: StepData;
  input: StepData;
  /** The nearest earlier step that delivered data to this step's sender. */
  cameIn: StepLink | null;
  /** The nearest later step that leaves from this step's receiver. */
  goesOn: StepLink | null;
  technologies: string[];
  endpoints: string[];
  dataAccess: { asset: string; mode: "read" | "write"; owner: string }[];
  stages: { count: number; names: string[] };
  sensitive: { item: string; level: string }[];
  openWork: WorkItem[];
  notes: string;
}

/** The last part of a file path. */
export const baseName = (p: string): string => p.replace(/\/+$/, "").split("/").pop() ?? p;

/** One line about a sample: its format and the first field names (JSON) or the first words (other text). */
export function summarizeData(example: string, format: string): string {
  const text = example.trim();
  let body = "";
  if (text) {
    try {
      const v: unknown = JSON.parse(text);
      if (Array.isArray(v)) {
        const first = v[0];
        const keys = first && typeof first === "object" && !Array.isArray(first) ? Object.keys(first as object) : [];
        body = `${v.length} item${v.length === 1 ? "" : "s"}${keys.length ? ` of ${fieldList(keys)}` : ""}`;
      } else if (v && typeof v === "object") {
        body = fieldList(Object.keys(v as object));
      } else {
        body = clip(String(v), 40);
      }
    } catch {
      body = clip(text.replace(/\s+/g, " "), 40);
    }
  }
  return [format, body].filter(Boolean).join(" · ");
}

function fieldList(keys: string[]): string {
  if (!keys.length) return "{}";
  return `{${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""}}`;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const looksJson = (t: string) => /^\s*[[{]/.test(t);

function dataOf(example: string | undefined, format: string | undefined, from: StepData["from"]): StepData {
  const ex = example ?? "";
  const fmt = format || (ex && looksJson(ex) ? "JSON" : "");
  if (!ex && !fmt) return { example: "", format: "", from: "", summary: "" };
  return { example: ex, format: fmt, from: ex ? from : "", summary: summarizeData(ex, fmt) };
}

/** Which end (source or destination of the relationship) sends in this step: a response travels back, from the destination to the source. */
export function stepEnds(rel: Pick<Relationship, "sourceId" | "destinationId">, response: boolean): { senderId: string; receiverId: string } {
  return response ? { senderId: rel.destinationId, receiverId: rel.sourceId } : { senderId: rel.sourceId, receiverId: rel.destinationId };
}

/** The data leaving the sender, and the data reaching the receiver. A request through a connector with stages is changed on the way: it leaves as the first stage's input and arrives as the last stage's output. */
export function stepData(step: Pick<FlowStep, "example" | "format" | "response">, rel: Pick<Relationship, "example" | "format" | "stages">): { output: StepData; input: StepData } {
  const output = step.example || step.format ? dataOf(step.example, step.format || rel.format, "step") : dataOf(rel.example, rel.format, "relationship");
  const lastStage = step.response ? undefined : [...rel.stages].reverse().find((s) => s.example || s.format);
  const input = lastStage ? dataOf(lastStage.example, lastStage.format, "stage") : output;
  return { output, input };
}

function endOf(el: ElementSummary | undefined, id: string, file: string): StepEnd {
  return {
    id,
    name: el?.name ?? id,
    kind: el?.kind ?? "",
    technology: el ? (el.technologies.length ? el.technologies.join(", ") : el.technology) : "",
    file,
    codeKey: el && el.kind !== "person" && el.codePaths.length > 0 ? `code-${el.id}` : null,
  };
}

/** Everything the step view shows for step `index` (0-based) of `flow`, or null when the step or its relationship does not exist. */
export function stepInfo(state: Pick<AppState, "elements" | "relationships">, flow: Pick<Flow, "steps">, index: number): StepInfo | null {
  const step = flow.steps[index];
  const rel = step && state.relationships.find((r) => r.id === step.relationshipId);
  if (!step || !rel) return null;
  const el = (id: string) => state.elements.find((e) => e.id === id);
  const { senderId, receiverId } = stepEnds(rel, step.response);
  // The "from" file belongs to the relationship's source end, the "to" file to its destination end.
  const sender = endOf(el(senderId), senderId, step.response ? rel.codeTo : rel.codeFrom);
  const receiver = endOf(el(receiverId), receiverId, step.response ? rel.codeFrom : rel.codeTo);
  const { output, input } = stepData(step, rel);

  const dataOnStep = (i: number) => {
    const s = flow.steps[i];
    const r = s && state.relationships.find((x) => x.id === s.relationshipId);
    return s && r ? { ends: stepEnds(r, s.response), data: stepData(s, r) } : null;
  };
  let cameIn: StepLink | null = null;
  for (let i = index - 1; i >= 0 && !cameIn; i--) {
    const p = dataOnStep(i);
    if (p?.ends.receiverId === senderId) cameIn = { step: i + 1, summary: p.data.input.summary };
  }
  let goesOn: StepLink | null = null;
  for (let i = index + 1; i < flow.steps.length && !goesOn; i++) {
    const n = dataOnStep(i);
    if (n?.ends.senderId === receiverId) goesOn = { step: i + 1, summary: n.data.output.summary };
  }

  const ownerOf = (asset: string) => {
    const owner = [el(rel.destinationId), el(rel.sourceId)].find((e) => e?.data.some((d) => d.name === asset));
    return owner?.name ?? "";
  };
  return {
    number: index + 1,
    total: flow.steps.length,
    response: step.response,
    rel: rel as Relationship,
    text: step.description || rel.description,
    sender,
    receiver,
    output,
    input,
    cameIn,
    goesOn,
    technologies: rel.technologies,
    endpoints: rel.endpoints.map((e) => `${e.method} ${e.path}`),
    dataAccess: rel.dataAccess.map((a) => ({ asset: a.asset, mode: a.mode, owner: ownerOf(a.asset) })),
    stages: { count: rel.stages.length, names: rel.stages.map((s) => s.name) },
    sensitive: rel.sensitive,
    openWork: rel.work.filter((w) => w.status !== "done"),
    notes: rel.notes,
  };
}

/** The one-line summary under a step in the list: "JSON · POST /api/payments · sign_in.py → security.py". Empty when there is nothing to say. */
export function stepSummaryLine(info: StepInfo): string {
  const parts: string[] = [];
  const data = info.output.format || info.input.format;
  if (data) parts.push(data);
  else if (info.output.summary) parts.push(info.output.summary);
  if (info.endpoints.length) parts.push(info.endpoints[0] + (info.endpoints.length > 1 ? ` +${info.endpoints.length - 1}` : ""));
  const a = info.sender.file && baseName(info.sender.file);
  const b = info.receiver.file && baseName(info.receiver.file);
  if (a && b) parts.push(`${a} → ${b}`);
  else if (a) parts.push(`from ${a}`);
  else if (b) parts.push(`to ${b}`);
  return parts.join(" · ");
}
