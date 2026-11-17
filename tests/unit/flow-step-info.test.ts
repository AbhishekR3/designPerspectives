/** Flow step view (ui/src/panels/flowStepInfo.ts): sender and receiver direction, input and output data, files at the ends, chaining between steps, and the one-line summary. */
import { describe, expect, test } from "vitest";
import { baseName, stepInfo, stepSummaryLine, summarizeData } from "../../ui/src/panels/flowStepInfo.js";
import type { ElementSummary, Flow, Relationship } from "../../src/shared/types.js";

const el = (id: string, over: Partial<ElementSummary> = {}) =>
  ({ id, name: id.toUpperCase(), kind: "container", technology: "", technologies: [], codePaths: [], data: [], ...over }) as unknown as ElementSummary;
const rel = (id: string, sourceId: string, destinationId: string, over: Partial<Relationship> = {}) =>
  ({
    id,
    sourceId,
    destinationId,
    description: `${sourceId} calls ${destinationId}`,
    technologies: [],
    notes: "",
    sensitive: [],
    stages: [],
    work: [],
    codeFrom: "",
    codeTo: "",
    example: "",
    format: "",
    endpoints: [],
    dataAccess: [],
    ...over,
  }) as unknown as Relationship;

const state = {
  elements: [
    el("a", { kind: "person", codePaths: ["x"] }),
    el("b", { technology: "Python", codePaths: ["api/"], data: [{ name: "Accounts", kind: "table" }] as never }),
    el("c", { technologies: ["Postgres", "SQL"] }),
  ],
  relationships: [
    rel("ab", "a", "b", {
      example: '{"username": "alice", "password": "x"}',
      format: "JSON",
      endpoints: [{ method: "POST", path: "/api/sign-in" }],
      codeFrom: "web/login.ts",
      codeTo: "api/sign_in.py",
      technologies: ["HTTPS"],
    }),
    rel("bc", "b", "c", {
      codeFrom: "api/sign_in.py",
      dataAccess: [{ asset: "Accounts", mode: "read" }],
      sensitive: [{ item: "password", level: "high" }],
      work: [
        { type: "issue", title: "Slow", status: "open" },
        { type: "issue", title: "Old", status: "done" },
      ] as never,
    }),
  ],
};
const flow = {
  steps: [
    { relationshipId: "ab", description: "", response: false },
    { relationshipId: "bc", description: "Look the user up", response: false, example: '[{"id": 1, "name": "alice"}]' },
    { relationshipId: "bc", description: "", response: true, example: '{"ok": true}' },
    { relationshipId: "ab", description: "", response: true },
  ],
} as unknown as Flow;

describe("stepInfo", () => {
  test("a request leaves the source and arrives at the destination, with the relationship's data and files", () => {
    const i = stepInfo(state, flow, 0)!;
    expect([i.sender.id, i.receiver.id]).toEqual(["a", "b"]);
    expect(i.output.example).toContain("alice");
    expect(i.output.format).toBe("JSON");
    expect(i.output.from).toBe("relationship");
    expect(i.sender.file).toBe("web/login.ts");
    expect(i.receiver.file).toBe("api/sign_in.py");
    expect(i.endpoints).toEqual(["POST /api/sign-in"]);
    expect(i.sender.codeKey).toBeNull(); // a person has no code diagram
    expect(i.receiver.codeKey).toBe("code-b");
    expect(i.receiver.technology).toBe("Python");
    expect(i.cameIn).toBeNull();
  });

  test("a response travels back: the destination sends and the files swap", () => {
    const i = stepInfo(state, flow, 3)!;
    expect([i.sender.id, i.receiver.id]).toEqual(["b", "a"]);
    expect(i.sender.file).toBe("api/sign_in.py");
    expect(i.receiver.file).toBe("web/login.ts");
  });

  test("a step's own example wins over the relationship's, and the receiver gets the last stage's output", () => {
    const own = stepInfo(state, flow, 1)!;
    expect(own.output.from).toBe("step");
    expect(own.output.summary).toBe("JSON · 1 item of {id, name}");
    expect(own.input).toBe(own.output);
    const staged = {
      ...state,
      relationships: [
        rel("ab", "a", "b", {
          example: "raw",
          stages: [
            { id: "s1", name: "Parse", example: '{"n": 1}' },
            { id: "s2", name: "Store", example: '{"stored": true}', format: "Row" },
          ] as never,
        }),
      ],
    };
    const i = stepInfo(staged, { steps: [{ relationshipId: "ab", description: "", response: false }] } as unknown as Flow, 0)!;
    expect(i.output.example).toBe("raw");
    expect(i.input.example).toBe('{"stored": true}');
    expect(i.input.from).toBe("stage");
    expect(i.stages).toEqual({ count: 2, names: ["Parse", "Store"] });
    const back = stepInfo(staged, { steps: [{ relationshipId: "ab", description: "", response: true }] } as unknown as Flow, 0)!;
    expect(back.input).toBe(back.output); // stages belong to the request
  });

  test("chains to the nearest earlier step that delivered to the sender and the next that leaves the receiver", () => {
    const second = stepInfo(state, flow, 1)!; // b -> c
    expect(second.cameIn).toEqual({ step: 1, summary: "JSON · {username, password}" });
    expect(second.goesOn).toEqual({ step: 3, summary: "JSON · {ok}" }); // c -> b response leaves c
    const response = stepInfo(state, flow, 2)!; // c -> b
    expect(response.cameIn?.step).toBe(2);
    expect(response.goesOn?.step).toBe(4); // b -> a response leaves b
    expect(stepInfo(state, flow, 3)!.goesOn).toBeNull();
  });

  test("details: data access with its owner, sensitive items, only open work, element technologies", () => {
    const i = stepInfo(state, flow, 1)!;
    expect(i.dataAccess).toEqual([{ asset: "Accounts", mode: "read", owner: "B" }]);
    expect(i.sensitive).toHaveLength(1);
    expect(i.openWork.map((w) => w.title)).toEqual(["Slow"]);
    expect(i.receiver.technology).toBe("Postgres, SQL");
    expect(i.text).toBe("Look the user up");
  });

  test("a missing step or relationship gives null", () => {
    expect(stepInfo(state, flow, 9)).toBeNull();
    expect(stepInfo(state, { steps: [{ relationshipId: "zz", description: "", response: false }] } as unknown as Flow, 0)).toBeNull();
  });
});

describe("summaries", () => {
  test("stepSummaryLine joins format, endpoint and files", () => {
    expect(stepSummaryLine(stepInfo(state, flow, 0)!)).toBe("JSON · POST /api/sign-in · login.ts → sign_in.py");
    expect(stepSummaryLine(stepInfo(state, flow, 1)!)).toBe("JSON · from sign_in.py");
    expect(stepSummaryLine(stepInfo({ ...state, relationships: [rel("ab", "a", "b")] }, flow, 0)!)).toBe("");
  });
  test("summarizeData", () => {
    expect(summarizeData("", "")).toBe("");
    expect(summarizeData("[1,2,3]", "")).toBe("3 items");
    expect(summarizeData('{"a":1,"b":2,"c":3,"d":4,"e":5}', "JSON")).toBe("JSON · {a, b, c, d, …}");
    expect(summarizeData("SELECT *\nFROM accounts", "SQL")).toBe("SQL · SELECT * FROM accounts");
  });
  test("baseName", () => {
    expect(baseName("a/b/c.py")).toBe("c.py");
    expect(baseName("c.py")).toBe("c.py");
  });
});
