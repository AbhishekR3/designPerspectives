import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { syncViews } from "../src/core/diagrams.js";
import { syncFlows } from "../src/core/flows.js";
import { stableJson } from "../src/core/util.js";
import { parseSidecar, sidecarData } from "../src/core/sidecar.js";
import { flatten, unflatten } from "../src/core/units.js";
import { dumpWorkspace, parseWorkspace } from "../src/core/workspace.js";
import { demoDir } from "./helpers.js";

function roundTrip(wsText: string, scText: string): [string, string] {
  const { ws, sc } = unflatten(flatten(parseWorkspace(wsText), parseSidecar(scText)));
  syncViews(ws);
  syncFlows(ws);
  return [dumpWorkspace(ws), stableJson(sidecarData(sc))];
}

describe("units", () => {
  it("round-trips the demo model byte for byte", () => {
    const arch = path.join(demoDir(), "architecture");
    const ws = fs.readFileSync(path.join(arch, "workspace.json"), "utf-8");
    const sc = fs.readFileSync(path.join(arch, "designperspectives.json"), "utf-8");
    const [ws2, sc2] = roundTrip(ws, sc);
    expect(ws2).toBe(ws);
    expect(sc2).toBe(sc);
  });

  it("keeps fields it does not know about", () => {
    const data = {
      id: 7,
      name: "W",
      extra: { a: 1 },
      model: {
        people: [{ id: "p", name: "P", tags: "Element,Person", relationships: [{ id: "r", sourceId: "p", destinationId: "s", description: "Uses", custom: true }] }],
        softwareSystems: [{ id: "s", name: "S", tags: "Element,Software System", odd: [1, 2] }],
        deploymentNodes: [{ id: "d", name: "Node" }],
      },
      views: {
        systemLandscapeViews: [
          {
            key: "landscape",
            order: 1,
            elements: [
              { id: "p", x: 10, y: 20 },
              { id: "s", x: 30, y: 40 },
            ],
            relationships: [{ id: "r" }],
          },
        ],
        deploymentViews: [{ key: "dep", elements: [{ id: "d" }] }],
        configuration: { styles: {} },
        containerViews: [{ key: "Custom view", softwareSystemId: "s", order: 2, elements: [{ id: "p" }] }],
      },
    };
    const text = dumpWorkspace(parseWorkspace(JSON.stringify(data)));
    const sc = stableJson(
      sidecarData(parseSidecar(JSON.stringify({ version: 1, other: "x", styles: { p: { fill: "#fff" } }, layouts: { landscape: { sizes: { p: { w: 300, h: 200 } }, note: "n" } } }))),
    );
    const [ws2, sc2] = roundTrip(text, sc);
    expect(ws2).toBe(text);
    expect(sc2).toBe(sc);
  });
});
