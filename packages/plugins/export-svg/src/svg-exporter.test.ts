import { describe, expect, it } from "vitest";
import { contractSampleModel, runExporterContract } from "@designperspectives/contracts/testing";
import type { ComputedView, ExportInput, ViewNode } from "@designperspectives/contracts";
import plugin, { SvgExporter } from "./index.js";
import { midpoint } from "./render.js";
import { clampLines, wrapText } from "./text.js";

function node(id: string, kind: string, x: number, y: number, extra: Partial<ViewNode> = {}): ViewNode {
  const e = contractSampleModel().elements.find((el) => el.id === id)!;
  return {
    id,
    kind,
    title: e.title,
    ...(e.description ? { description: e.description } : {}),
    ...(e.technology ? { technology: e.technology } : {}),
    isBoundary: false,
    x,
    y,
    width: 220,
    height: 140,
    ...extra,
  };
}

/** Hand-made container view of the contract sample (positions invented for the test). */
function containerView(): ComputedView {
  return {
    id: "containers",
    type: "container",
    title: "Container View: Internet Banking System",
    scope: "ibs",
    width: 1000,
    height: 760,
    nodes: [
      node("corebanking", "softwareSystem", 760, 560),
      node("customer", "person", 300, 20),
      node("ibs", "softwareSystem", 40, 220, { isBoundary: true, width: 640, height: 520 }),
      node("ibs.api", "container", 80, 260, { parent: "ibs" }),
      node("ibs.db", "dataStore", 80, 560, { parent: "ibs" }),
      node("ibs.spa", "container", 420, 260, { parent: "ibs" }),
    ],
    edges: [
      { id: "customer->ibs.spa#calls", source: "customer", target: "ibs.spa", label: "Views account balances and makes payments using", kind: "calls", async: false, points: [[410, 160], [470, 210], [530, 260]] },
      { id: "ibs.api->corebanking#publishesTo", source: "ibs.api", target: "corebanking", label: "Publishes payment events to", technology: "AMQP", kind: "publishesTo", async: true, points: [[300, 330], [700, 450], [760, 600]] },
      { id: "ibs.spa->ibs.api#calls", source: "ibs.spa", target: "ibs.api", label: "Makes API calls to", technology: "JSON/HTTPS", kind: "calls", async: false, points: [[420, 330], [360, 330], [300, 330]] },
    ],
  };
}

const input = (): ExportInput => ({ model: contractSampleModel(), views: [containerView()], workspaceName: "Internet Banking" });

runExporterContract(() => new SvgExporter(), input);

/** Minimal well-formedness check: balanced tags, no stray markup characters, only known entities. */
function assertWellFormed(svg: string): void {
  const body = svg.replace(/^<\?xml[^?]*\?>\n/, "");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    expect(body.slice(last, m.index)).not.toMatch(/[<>]/);
    last = m.index + m[0].length;
    if (m[4]) continue;
    if (m[1]) expect(stack.pop()).toBe(m[2]);
    else stack.push(m[2]!);
  }
  expect(body.slice(last)).not.toMatch(/[<>]/);
  expect(stack).toEqual([]);
  expect(body).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
  expect(body.startsWith("<svg ")).toBe(true);
}

