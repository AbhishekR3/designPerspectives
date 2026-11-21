/** Comments, ideas and questions on elements, relationships and diagrams (REC-01). */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMMENT_MAX, CommentStore, MAX_FILE_BYTES, parseComments } from "../../src/core/comments.js";
import { ModelError } from "../../src/core/modelEdits.js";
import { stableJson } from "../../src/core/util.js";
import { client, demoDir, ok, tmpDir, type TestUser } from "./helpers.js";

const target = { type: "element", id: "api-application" };
const post = (c: ReturnType<typeof client>, body: object) => c.post("/api/comments", body);

describe("comment threads", () => {
  it("starts empty, adds, replies, resolves, reopens and deletes", async () => {
    const dir = demoDir();
    const c = client(dir);
    expect((await ok(c.get("/api/comments"))).threads).toEqual([]);
    expect(fs.existsSync(path.join(dir, "architecture", "comments.json"))).toBe(false);

    const t = await ok(post(c, { kind: "question", target, diagram: "containers-internet-banking", text: "  Why not a queue here?  ", author: "Sam" }));
    expect(t).toMatchObject({ kind: "question", target, author: "Sam", text: "Why not a queue here?", status: "open", replies: [], diagram: "containers-internet-banking" });
    expect(t.missing).toBeUndefined();

    const r = await ok(c.post(`/api/comments/${t.id}/replies`, { text: "Latency.", author: "Kim" }));
    expect(r.replies).toMatchObject([{ author: "Kim", text: "Latency." }]);

    const done = await ok(c.patch(`/api/comments/${t.id}`, { status: "resolved", author: "Kim" }));
    expect(done).toMatchObject({ status: "resolved", resolvedBy: "Kim" });
    const again = await ok(c.patch(`/api/comments/${t.id}`, { status: "open" }));
    expect(again.status).toBe("open");
    expect(again.resolvedBy).toBeUndefined();

    const edited = await ok(c.patch(`/api/comments/${t.id}`, { text: "Why not a queue?", kind: "idea" }));
    expect(edited).toMatchObject({ text: "Why not a queue?", kind: "idea" });

    const gone = await ok(c.delete(`/api/comments/${t.id}/replies/${r.replies[0].id}`));
    expect(gone.replies).toEqual([]);
    await ok(c.delete(`/api/comments/${t.id}`));
    expect((await ok(c.get("/api/comments"))).threads).toEqual([]);
  });

  it("is kept in architecture/comments.json, with a stable layout, and survives a restart", async () => {
    const dir = demoDir();
    const t = await ok(post(client(dir), { kind: "idea", target: { type: "diagram", id: "landscape" }, text: "Show the mainframe", author: "Sam" }));
    const file = path.join(dir, "architecture", "comments.json");
    const disk = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(Object.keys(disk.threads[0])).toEqual(["id", "kind", "target", "author", "at", "text", "status"]);
    expect((await ok(client(dir).get("/api/comments"))).threads.map((x: any) => x.id)).toEqual([t.id]);
  });

  it("flags what the shown version no longer has", async () => {
    const c = client(demoDir());
    await ok(post(c, { kind: "comment", target: { type: "element", id: "nope" }, text: "orphan" }));
    await ok(post(c, { kind: "comment", target: { type: "diagram", id: "no-such-diagram" }, text: "orphan too" }));
    await ok(post(c, { kind: "comment", target: { type: "relationship", id: "nope" }, text: "and this" }));
    await ok(post(c, { kind: "comment", target, text: "fine" }));
    const threads = (await ok(c.get("/api/comments"))).threads;
    expect(threads.map((t: any) => !!t.missing)).toEqual([true, true, true, false]);
  });

  it("refuses bad input with a message", async () => {
    const c = client(demoDir());
    for (const [body, msg] of [
      [{ kind: "comment", target, text: "   " }, /empty/],
      [{ kind: "comment", target, text: "x".repeat(COMMENT_MAX + 1) }, /at most/],
      [{ kind: "rant", target, text: "hi" }, /kind must be/],
      [{ kind: "comment", target: { type: "planet", id: "x" }, text: "hi" }, /needs a target/],
      [{ kind: "comment", text: "hi" }, /needs a target/],
      [{ kind: "comment", target, text: "hi", author: "x".repeat(81) }, /at most 80/],
    ] as [object, RegExp][]) {
      const r = await post(c, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.json().detail).toMatch(msg);
    }
    expect((await c.post("/api/comments/c-missing/replies", { text: "hi" })).status).toBe(404);
    expect((await c.patch("/api/comments/c-missing", { status: "resolved" })).status).toBe(404);
    expect((await c.delete("/api/comments/c-missing")).status).toBe(404);
    const t = await ok(post(c, { kind: "comment", target, text: "hi" }));
    expect((await c.patch(`/api/comments/${t.id}`, {})).status).toBe(422);
    expect((await c.patch(`/api/comments/${t.id}`, { status: "done" })).status).toBe(422);
  });

  it("does not change the model, its history or its files", async () => {
    const dir = demoDir();
    const c = client(dir);
    const before = ["workspace.json", "designperspectives.json"].map((f) => fs.readFileSync(path.join(dir, "architecture", f), "utf-8"));
    const state = await ok(c.get("/api/state"));
    await ok(post(c, { kind: "comment", target, text: "hi" }));
    const after = await ok(c.get("/api/state"));
    expect(after.version).toBe(state.version);
    expect(after.canUndo).toBe(false);
    expect(["workspace.json", "designperspectives.json"].map((f) => fs.readFileSync(path.join(dir, "architecture", f), "utf-8"))).toEqual(before);
  });

  it("can be written whichever version is shown, drafts included", async () => {
    const c = client(demoDir());
    const d = await ok(c.post("/api/drafts", { title: "Try it" }));
    const t = await ok(c.at(`draft:${d.id}`).post("/api/comments", { kind: "comment", target, text: "in a draft" }));
    expect((await ok(c.get("/api/comments"))).threads.map((x: any) => x.id)).toEqual([t.id]);
  });

  it("drops invalid entries from a hand-edited file instead of failing", () => {
    const ok1 = { id: "c-1", kind: "comment", target: { type: "element", id: "a" }, author: "A", at: "2026-01-01T00:00:00Z", text: "hi", status: "open" };
    const text = JSON.stringify({
      threads: [
        ok1,
        { id: "c-2" },
        { ...ok1, kind: "rant", id: "c-3" },
        ok1,
        {
          ...ok1,
          id: "c-4",
          replies: [
            { id: "r", text: "" },
            { id: "r2", text: "yes", at: "2026-01-02T00:00:00Z" },
          ],
        },
      ],
    });
    const threads = parseComments(text);
    expect(threads.map((t) => t.id)).toEqual(["c-1", "c-4"]);
    expect(threads[1]!.replies).toMatchObject([{ id: "r2", author: "Anonymous" }]);
    expect(parseComments("not json")).toEqual([]);
  });

  it("refuses a change that would take the file past 10 MB, and forgets it; deleting still works", () => {
    const dir = tmpDir();
    const file = path.join(dir, "comments.json");
    // A file about 200 KB under the cap, in the layout the store writes.
    const at = "2026-01-01T00:00:00.000Z";
    const thread = (i: number) => ({ id: `c-${i}`, kind: "comment", target, author: "A", at, text: "x".repeat(3900), status: "open" });
    const per = Buffer.byteLength(stableJson({ threads: [thread(1000), thread(1001)] })) - Buffer.byteLength(stableJson({ threads: [thread(1000)] }));
    const count = Math.floor((MAX_FILE_BYTES - 200_000) / per);
    fs.writeFileSync(file, stableJson({ threads: Array.from({ length: count }, (_, i) => thread(i)) }));
    expect(fs.statSync(file).size).toBeLessThan(MAX_FILE_BYTES);
    const store = new CommentStore(file);
    const before = fs.readFileSync(file, "utf-8");
    let refused: unknown = null;
    for (let i = 0; i < 200 && !refused; i++) {
      try {
        store.reply("c-0", { text: "y".repeat(COMMENT_MAX), author: "B" });
      } catch (e) {
        refused = e;
      }
    }
    expect(refused).toBeInstanceOf(ModelError);
    expect((refused as Error).message).toBe("The comments file would grow past 10 MB. Delete resolved threads first.");
    expect(fs.statSync(file).size).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(fs.readFileSync(file, "utf-8")).not.toBe(before); // the replies before the cap were kept
    const n = store.get("c-0")!.replies.length;
    expect(() => store.add({ kind: "comment", target, text: "z".repeat(COMMENT_MAX), author: "B" })).toThrow(/10 MB/);
    expect(store.list()).toHaveLength(count); // the refused thread is not kept in memory either
    expect(store.get("c-0")!.replies).toHaveLength(n);
    store.remove("c-1");
    expect(store.list()).toHaveLength(count - 1);
  });

  it("a file already over 10 MB (written compactly by hand) can shrink: deleting works, growing does not", () => {
    const dir = tmpDir();
    const file = path.join(dir, "comments.json");
    const at = "2026-01-01T00:00:00.000Z";
    const thread = (i: number) => ({ id: `c-${i}`, kind: "comment", target, author: "A", at, text: "x".repeat(3500), status: "open", replies: [{ id: `r-${i}`, author: "B", at, text: "y" }] });
    const count = Math.ceil((MAX_FILE_BYTES * 1.03) / 3700);
    fs.writeFileSync(file, JSON.stringify({ threads: Array.from({ length: count }, (_, i) => thread(i)) })); // compact: smaller than the store's layout
    expect(fs.statSync(file).size).toBeGreaterThan(MAX_FILE_BYTES);
    const store = new CommentStore(file);
    expect(() => store.add({ kind: "comment", target, text: "z", author: "B" })).toThrow(/10 MB/);
    expect(() => store.reply("c-1", { text: "z", author: "B" })).toThrow(/10 MB/);
    expect(store.list()).toHaveLength(count);
    store.removeReply("c-1", "r-1");
    expect(store.get("c-1")!.replies).toEqual([]);
    store.remove("c-0");
    expect(store.list()).toHaveLength(count - 1);
    // Deleting went through to the file, and a change that makes the threads smaller is allowed too.
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).threads).toHaveLength(count - 1);
    store.edit("c-2", { text: "shorter" });
    expect(store.get("c-2")!.text).toBe("shorter");
  });

  it("picks up a file changed on disk", () => {
    const dir = tmpDir();
    const file = path.join(dir, "comments.json");
    const store = new CommentStore(file);
    store.add({ kind: "comment", target, text: "one", author: "A" });
    const other = new CommentStore(file);
    other.add({ kind: "idea", target, text: "two", author: "B" });
    expect(store.list().map((t) => t.text)).toEqual(["one", "two"]);
  });
});

