import { describe, expect, it } from "vitest";
import { contractSampleModel, runExporterContract } from "@designperspectives/contracts/testing";
import type { Model } from "@designperspectives/contracts";
import plugin, { MermaidExporter } from "./index.js";
import { escapeLabel, mermaidIds } from "./render.js";

runExporterContract(() => new MermaidExporter(), () => ({ model: contractSampleModel(), views: [], workspaceName: "Internet Banking" }));

function withExtras(): Model {
  const m = contractSampleModel();
  m.elements.push({ id: "mail", kind: "softwareSystem", title: "E-mail System", description: "The \"internal\" e-mail system." });
  m.relationships.push({ source: "ibs.api", target: "mail", kind: "sendsTo", label: "Sends e-mail using", technology: "SMTP" });
  m.views.push({ id: "landscape", type: "landscape", title: "System Landscape View: Bank", include: ["*"] });
  m.views.push({ id: "signin", type: "dynamic", title: "Dynamic View: sign in", scope: "ibs", include: [], steps: [{ source: "customer", target: "ibs.spa", label: "Signs in using" }, { source: "ibs.spa", target: "ibs.api.security", label: "Makes sign-in API calls to", technology: "JSON/HTTPS" }] });
  m.views.push({ id: "live", type: "deployment", title: "Deployment View: Internet Banking System (Live)", environment: "live", include: ["*"] });
  return m;
}

function exportAll(model: Model): Map<string, string> {
  const files = new MermaidExporter().export({ model, views: [], workspaceName: "Internet Banking" });
  return new Map(files.map((f) => [f.path, f.content]));
}

function nodeIds(text: string): string[] {
  return [...text.matchAll(/^\s+([A-Za-z0-9_]+)(?:\[\(|\[|\()"/gm)].map((m) => m[1]!);
}

describe("Mermaid exporter", () => {
  const files = exportAll(withExtras());
  const containers = files.get("mermaid/containers.mmd")!;

  it("declares the plug-in manifest", () => {
    expect(plugin.manifest.id).toBe("@designperspectives/plugin-export-mermaid");
    expect(plugin.manifest.provides).toEqual(["Exporter"]);
    expect(plugin.exporters?.[0]?.format).toBe("mermaid");
  });

  it("writes one .mmd per view with front matter title, comment and flowchart header", () => {
    expect([...files.keys()].sort()).toEqual(["mermaid/api-components.mmd", "mermaid/containers.mmd", "mermaid/context.mmd", "mermaid/landscape.mmd", "mermaid/live.mmd", "mermaid/signin.mmd"]);
    expect(containers.startsWith('---\ntitle: "Container View: Internet Banking System"\n---\n%% Container View: Internet Banking System\nflowchart LR\n')).toBe(true);
    expect(containers.endsWith("\n") && !containers.endsWith("\n\n")).toBe(true);
  });

  it("draws the scope system as a subgraph containing its containers", () => {
    const sub = /subgraph ibs\["Internet Banking System \[Software system\]"\]\n([\s\S]*?)\n {2}end/.exec(containers);
    expect(sub).not.toBeNull();
    const body = sub![1]!;
    for (const id of ["ibs_spa", "ibs_api", "ibs_db"]) expect(body).toContain(`    ${id}`);
    expect(body).not.toContain("customer");
    expect(containers).toContain('ibs_db[("Database<br/>[Data store: MySQL database schema]<br/>Stores user credentials.")]');
    expect(containers).toContain('customer("Personal Banking Customer<br/>[Person]<br/>');
  });

  it("uses dashed arrows for async relationships and solid for sync, with technology in labels", () => {
    expect(containers).toContain('ibs_api -.->|"Sends e-mail using [SMTP]"| mail');
    expect(containers).toContain('ibs_spa -->|"Makes API calls to [JSON/HTTPS]"| ibs_api');
  });

  it("uses unique, safe node ids", () => {
    for (const text of files.values()) {
      const ids = nodeIds(text);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_]+$/);
    }
    expect(mermaidIds(["a.b", "a-b", "end"])).toEqual(new Map([["a-b", "a_b"], ["a.b", "a_b_2"], ["end", "end_1"]]));
  });

  it("lifts relationships to visible ancestors and keeps the first label per pair", () => {
    const context = files.get("mermaid/context.mmd")!;
    expect(context).not.toContain("subgraph");
    expect(context).toContain('ibs -->|"Gets account information from, and makes payments using"| corebanking');
    expect(context.match(/ibs --> *\|[^\n]*\| corebanking/g)).toHaveLength(1);
    expect(context).toContain("ibs -.->|\"Sends e-mail using [SMTP]\"| mail");
  });

  it("shows siblings of the scope container in a component view", () => {
    const comp = files.get("mermaid/api-components.mmd")!;
    expect(comp).toMatch(/subgraph ibs_api\["API Application \[Container\]"\]\n {4}ibs_api_security\[/);
    expect(comp).toContain('ibs_spa -->|"Makes sign-in API calls to [JSON/HTTPS]"| ibs_api_security');
    expect(comp).toContain('ibs_api_security -->|"Reads credentials from [SQL/TCP]"| ibs_db');
  });

  it("renders landscape, dynamic and deployment views", () => {
    const land = files.get("mermaid/landscape.mmd")!;
    expect(nodeIds(land)).toEqual(["corebanking", "customer", "ibs", "mail"]);
    const dyn = files.get("mermaid/signin.mmd")!;
    expect(dyn).toContain('customer -->|"1. Signs in using"| ibs_spa');
    expect(dyn).toContain('ibs_spa -->|"2. Makes sign-in API calls to [JSON/HTTPS]"| ibs_api_security');
    const live = files.get("mermaid/live.mmd")!;
    expect(live).toMatch(/subgraph live_dc\["Bank data centre \[Deployment node: Data centre\]"\]\n {4}subgraph live_dc_app\[/);
    expect(live).toContain('live_dc_app_api["API Application<br/>[Container: Java and Spring Boot]');
  });

  it("escapes quotes and other label-breaking characters", () => {
    expect(files.get("mermaid/landscape.mmd")).toContain("The #quot;internal#quot; e-mail system.");
    expect(escapeLabel('a "b" <c> #d | e')).toBe("a #quot;b#quot; #lt;c#gt; #35;d #124; e");
  });

  it("honours explicit include and exclude predicates", () => {
    const m = contractSampleModel();
    m.views = [{ id: "c", type: "container", title: "Container View: IBS", scope: "ibs", include: ["*", "ibs.api.*"], exclude: ["corebanking"] }];
    const text = exportAll(m).get("mermaid/c.mmd")!;
    expect(nodeIds(text)).toEqual(["customer", "ibs_api", "ibs_api_security", "ibs_db", "ibs_spa"]);
  });

  it("honours viewIds", () => {
    const files = new MermaidExporter().export({ model: withExtras(), views: [], workspaceName: "x" }, { viewIds: ["context"] });
    expect(files.map((f) => f.path)).toEqual(["mermaid/context.mmd"]);
  });
});