function elementsWith(svg: string, attr: string): string[] {
  return [...svg.matchAll(/<[a-z]+ [^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`${attr}=`));
}

describe("SVG exporter", () => {
  const [file] = new SvgExporter().export(input());
  const svg = file!.content;

  it("declares the plug-in manifest and writes svg/<view-id>.svg", () => {
    expect(plugin.manifest.id).toBe("@designperspectives/plugin-export-svg");
    expect(plugin.exporters?.[0]?.needsLayout).toBe(true);
    expect(file!.path).toBe("svg/containers.svg");
  });

  it("is well-formed XML with title, role and aria-label", () => {
    assertWellFormed(svg);
    expect(svg).toContain("<title>Container View: Internet Banking System</title>");
    expect(svg).toContain('role="img" aria-label="Container View: Internet Banking System"');
    expect(svg).toContain('font-family="Helvetica, Arial, sans-serif"');
    expect(svg.endsWith("</svg>\n")).toBe(true);
  });

  it("shows every node title, kind labels and the boundary label", () => {
    for (const n of containerView().nodes) expect(svg).toContain(n.title);
    expect(svg).toContain("[Container: Java and Spring Boot]");
    expect(svg).toContain("[Data store: MySQL database schema]");
    expect(svg).toContain(">Internet Banking System [Software system]</text>");
    expect(svg).toContain('class="shape person-head"');
    expect(svg).toContain('class="shape data-store-top"');
  });

  it("generates a key from what the view shows", () => {
    const key = /<g class="key">([\s\S]*?)\n {2}<\/g>/.exec(svg)![1]!;
    expect(key).toContain(">Key</text>");
    expect(key).toContain(">Container</text>");
    expect(key).toContain(">Synchronous relationship (solid line)</text>");
    expect(key).toContain(">Asynchronous relationship (dashed line)</text>");
    expect(key).toContain(">Software system boundary (dashed border)</text>");
    expect(key).not.toContain(">Component</text>");
  });

  it("uses stroke-dasharray only on async edges and boundaries", () => {
    const dashed = elementsWith(svg, "stroke-dasharray");
    expect(dashed.length).toBeGreaterThan(0);
    for (const t of dashed) expect(t).toMatch(/class="[^"]*\b(async|boundary)\b/);
    const edges = elementsWith(svg, "d").filter((t) => t.includes('class="edge '));
    expect(edges).toHaveLength(3);
    expect(edges.filter((t) => t.includes("stroke-dasharray"))).toHaveLength(1);
    expect(edges.find((t) => t.includes("stroke-dasharray"))).toContain('class="edge async"');
  });

  it("writes integer coordinates only", () => {
    for (const m of svg.matchAll(/(?<![\w-])(x|y|cx|cy|r|rx|ry|width|height)="([^"]*)"/g)) expect(m[2]).toMatch(/^-?\d+$/);
    for (const m of svg.matchAll(/points="([^"]*)"/g)) expect(m[1]).toMatch(/^(-?\d+,-?\d+ ?)+$/);
  });

  it("escapes XML special characters", () => {
    const v = containerView();
    v.title = 'Container View: Payments & "Cards" <beta>';
    v.nodes[0]!.title = "Core Banking & Ledger";
    const out = new SvgExporter().export({ ...input(), views: [v] })[0]!.content;
    assertWellFormed(out);
    expect(out).toContain("<title>Container View: Payments &amp; &quot;Cards&quot; &lt;beta&gt;</title>");
    expect(out).toContain("Core Banking &amp; Ledger");
    expect(out).not.toContain("Banking & Ledger");
  });

  it("honours viewIds", () => {
    expect(new SvgExporter().export(input(), { viewIds: ["other"] })).toEqual([]);
  });
});

describe("SVG helpers", () => {
  it("wraps by character count and clamps with an ellipsis", () => {
    expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(clampLines(["aaa", "bbb", "ccc"], 2)).toEqual(["aaa", "bb…"]);
  });
  it("finds the midpoint of a polyline", () => {
    expect(midpoint([[0, 0], [10, 0], [10, 10]])).toEqual([10, 0]);
    expect(midpoint([[0, 0], [0, 20]])).toEqual([0, 10]);
  });
});

describe("edge geometry", () => {
  it("draws Graphviz splines (1 + 3k points) as cubic curves and other point lists as lines", async () => {
    const { edgePathData } = await import("./shapes.js");
    expect(edgePathData([[0, 0], [1, 1], [2, 2], [3, 3]])).toBe("M0,0 C1,1 2,2 3,3");
    expect(edgePathData([[0, 0], [5, 5]])).toBe("M0,0 L5,5");
  });
});