describe("comments and roles", () => {
  const users: TestUser[] = [
    { name: "architect", role: "architect" },
    { name: "engineer", role: "engineer" },
    { name: "viewer", role: "viewer" },
  ];

  it("every role can comment, reply and resolve, and the name is the signed-in user's", async () => {
    const c = client(demoDir(), { users });
    for (const role of ["architect", "engineer", "viewer"]) {
      const me = await c.as(role);
      expect((await ok(me.get("/api/state"))).can.comment).toBe(true);
      const t = await ok(post(me, { kind: "question", target, text: `from ${role}`, author: "Someone Else" }));
      expect(t.author).toBe(role);
      await ok(me.post(`/api/comments/${t.id}/replies`, { text: "ok" }));
      expect((await ok(me.patch(`/api/comments/${t.id}`, { status: "resolved" }))).resolvedBy).toBe(role);
    }
  });

  it("needs a sign-in when sign-in is on", async () => {
    const c = client(demoDir(), { users });
    expect((await c.get("/api/comments")).status).toBe(401);
    expect((await post(c, { kind: "comment", target, text: "hi" })).status).toBe(401);
  });

  it("only the author or an architect can change or delete a thread or reply", async () => {
    const c = client(demoDir(), { users });
    const [arch, eng, view] = [await c.as("architect"), await c.as("engineer"), await c.as("viewer")];
    const t = await ok(post(eng, { kind: "comment", target, text: "mine" }));
    const r = (await ok(eng.post(`/api/comments/${t.id}/replies`, { text: "reply" }))).replies[0];
    expect((await view.patch(`/api/comments/${t.id}`, { text: "hijack" })).status).toBe(403);
    expect((await view.delete(`/api/comments/${t.id}`)).status).toBe(403);
    expect((await view.delete(`/api/comments/${t.id}/replies/${r.id}`)).status).toBe(403);
    expect((await ok(view.patch(`/api/comments/${t.id}`, { status: "resolved" }))).status).toBe("resolved");
    expect((await ok(eng.patch(`/api/comments/${t.id}`, { text: "mine, edited" }))).text).toBe("mine, edited");
    await ok(arch.delete(`/api/comments/${t.id}/replies/${r.id}`));
    await ok(arch.delete(`/api/comments/${t.id}`));
  });

  it("a --read-only server takes no comments but still shows them", async () => {
    const dir = demoDir();
    await ok(post(client(dir), { kind: "comment", target, text: "before" }));
    const ro = client(dir, { readOnly: true });
    expect((await ok(ro.get("/api/state"))).can.comment).toBe(false);
    expect((await ok(ro.get("/api/comments"))).threads).toHaveLength(1);
    expect((await post(ro, { kind: "comment", target, text: "after" })).status).toBe(403);
  });
});

