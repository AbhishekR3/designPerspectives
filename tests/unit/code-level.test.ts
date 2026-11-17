/** The code level shows how its component connects to the others: lines to the file where a call leaves or arrives (set, guessed or not known), the relationship's file fields, and drafts. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { client, demoDir, ok } from "./helpers.js";

const API = "sample_code/api";
const SIGNIN_SECURITY = "sign-in-controller--security-component";

const edgeOf = (d: any, id: string) => d.edges.find((e: any) => e.id === id);
const files = (d: any) => d.nodes.filter((n: any) => n.kind === "file").map((n: any) => n.name);

describe("code diagram: lines to the other parts of the model", () => {
  it("draws a line set by hand, solid, from the file where the call leaves to the other box", async () => {
    const d = await ok(client().get("/api/diagrams/code-sign-in-controller"));
    expect(files(d)).toEqual(["sign_in.py", "security.py", "store.py"]);
    const e = edgeOf(d, SIGNIN_SECURITY);
    expect(e).toMatchObject({ source: `file:${API}/sign_in.py`, target: "security-component", codeEnd: "set", derived: false, relationshipIds: [SIGNIN_SECURITY], description: "Uses" });
    // the other end is an ordinary element box, marked as outside the code shown
    const other = d.nodes.find((n: any) => n.id === "security-component");
    expect(other).toMatchObject({ kind: "component", name: "Security Component", inScope: false, outside: true });
    // style: a set line has no default dash
    expect(e.style.strokeStyle).toBeUndefined();
  });

  it("draws the arriving end at the file set on the relationship", async () => {
    const d = await ok(client().get("/api/diagrams/code-security-component"));
    const e = edgeOf(d, SIGNIN_SECURITY);
    expect(e).toMatchObject({ source: "sign-in-controller", target: `file:${API}/security.py`, codeEnd: "set" });
    // a node id never clashes with a file id
    expect(new Set(d.nodes.map((n: any) => n.id)).size).toBe(d.nodes.length);
  });

  it("guesses the file from imports and draws that line dashed", async () => {
    const c = client();
    // Accounts Summary Controller -> Mainframe Banking System Facade: accounts.py imports mainframe_facade.py
    const out = await ok(c.get("/api/diagrams/code-accounts-summary-controller"));
    const leaving = out.edges.find((e: any) => e.target === "mainframe-banking-system-facade");
    expect(leaving).toMatchObject({ source: `file:${API}/accounts.py`, codeEnd: "guessed" });
    expect(leaving.style.strokeStyle).toBe("dashed");
    const arriving = (await ok(c.get("/api/diagrams/code-mainframe-banking-system-facade"))).edges.find((e: any) => e.source === "accounts-summary-controller");
    expect(arriving).toMatchObject({ target: `file:${API}/mainframe_facade.py`, codeEnd: "guessed" });
  });

  it("ends a line on the component's own box when no file is known", async () => {
    const d = await ok(client().get("/api/diagrams/code-sign-in-controller"));
    const fromSpa = d.edges.find((e: any) => e.source === "single-page-application");
    expect(fromSpa).toMatchObject({ target: "sign-in-controller", codeEnd: "unknown" });
    expect(fromSpa.style.strokeStyle).toBe("dotted");
    const own = d.nodes.find((n: any) => n.id === "sign-in-controller");
    expect(own).toMatchObject({ kind: "component", inScope: true, drillKey: null });
    expect(own.description).toMatch(/not set/i);
    // the box is only added when some line needs it: the Mainframe Banking System Facade has none
    expect((await ok(client().get("/api/diagrams/code-mainframe-banking-system-facade"))).nodes.some((n: any) => n.id === "mainframe-banking-system-facade")).toBe(false);
  });

  it("leaves relationship code diagrams and import lines as they were", async () => {
    const d = await ok(client().get("/api/diagrams/code-sign-in-controller"));
    const imports = d.edges.filter((e: any) => e.id.startsWith("file:"));
    expect(imports.map((e: any) => `${e.source.split("/").pop()}>${e.target.split("/").pop()}`).sort()).toEqual(["security.py>store.py", "sign_in.py>security.py"]);
    expect(imports.every((e: any) => e.codeEnd === undefined)).toBe(true);
  });

  it("falls back to a guess when the chosen file is not in the diagram, and ignores shared helpers", async () => {
    const dir = demoDir();
    const c = client(dir);
    // A common file that both components map and import must not decide where a line goes.
    fs.writeFileSync(path.join(dir, API, "common.py"), "VALUE = 1\n");
    const signIn = path.join(dir, API, "sign_in.py");
    fs.writeFileSync(signIn, "from .common import VALUE\n" + fs.readFileSync(signIn, "utf-8")); // the helper is imported first
    fs.appendFileSync(path.join(dir, API, "security.py"), "from .common import VALUE\n");
    await ok(c.patch("/api/elements/sign-in-controller", { codePaths: [`${API}/sign_in.py`, `${API}/security.py`, `${API}/store.py`, `${API}/common.py`] }));
    await ok(c.patch("/api/elements/security-component", { codePaths: [`${API}/security.py`, `${API}/store.py`, `${API}/common.py`] }));
    await ok(c.patch(`/api/relationships/${SIGNIN_SECURITY}`, { codeFrom: "", codeTo: "" }));
    const d = await ok(c.get("/api/diagrams/code-sign-in-controller"));
    // sign_in.py imports security.py (used by nobody on the security side); common.py is shared and imported by both
    expect(edgeOf(d, SIGNIN_SECURITY)).toMatchObject({ source: `file:${API}/sign_in.py`, codeEnd: "guessed" });
  });
});

describe("the relationship's file fields", () => {
  it("are set and cleared through the relationship patch and read back in the summary", async () => {
    const c = client();
    const rel = async () => (await ok(c.get("/api/state"))).relationships.find((r: any) => r.id === SIGNIN_SECURITY);
    expect(await rel()).toMatchObject({ codeFrom: `${API}/sign_in.py`, codeTo: `${API}/security.py` });
    await ok(c.patch(`/api/relationships/${SIGNIN_SECURITY}`, { codeTo: `${API}/store.py` }));
    expect(await rel()).toMatchObject({ codeFrom: `${API}/sign_in.py`, codeTo: `${API}/store.py` });
    await ok(c.patch(`/api/relationships/${SIGNIN_SECURITY}`, { codeFrom: "", codeTo: "" }));
    expect(await rel()).toMatchObject({ codeFrom: "", codeTo: "" });
  });

  it("refuse a file outside that end's code, a bad path, and an end with no code, in plain words", async () => {
    const c = client();
    const patch = (body: object) => c.patch(`/api/relationships/${SIGNIN_SECURITY}`, body);
    // accounts.py belongs to another component, not to the Sign In Controller (the source)
    const outside = await patch({ codeFrom: `${API}/accounts.py` });
    expect(outside.status).toBe(422);
    expect(outside.json().detail).toMatch(/not in the code of "Sign In Controller"/);
    expect((await patch({ codeTo: `${API}/sign_in.py` })).status).toBe(422); // not in the Security Component's code
    for (const bad of ["../x.py", "/etc/passwd", `${API}/../../x.py`, ".git/config"]) expect((await patch({ codeFrom: bad })).status, bad).toBe(422);
    // an end with no code paths has no file to choose
    const spaToSignin = "single-page-application--sign-in-controller";
    const none = await c.patch(`/api/relationships/${spaToSignin}`, { codeFrom: `${API}/sign_in.py` });
    expect(none.status).toBe(422);
    expect(none.json().detail).toMatch(/has no code paths yet/);
    // a refused patch changes nothing
    expect((await ok(c.get("/api/state"))).relationships.find((r: any) => r.id === SIGNIN_SECURITY)).toMatchObject({ codeFrom: `${API}/sign_in.py` });
  });

  it("lists the files behind an element's code paths, for the choices", async () => {
    const r = await ok(client().get("/api/code/files", { owner: "sign-in-controller" }));
    expect(r.files).toEqual([`${API}/sign_in.py`, `${API}/security.py`, `${API}/store.py`]);
    expect((await client().get("/api/code/files", { owner: "nope" })).status).toBe(404);
  });
});

describe("in a draft", () => {
  it("shows a change of the file as a relationship change, and as a changed line on the code diagram", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Arrive in store" }));
    const d = c.at(`draft:${id}`);
    await ok(d.patch(`/api/relationships/${SIGNIN_SECURITY}`, { codeTo: `${API}/store.py` }));
    const cs = await ok(c.at(`draft:${id}`, "base").get("/api/changes"));
    const change = cs.relationships.find((r: any) => r.id === SIGNIN_SECURITY);
    expect(change.change).toBe("changed");
    expect(change.fields).toEqual([{ field: "codeTo", label: "Arrives at file", before: `${API}/security.py`, after: `${API}/store.py` }]);
    // the line of the Security Component's code diagram now ends at another file: marked changed
    const diagram = await ok(c.at(`draft:${id}`, "base").get("/api/diagrams/code-security-component"));
    expect(edgeOf(diagram, SIGNIN_SECURITY)).toMatchObject({ target: `file:${API}/store.py`, change: "changed" });
    // the coding plan lists it as a model note, not as something to build
    const plan = await ok(c.get(`/api/drafts/${id}/plan`));
    const item = plan.items.find((i: any) => i.id === `rel:${SIGNIN_SECURITY}:doc`);
    expect(item).toBeTruthy();
    expect(item.details.join(" ")).toContain("Arrives at file");
  });
});
