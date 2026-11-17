/** The BMO chat's text rules: "[" mentions (finding, ranking, inserting, resolving by pick or exact name), the earlier turns that fit the limits, and the small Markdown subset. */
import { describe, expect, test } from "vitest";
import {
  activeMention,
  historyToSend,
  inlineParts,
  insertMention,
  keepPicks,
  markdownBlocks,
  mentionTargets,
  resolveMentions,
  suggestMentions,
  type MentionTarget,
} from "../../ui/src/common/bmoChatText.js";
import { BMO_ASK_LIMITS } from "../../src/shared/types.js";

const elements = [
  { id: "ibs", name: "Internet Banking System", kind: "softwareSystem" as const, parentId: null },
  { id: "api", name: "API Application", kind: "container" as const, parentId: "ibs" },
  { id: "db", name: "Database", kind: "container" as const, parentId: "ibs" },
  { id: "pay", name: "Payments Service", kind: "container" as const, parentId: "ibs" },
  { id: "pay-db", name: "Database", kind: "container" as const, parentId: "other" },
  { id: "other", name: "Other System", kind: "softwareSystem" as const, parentId: null },
  { id: "cust", name: "Personal Banking Customer", kind: "person" as const, parentId: null },
  { id: "odd", name: "Odd [name]", kind: "container" as const, parentId: "ibs" },
];
const relationships = [
  { id: "r1", sourceId: "api", destinationId: "db", description: "Reads from and writes to" },
  { id: "r2", sourceId: "cust", destinationId: "ibs", description: "" },
];
const targets = mentionTargets(elements, relationships);
const byId = (id: string) => targets.find((t) => t.id === id)!;

describe("mention targets", () => {
  test("every element with its kind and parent, every relationship as Source → Destination: label; names with brackets are left out", () => {
    expect(byId("api")).toEqual({ id: "api", type: "element", name: "API Application", kindLabel: "Container", where: "in Internet Banking System" });
    expect(byId("ibs").where).toBe("");
    expect(byId("r1")).toEqual({ id: "r1", type: "relationship", name: "API Application → Database: Reads from and writes to", kindLabel: "Relationship", where: "" });
    expect(byId("r2").name).toBe("Personal Banking Customer → Internet Banking System");
    expect(targets.find((t) => t.id === "odd")).toBeUndefined();
  });
});

describe("the mention being typed", () => {
  test("the text after an unclosed [ on the same line, up to the caret", () => {
    const t = "What calls [Internet Banki";
    expect(activeMention(t, t.length)).toEqual({ start: 11, query: "Internet Banki" });
    expect(activeMention("[", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("a [b] c", 7)).toBeNull();
    expect(activeMention("a [b\nc", 6)).toBeNull();
    expect(activeMention("no bracket", 5)).toBeNull();
    // The caret in the middle: only the text before it counts.
    expect(activeMention("[Internet Banking System]", 9)).toEqual({ start: 0, query: "Internet" });
  });

  test("ranked: prefix first, then word starts, then any substring; letter case ignored; at most 8", () => {
    // The element first; the relationship that ends at it matches at a word start.
    expect(suggestMentions(targets, "Internet Banki").map((t) => t.id)).toEqual(["ibs", "r2"]);
    expect(suggestMentions(targets, "internet banki").map((t) => t.id)).toEqual(["ibs", "r2"]);
    // "bank": nothing starts with it, two names have a word that does; then the relationship that holds it.
    expect(suggestMentions(targets, "bank").map((t) => t.id)).toEqual(["ibs", "cust", "r2"]);
    // A prefix match beats a substring match, and elements come before relationships.
    expect(suggestMentions(targets, "a").map((t) => t.id)[0]).toBe("api");
    expect(suggestMentions(targets, "data").map((t) => t.id)).toEqual(["db", "pay-db", "r1"]);
    expect(suggestMentions(targets, "zzz")).toEqual([]);
    expect(suggestMentions(targets, "").every((t) => t.type === "element")).toBe(true);
    const many: MentionTarget[] = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, type: "element", name: `Service ${i}`, kindLabel: "Container", where: "" }));
    expect(suggestMentions(many, "serv")).toHaveLength(8);
  });

  test("picking inserts [Exact Name] with a space, replaces the rest of a closed token, and remembers the ID", () => {
    const t = "What calls [Internet Banki";
    expect(insertMention(t, 11, t.length, byId("ibs"))).toEqual({ text: "What calls [Internet Banking System] ", caret: 37, pick: { token: "Internet Banking System", id: "ibs" } });
    // Before a question mark: no space.
    const u = "Who uses [dat?";
    expect(insertMention(u, 9, 13, byId("db")).text).toBe("Who uses [Database]?");
    // Inside an existing token: the whole token is replaced.
    const v = "Is [Inter] up?";
    expect(insertMention(v, 3, 6, byId("ibs")).text).toBe("Is [Internet Banking System] up?");
    expect(insertMention("x [Paym and more", 2, 7, byId("pay")).text).toBe("x [Payments Service] and more");
  });
});

