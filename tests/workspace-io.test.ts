/** Model I/O: reading and writing Structurizr workspace JSON. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { stableJson } from "../src/core/json.js";
import { emptySidecar, parseSidecar, sidecarData } from "../src/core/sidecar.js";
import { AlreadyExists, initProject } from "../src/core/store.js";
import { errors } from "../src/core/validate.js";
import { dumpWorkspace, parseWorkspace, readWorkspace, toWorkspace } from "../src/core/workspace.js";
import { demoDir, demoWs, tmpDir } from "./helpers.js";

const FOREIGN = () => ({
  id: 42,
  name: "From Structurizr",
  lastModifiedAgent: "structurizr-java/6.2.4",
  configuration: { scope: "SoftwareSystem" },
  documentation: { sections: [] },
  model: {
    people: [
      {
        id: "1",
        name: "User",
        tags: "Element,Person",
        relationships: [{ id: "3", sourceId: "1", destinationId: "2", description: "Uses", interactionStyle: "Synchronous" }],
      },
    ],
    softwareSystems: [{ id: "2", name: "System", tags: "Element,Software System", perspectives: [{ name: "Security", value: "High" }] }],
    deploymentNodes: [{ id: "9", name: "Server", environment: "Live" }],
  },
  views: {
    systemContextViews: [
      {
        key: "SystemContext",
        softwareSystemId: "2",
        elements: [
          { id: "1", x: 0, y: 0 },
          { id: "2", x: 600, y: 0 },
        ],
        relationships: [{ id: "3", vertices: [{ x: 1, y: 2 }] }],
        paperSize: "A5_Landscape",
      },
    ],
    deploymentViews: [{ key: "Deploy", environment: "Live", elements: [{ id: "9" }] }],
    configuration: { styles: { elements: [{ tag: "Person", shape: "Person" }] } },
  },
});

describe("workspace I/O", () => {
  test("unknown fields survive a round trip", () => {
    const again = JSON.parse(dumpWorkspace(toWorkspace(FOREIGN())));
    expect(again.lastModifiedAgent).toBe("structurizr-java/6.2.4");
    expect(again.configuration).toEqual({ scope: "SoftwareSystem" });
    expect(again.model.deploymentNodes[0].environment).toBe("Live");
    expect(again.model.softwareSystems[0].perspectives[0].value).toBe("High");
    expect(again.model.people[0].relationships[0].interactionStyle).toBe("Synchronous");
    const view = again.views.systemContextViews[0];
    expect(view.paperSize).toBe("A5_Landscape");
    expect(view.relationships[0].vertices).toEqual([{ x: 1, y: 2 }]);
    expect(again.views.deploymentViews[0].key).toBe("Deploy");
    expect(again.views.configuration.styles.elements[0].shape).toBe("Person");
  });

  test("foreign workspace is valid", () => {
    expect(errors(toWorkspace(FOREIGN()), emptySidecar())).toEqual([]);
  });

  test("demo round trip is byte identical", () => {
    const p = path.join(demoDir(), "architecture", "workspace.json");
    expect(dumpWorkspace(readWorkspace(p))).toBe(fs.readFileSync(p, "utf-8"));
  });

  test("sidecar round trip is byte identical", () => {
    const p = path.join(demoDir(), "architecture", "designperspectives.json");
    const text = fs.readFileSync(p, "utf-8");
    expect(stableJson(sidecarData(parseSidecar(text)))).toBe(text);
  });

  test("demo is valid", () => {
    const dir = demoDir();
    const sc = parseSidecar(fs.readFileSync(path.join(dir, "architecture", "designperspectives.json"), "utf-8"));
    expect(errors(demoWs(dir), sc)).toEqual([]);
  });

  test("empty project", () => {
    const d = tmpDir();
    initProject(d, { demo: false, name: "Mine" });
    expect(JSON.parse(fs.readFileSync(path.join(d, "architecture", "workspace.json"), "utf-8"))).toEqual({ name: "Mine", model: {}, views: {} });
  });

  test("init never overwrites", () => {
    const d = demoDir();
    expect(() => initProject(d)).toThrow(AlreadyExists);
  });

  test("output is stable and readable", () => {
    const text = fs.readFileSync(path.join(demoDir(), "architecture", "workspace.json"), "utf-8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"id": "internet-banking-system"'); // readable IDs
    expect(text).toContain("\n  "); // indented
  });

  test("demo copies the sample code", () => {
    const d = demoDir();
    expect(fs.existsSync(path.join(d, "sample_code", "api", "sign_in.py"))).toBe(true);
  });

  test("malformed files are refused with a readable message", () => {
    expect(() => parseWorkspace("{")).toThrow(/Not valid JSON/);
    expect(() => parseWorkspace('{"name": "x"}')).toThrow(/model/);
    expect(() => parseWorkspace('{"name": "x", "model": {"people": [{"id": "a"}]}, "views": {}}')).toThrow(/name/);
  });
});