describe("notes placed on a diagram", () => {
  const diagramTarget = { type: "diagram", id: "containers-internet-banking" };
  const users: TestUser[] = [
    { name: "architect", role: "architect" },
    { name: "viewer", role: "viewer" },
  ];

  it("a diagram thread can be created with a position, moved, and taken off again", async () => {
    const dir = demoDir();
    const c = client(dir);
    const t = await ok(post(c, { kind: "idea", target: diagramTarget, text: "Split this", position: { x: 120.456, y: -40 } }));
    expect(t.position).toEqual({ x: 120.46, y: -40 });
    const moved = await ok(c.patch(`/api/comments/${t.id}`, { position: { x: 5, y: 6 } }));
    expect(moved.position).toEqual({ x: 5, y: 6 });
    expect(moved).toMatchObject({ author: t.author, at: t.at, text: "Split this", status: "open" });
    const file = JSON.parse(fs.readFileSync(path.join(dir, "architecture", "comments.json"), "utf-8"));
    expect(Object.keys(file.threads[0])).toEqual(["id", "kind", "target", "position", "author", "at", "text", "status"]);
    expect(file.threads[0].position).toEqual({ x: 5, y: 6 });
    const cleared = await ok(c.patch(`/api/comments/${t.id}`, { position: null }));
    expect(cleared.position).toBeUndefined();
    expect((await ok(c.get("/api/comments"))).threads[0].position).toBeUndefined();
  });

  it("refuses a bad position on write and drops one on read", async () => {
    const c = client(demoDir());
    for (const position of [{ x: 1 }, { x: "1", y: 2 }, { x: 2e6, y: 0 }, "here", []]) {
      expect((await post(c, { kind: "comment", target: diagramTarget, text: "x", position })).status).toBe(422);
    }
    const t = await ok(post(c, { kind: "comment", target: diagramTarget, text: "ok" }));
    expect((await c.patch(`/api/comments/${t.id}`, { position: { x: 0, y: -1e7 } })).status).toBe(422);
    expect((await c.patch(`/api/comments/${t.id}`, { position: { x: null, y: 0 } })).status).toBe(422);
    // an element thread has no position, whichever way one is sent
    expect((await post(c, { kind: "comment", target, text: "x", position: { x: 1, y: 1 } })).status).toBe(422);
    const el = await ok(post(c, { kind: "comment", target, text: "x" }));
    expect((await c.patch(`/api/comments/${el.id}`, { position: { x: 1, y: 1 } })).status).toBe(422);

    const base = { kind: "comment", author: "A", at: "2026-01-01T00:00:00Z", text: "hi", status: "open" };
    const parsed = parseComments(
      JSON.stringify({
        threads: [
          { ...base, id: "a", target: diagramTarget, position: { x: 1, y: "2" } },
          { ...base, id: "b", target: diagramTarget, position: { x: 3, y: 4 } },
          { ...base, id: "c", target, position: { x: 3, y: 4 } },
        ],
      }),
    );
    expect(parsed.map((p) => p.position)).toEqual([undefined, { x: 3, y: 4 }, undefined]);
  });

  it("every role can move a note, and a read-only server cannot", async () => {
    const dir = demoDir();
    const c = client(dir, { users });
    const arch = await c.as("architect");
    const t = await ok(post(arch, { kind: "comment", target: diagramTarget, text: "mine", position: { x: 1, y: 1 } }));
    const view = await c.as("viewer");
    const moved = await ok(view.patch(`/api/comments/${t.id}`, { position: { x: 9, y: 9 } }));
    expect(moved).toMatchObject({ position: { x: 9, y: 9 }, author: "architect", text: "mine" });
    const dir2 = demoDir();
    const open = client(dir2);
    const t2 = await ok(post(open, { kind: "comment", target: diagramTarget, text: "x", position: { x: 9, y: 9 } }));
    const ro = client(dir2, { readOnly: true });
    expect((await ok(ro.get("/api/comments"))).threads[0].position).toEqual({ x: 9, y: 9 });
    expect((await ro.patch(`/api/comments/${t2.id}`, { position: { x: 0, y: 0 } })).status).toBe(403);
  });

  it("a placed note survives edits and replies", async () => {
    const c = client(demoDir());
    const t = await ok(post(c, { kind: "question", target: diagramTarget, text: "Why?", position: { x: 10, y: 20 } }));
    await ok(c.post(`/api/comments/${t.id}/replies`, { text: "Because." }));
    await ok(c.patch(`/api/comments/${t.id}`, { status: "resolved" }));
    await ok(c.patch(`/api/comments/${t.id}`, { text: "Why so?" }));
    expect((await ok(c.get("/api/comments"))).threads[0]).toMatchObject({ position: { x: 10, y: 20 }, text: "Why so?", status: "resolved" });
  });
});