describe("resolving the references of a message", () => {
  test("a pick wins; else the one object with exactly that name; two same-named objects are ambiguous unless picked", () => {
    const text = "Does [API Application] write to [Database]? And [Nope]?";
    const none = resolveMentions(text, [], targets);
    expect(none.tokens.map((t) => [t.token, t.status, t.target?.id])).toEqual([
      ["API Application", "name", "api"],
      ["Database", "ambiguous", undefined],
      ["Nope", "unknown", undefined],
    ]);
    expect(none.refs).toEqual(["api"]);
    const picked = resolveMentions(text, [{ token: "Database", id: "pay-db" }], targets);
    expect(picked.tokens[1]).toMatchObject({ status: "picked", target: { id: "pay-db" } });
    expect(picked.refs).toEqual(["api", "pay-db"]);
  });

  test("two picks of the same name stay apart, in order; an ID repeated is sent once", () => {
    const text = "[Database] and [Database] and [API Application] and [api application]";
    const r = resolveMentions(
      text,
      [
        { token: "Database", id: "db" },
        { token: "Database", id: "pay-db" },
      ],
      targets,
    );
    expect(r.tokens.map((t) => t.target?.id)).toEqual(["db", "pay-db", "api", "api"]);
    expect(r.tokens[3]!.status).toBe("name"); // letter case only when nothing matches exactly
    expect(r.refs).toEqual(["db", "pay-db", "api"]);
  });

  test("an edited token no longer matches its pick and falls back to the name; a pick of a gone object is ignored", () => {
    const picks = [{ token: "Payments Service", id: "pay" }];
    expect(resolveMentions("[Payments Servic]", picks, targets).tokens[0]!.status).toBe("unknown");
    expect(keepPicks("[Payments Servic]", picks)).toEqual([]);
    expect(keepPicks("see [Payments Service]", picks)).toEqual(picks);
    expect(resolveMentions("[Payments Service]", [{ token: "Payments Service", id: "deleted" }], targets).tokens[0]).toMatchObject({ status: "name", target: { id: "pay" } });
  });

  test("a relationship is referred to by its arrow name", () => {
    expect(resolveMentions("Why [API Application → Database: Reads from and writes to]?", [], targets).refs).toEqual(["r1"]);
  });
});

describe("earlier turns", () => {
  test("the latest that fit: at most the turn count, long turns cut, the total capped", () => {
    const L = BMO_ASK_LIMITS;
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "bmo" : "you") as "you" | "bmo", text: `turn ${i}` }));
    expect(historyToSend(turns, L).map((t) => t.text)).toEqual(["turn 4", "turn 5", "turn 6", "turn 7", "turn 8", "turn 9"]);
    const long = historyToSend([{ role: "bmo", text: "x".repeat(L.turnChars + 50) }], L);
    expect(long[0]!.text).toHaveLength(L.turnChars);
    expect(long[0]!.text.endsWith("…")).toBe(true);
    const big = Array.from({ length: 4 }, () => ({ role: "bmo" as const, text: "y".repeat(L.turnChars) }));
    const kept = historyToSend(big, L);
    expect(kept).toHaveLength(2);
    expect(kept.reduce((n, t) => n + t.text.length, 0)).toBeLessThanOrEqual(L.historyChars);
    expect(historyToSend([{ role: "you", text: "  " }], L)).toEqual([]);
  });
});

describe("simple Markdown as data", () => {
  test("paragraphs, headings, lists and code; inline code, bold and emphasis; HTML stays text", () => {
    const md = "# Summary\nThe **API** calls `db`.\n\n- one\n- two\n  continued\n\n1. first\n2. second\n\n```\n<script>x</script>\n```\n<b>not bold</b>";
    expect(markdownBlocks(md)).toEqual([
      { type: "h", text: "Summary" },
      { type: "p", text: "The **API** calls `db`." },
      { type: "ul", items: ["one", "two continued"] },
      { type: "ol", items: ["first", "second"] },
      { type: "code", text: "<script>x</script>" },
      { type: "p", text: "<b>not bold</b>" },
    ]);
    expect(inlineParts("The **API** calls `db` and *maybe* more")).toEqual([
      { type: "text", text: "The " },
      { type: "strong", text: "API" },
      { type: "text", text: " calls " },
      { type: "code", text: "db" },
      { type: "text", text: " and " },
      { type: "em", text: "maybe" },
      { type: "text", text: " more" },
    ]);
    expect(inlineParts("<img src=x onerror=alert(1)>")).toEqual([{ type: "text", text: "<img src=x onerror=alert(1)>" }]);
  });
});
