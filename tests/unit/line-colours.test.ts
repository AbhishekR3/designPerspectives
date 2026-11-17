/** The colours a diagram has by itself (ui/src/lineColours.ts): lines by connection kind or technology, a pipeline's own hue, summary lines, and the legend. */
import { describe, expect, test } from "vitest";
import { CONNECTION_LOOK, PIPELINE_HUES, autoLine, kindOfLine, lineLegend, pipelineColor, relationshipKinds, stageAccent } from "../../ui/src/lineColours.js";
import type { Diagram } from "../../src/shared/types.js";

const landscape = {
  level: "container",
  connector: undefined,
} as unknown as Diagram;
const edge = (over: Record<string, unknown> = {}) =>
  ({
    id: "r1",
    kind: "",
    technologies: [],
    stageCount: 0,
    derived: false,
    relationshipIds: ["r1"],
    ...over,
  }) as never;

describe("kindOfLine", () => {
  test("a kind that is set wins over the technology", () => {
    expect(kindOfLine("batch", ["JSON/HTTPS"])).toBe("batch");
  });
  test("a technology that names a well-known one gives a kind", () => {
    expect(kindOfLine("", ["JSON/HTTPS"])).toBe("sync-api");
    expect(kindOfLine("", ["SQL/TCP"])).toBe("db-connection");
    expect(kindOfLine("", ["Redis protocol"])).toBe("db-connection");
    expect(kindOfLine("", ["SFTP", "Node.js"])).toBe("file-transfer");
  });
  test("a message queue is not taken for an API because of JSON", () => {
    expect(kindOfLine("", ["Kafka", "JSON"])).toBe("async-message");
    expect(kindOfLine("", ["MQ"])).toBe("async-message");
  });
  test("an unknown technology and no technology give no kind", () => {
    expect(kindOfLine("", ["Telephone"])).toBe("");
    expect(kindOfLine("", [])).toBe("");
    expect(kindOfLine("not-a-kind", [])).toBe("");
  });
});

describe("pipelineColor", () => {
  test("the same ID always has the same colour, from the palette", () => {
    expect(pipelineColor("a--b")).toBe(pipelineColor("a--b"));
    expect(PIPELINE_HUES).toContain(pipelineColor("a--b"));
  });
  test("different IDs do not all share one colour", () => {
    const colours = new Set(["a--b", "b--c", "c--d", "d--e", "e--f", "f--g"].map(pipelineColor));
    expect(colours.size).toBeGreaterThan(2);
  });
});

describe("autoLine", () => {
  test("a line takes the colour of its kind, with a pattern for kinds that have one", () => {
    expect(autoLine(edge({ kind: "sync-api" }), landscape)?.color).toBe(CONNECTION_LOOK["sync-api"]!.color);
    expect(autoLine(edge({ kind: "stream" }), landscape)?.dash).toBe(CONNECTION_LOOK.stream!.dash);
  });
  test("a line with stages has its own pipeline colour, whatever its kind", () => {
    expect(autoLine(edge({ kind: "data-pipeline", stageCount: 3 }), landscape)).toMatchObject({ color: pipelineColor("r1"), group: "pipeline" });
  });
  test("a line with no kind and no known technology stays plain", () => {
    expect(autoLine(edge(), landscape)).toBeNull();
  });
  test("a summary line takes a colour only when every relationship behind it has the same kind", () => {
    const kinds = relationshipKinds([
      { id: "a", kind: "", technologies: ["HTTPS"] },
      { id: "b", kind: "sync-api", technologies: [] },
      { id: "c", kind: "", technologies: ["Kafka"] },
    ]);
    const summary = (ids: string[]) => autoLine(edge({ derived: true, relationshipIds: ids }), landscape, kinds);
    expect(summary(["a", "b"])?.color).toBe(CONNECTION_LOOK["sync-api"]!.color);
    expect(summary(["a", "c"])).toBeNull();
    expect(summary(["zzz"])).toBeNull();
  });
  test("inside a connection every line of it has the connection's colour", () => {
    const inside = {
      level: "connector",
      connector: { relationshipId: "r9" },
    } as unknown as Diagram;
    expect(autoLine(edge({ relationshipIds: ["r9"] }), inside)?.color).toBe(pipelineColor("r9"));
  });
});

describe("stageAccent", () => {
  test("stages get stronger along the pipeline, in the pipeline's colour", () => {
    const first = stageAccent("r9", 0, 4);
    const last = stageAccent("r9", 3, 4);
    expect(first.color).toBe(pipelineColor("r9"));
    expect(first.strength).toBeLessThan(last.strength);
    expect(last.strength).toBe(1);
    expect(stageAccent("r9", 0, 1).strength).toBe(1);
  });
});

describe("lineLegend", () => {
  test("lists each kind present once with its count, pipelines last", () => {
    const d = {
      level: "container",
      edges: [edge({ id: "1", kind: "sync-api" }), edge({ id: "2", technologies: ["HTTPS"] }), edge({ id: "3", kind: "batch", stageCount: 2 }), edge({ id: "4" })],
    } as unknown as Diagram;
    const l = lineLegend(d);
    expect(l.map((i) => [i.key, i.n])).toEqual([
      ["sync-api", 2],
      ["pipeline", 1],
    ]);
  });
});
