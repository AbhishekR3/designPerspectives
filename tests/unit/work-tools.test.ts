/** Linked work status adapters (WRK-02): GitHub, GitLab, SonarQube and Jira links, their API addresses, states, errors, and where a token may go. No network. */
import { describe, expect, it } from "vitest";
import { checkServiceUrl } from "../../src/core/hosts.js";
import { getWork, setWork } from "../../src/core/work.js";
import { ADAPTERS, applyStatuses, failures, fetchStatuses, MAX_LINKS, nextStatus, refreshPlan, tokenFor } from "../../src/core/workStatus.js";
import { apiAddress, linkRest, type Conn, type Fetch } from "../../src/core/workTools/types.js";
import { DEFAULT_WORK_SEVERITY, type WorkItem, type WorkToolId } from "../../src/shared/types.js";
import { demoWs } from "./helpers.js";

const conn = (tool: WorkToolId, base: string, more: Partial<Conn> = {}): Conn => ({ id: `${tool}-x`, tool, base, builtIn: false, auth: "bearer", ...more });
const GH = conn("github", "https://github.com", { id: "github", builtIn: true });
const GL = conn("gitlab", "https://gitlab.com", { id: "gitlab", builtIn: true });
const GL_OWN = conn("gitlab", "https://code.example.com/gitlab", { credential: "gl-own" });
const SC = conn("sonar", "https://sonarcloud.io", { id: "sonarcloud", builtIn: true });
const SQ = conn("sonar", "https://sonar.example.com", { credential: "sq" });
const JIRA = conn("jira", "https://acme.atlassian.net", { credential: "jira", auth: "basic" });
const ALL = [GH, GL, GL_OWN, SC, SQ, JIRA];

/** The API addresses a link is read from under a connection, or null when its adapter does not read it. */
function api(link: string, c: Conn): string[] | null {
  const at = linkRest(link, c);
  const a = ADAPTERS[c.tool];
  const p = at && a.match(at.link, at.rest, c);
  return p ? a.requests(p, c).map((r) => apiAddress(a.apiRoot(c), r)!) : null;
}

/** A demo model with the links pinned to the project. */
function wsWith(urls: string[]) {
  const ws = demoWs();
  // Added after the demo's own project items, which stay.
  setWork(ws, { type: "project" }, [...getWork(ws, { type: "project" }), ...urls.map((url, i) => ({ type: "issue", title: `Item ${i}`, url, status: "open" }))]);
  return ws;
}

interface Call {
  url: string;
  headers: Record<string, string>;
  redirect?: string;
}
const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
function stub(calls: Call[], route: (url: string) => { status: number; body: unknown } | Error): Fetch {
  return async (url, init) => {
    calls.push({ url, headers: init.headers, redirect: init.redirect });
    const r = route(url);
    if (r instanceof Error) throw r;
    return answer(r.status, r.body);
  };
}
const TOKENS: Record<string, string> = { "gl-own": "glpat-OWN", sq: "squ_TOKEN", jira: "ana@example.com:jira-api-token" };
TOKENS.gh = "ghp_PUBLIC";
const LIST = Object.keys(TOKENS).map((name) => ({ name, provider: name === "gh" ? "github" : name === "gl-own" ? "gitlab" : "other", locked: false }));
const creds = { get: (n: string) => TOKENS[n] ?? null, list: () => ({ credentials: LIST }) } as unknown as Parameters<typeof tokenFor>[1];

describe("links and API addresses", () => {
  it("GitHub: issues and pull requests on github.com; a GitHub Enterprise server through /api/v3", () => {
    expect(api("https://github.com/acme/bank/issues/12", GH)).toEqual(["https://api.github.com/repos/acme/bank/issues/12"]);
    expect(api("https://github.com/acme/bank/pull/7/", GH)).toEqual(["https://api.github.com/repos/acme/bank/pulls/7"]);
    const ghe = conn("github", "https://git.example.com");
    expect(api("https://git.example.com/acme/bank/issues/3", ghe)).toEqual(["https://git.example.com/api/v3/repos/acme/bank/issues/3"]);
    for (const bad of [
      "https://github.com.evil.io/acme/bank/issues/1",
      "https://evil.io/github.com/acme/bank/issues/1",
      "https://ana@github.com/acme/bank/issues/1",
      "https://github.com/acme/%2e%2e/issues/1",
      "https://github.com/acme/ba%2Fnk/issues/1",
      "https://github.com\\acme\\bank\\issues\\1",
      "https://github.com/acme/bank/wiki/1",
      "https://github.com:8443/acme/bank/issues/1",
    ]) {
      expect(api(bad, GH), bad).toBeNull();
    }
  });

  it("GitLab: gitlab.com and a GitLab under a path; the project path is one encoded API part", () => {
    expect(api("https://gitlab.com/acme/team/bank/-/issues/4", GL)).toEqual(["https://gitlab.com/api/v4/projects/acme%2Fteam%2Fbank/issues/4"]);
    expect(api("https://gitlab.com/acme/bank/-/merge_requests/9", GL)).toEqual(["https://gitlab.com/api/v4/projects/acme%2Fbank/merge_requests/9"]);
    expect(api("https://code.example.com/gitlab/acme/bank/-/issues/4", GL_OWN)).toEqual(["https://code.example.com/gitlab/api/v4/projects/acme%2Fbank/issues/4"]);
    for (const bad of [
      "https://code.example.com/acme/bank/-/issues/4", // outside the base path
      "https://code.example.com/gitlabx/acme/bank/-/issues/4",
      "https://code.example.com/gitlab/../acme/bank/-/issues/4",
      "https://code.example.com/gitlab/acme/./bank/-/issues/4",
      "https://code.example.com/gitlab/acme/%2e%2e/-/issues/4",
      "https://code.example.com/gitlab/acme/ba%2fnk/-/issues/4",
      "https://code.example.com/gitlab/-/issues/4",
      "https://code.example.com/gitlab/acme/bank/-/issues/x",
    ]) {
      expect(api(bad, GL_OWN), bad).toBeNull();
    }
  });

  it("Sonar: issues, hotspots and projects, with their keys from the query", () => {
    expect(api("https://sonarcloud.io/project/issues?id=acme_bank&issues=AYx-1_b&open=AYx-1_b", SC)).toEqual(["https://sonarcloud.io/api/issues/search?issues=AYx-1_b"]);
    expect(api("https://sonar.example.com/project/issues?id=acme:bank&open=AZ9", SQ)).toEqual(["https://sonar.example.com/api/issues/search?issues=AZ9"]);
    expect(api("https://sonar.example.com/security_hotspots?id=bank&hotspots=H1", SQ)).toEqual(["https://sonar.example.com/api/hotspots/show?hotspot=H1"]);
    expect(api("https://sonar.example.com/dashboard?id=bank&branch=main", SQ)).toEqual([
      "https://sonar.example.com/api/qualitygates/project_status?projectKey=bank",
      "https://sonar.example.com/api/measures/component?component=bank&metricKeys=bugs%2Cvulnerabilities%2Csecurity_hotspots%2Ccode_smells",
    ]);
    expect(api("https://sonarcloud.io/summary/overall?id=acme_bank", SC)).toHaveLength(2);
    for (const bad of [
      "https://sonar.example.com/dashboard",
      "https://sonar.example.com/dashboard?id=a&id=b",
      "https://sonar.example.com/dashboard?id=../x",
      "https://sonar.example.com/project/issues?id=bank&issues=A,B",
      "https://sonar.example.com/project/issues?id=bank&issues=A%2F..",
      "https://sonar.example.com/project/other?id=bank",
      "https://sonar.example.com.evil.io/dashboard?id=bank",
    ]) {
      expect(api(bad, SQ), bad).toBeNull();
    }
  });

  it("Jira: browse links of a connected site only", () => {
    expect(api("https://acme.atlassian.net/browse/PAY-123", JIRA)).toEqual(["https://acme.atlassian.net/rest/api/2/issue/PAY-123?fields=status%2Csummary%2Cpriority"]);
    for (const bad of [
      "https://acme.atlassian.net/browse/PAY-12/../x",
      "https://acme.atlassian.net/browse/../PAY-1",
      "https://acme.atlassian.net/browse/PAY",
      "https://other.atlassian.net/browse/PAY-1",
    ]) {
      expect(api(bad, JIRA), bad).toBeNull();
    }
  });

  it("an API address that would leave the API root is refused", () => {
    expect(apiAddress("https://api.github.com", "/repos/a/b/issues/1")).toBe("https://api.github.com/repos/a/b/issues/1");
    expect(apiAddress("https://x.example.com/gitlab/api/v4", "/../../admin")).toBeNull();
    expect(apiAddress("https://x.example.com/api", "/%2e%2e/admin")).toBeNull();
    expect(apiAddress("https://x.example.com/api", "@evil.io/x")).toBeNull();
  });
});

describe("states", () => {
  it("each tool's answer as a state, the tool's own words and a severity", () => {
    const read = (c: Conn, link: string, bodies: unknown[]) => {
      const at = linkRest(link, c)!;
      const a = ADAPTERS[c.tool];
      return a.read(bodies, a.match(at.link, at.rest, c)!, DEFAULT_WORK_SEVERITY);
    };
    const pr = "https://github.com/a/b/pull/1";
    expect(read(GH, pr, [{ state: "closed", merged_at: "2026-01-01" }])).toEqual({ state: "done", remote: "Merged" });
    expect(read(GH, pr, [{ state: "open", draft: true }])).toEqual({ state: "open", remote: "Draft" });
    const mr = "https://gitlab.com/a/b/-/merge_requests/1";
    expect(read(GL, mr, [{ state: "opened" }])).toEqual({ state: "open", remote: "Open" });
    expect(read(GL, mr, [{ state: "merged" }])).toEqual({ state: "done", remote: "Merged" });
    expect(read(GL, mr, [{ state: "closed" }])).toEqual({ state: "done", remote: "Closed" });
    const issue = "https://sonarcloud.io/project/issues?id=p&issues=K1";
    expect(read(SC, issue, [{ issues: [{ key: "K1", status: "OPEN", severity: "BLOCKER" }] }])).toEqual({ state: "open", remote: "Open", severity: "critical" });
    expect(read(SC, issue, [{ issues: [{ key: "K1", status: "RESOLVED", resolution: "FIXED", severity: "MAJOR" }] }])).toEqual({ state: "done", remote: "Resolved (Fixed)", severity: "high" });
    expect(read(SC, issue, [{ issues: [{ key: "K1", status: "OPEN", impacts: [{ severity: "LOW" }, { severity: "MEDIUM" }] }] }])).toMatchObject({ severity: "medium" });
    expect(() => read(SC, issue, [{ issues: [] }])).toThrow(/no such issue/);
    const hotspot = "https://sonarcloud.io/security_hotspots?id=p&hotspots=H";
    expect(read(SC, hotspot, [{ status: "TO_REVIEW", rule: { vulnerabilityProbability: "HIGH" } }])).toEqual({ state: "open", remote: "To review", severity: "high" });
    expect(read(SC, hotspot, [{ status: "REVIEWED", resolution: "SAFE" }])).toEqual({ state: "done", remote: "Reviewed (Safe)" });
    const project = "https://sonarcloud.io/dashboard?id=p";
    const measures = {
      component: {
        measures: [
          { metric: "vulnerabilities", value: "3" },
          { metric: "security_hotspots", value: "5" },
          { metric: "bugs", value: "0" },
        ],
      },
    };
    expect(read(SC, project, [{ projectStatus: { status: "ERROR" } }, measures])).toEqual({ state: "open", remote: "Quality gate failed · 3 vulnerabilities, 5 hotspots" });
    expect(read(SC, project, [{ projectStatus: { status: "OK" } }, { component: { measures: [] } }])).toEqual({ state: "done", remote: "Quality gate passed" });
    const ji = "https://acme.atlassian.net/browse/PAY-1";
    const jiraBody = (key: string, name: string, priority?: string) => ({ fields: { status: { name, statusCategory: { key } }, ...(priority ? { priority: { name: priority } } : {}) } });
    expect(read(JIRA, ji, [jiraBody("new", "To Do", "Highest")])).toEqual({ state: "open", remote: "To Do", severity: "critical" });
    expect(read(JIRA, ji, [jiraBody("indeterminate", "In Review", "Lowest")])).toEqual({ state: "in-progress", remote: "In Review", severity: "low" });
    expect(read(JIRA, ji, [jiraBody("done", "Done")])).toEqual({ state: "done", remote: "Done" });
  });

  it("an item's next status: done follows the tool, a person's blocked stays, a done item opens again", () => {
    expect(nextStatus("blocked", "done")).toBe("done");
    expect(nextStatus("blocked", "open")).toBe("blocked");
    expect(nextStatus("in-progress", "open")).toBe("in-progress");
    expect(nextStatus("open", "in-progress")).toBe("in-progress");
    expect(nextStatus("done", "open")).toBe("open");
    expect(nextStatus("done", "in-progress")).toBe("in-progress");
  });
});

describe("fetching", () => {
  it("every call: no redirects, the connection's token only, to its own API root; basic auth for Jira", async () => {
    const links = [
      "https://github.com/acme/bank/issues/1",
      "https://gitlab.com/acme/bank/-/issues/2",
      "https://code.example.com/gitlab/acme/bank/-/merge_requests/3",
      "https://sonar.example.com/project/issues?id=bank&issues=K1",
      "https://acme.atlassian.net/browse/PAY-4",
      "https://tracker.example.com/5",
    ];
    const ws = wsWith(links);
    const plan = refreshPlan(ws, ALL);
    expect(plan.links.map((l) => l.conn.id)).toEqual(["github", "gitlab", "gitlab-x", "sonar-x", "jira-x"]);
    const calls: Call[] = [];
    const { states, byTool } = await fetchStatuses(
      plan,
      (c) => tokenFor(c, creds, ALL),
      stub(calls, (url) =>
        url.includes("/issues/search")
          ? { status: 200, body: { issues: [{ key: "K1", status: "OPEN" }] } }
          : url.includes("atlassian")
            ? { status: 200, body: { fields: { status: { name: "Done", statusCategory: { key: "done" } } } } }
            : { status: 200, body: { state: url.includes("gitlab") ? "opened" : "open" } },
      ),
    );
    expect(calls.every((c) => c.redirect === "error")).toBe(true);
    const auth = Object.fromEntries(calls.map((c) => [new URL(c.url).host + new URL(c.url).pathname.split("/").slice(0, 2).join("/"), c.headers.Authorization ?? null]));
    expect(auth).toEqual({
      "api.github.com/repos": "Bearer ghp_PUBLIC",
      "gitlab.com/api": null, // no gitlab credential: public only
      "code.example.com/gitlab": "Bearer glpat-OWN",
      "sonar.example.com/api": "Bearer squ_TOKEN",
      "acme.atlassian.net/rest": `Basic ${Buffer.from("ana@example.com:jira-api-token").toString("base64")}`,
    });
    expect([...states.values()].every((s) => !("error" in s))).toBe(true);
    expect(byTool).toEqual([
      { tool: "github", base: "https://github.com", checked: 1, credential: "gh" },
      { tool: "gitlab", base: "https://gitlab.com", checked: 1, credential: null },
      { tool: "gitlab", base: "https://code.example.com/gitlab", checked: 1, credential: "gl-own" },
      { tool: "sonar", base: "https://sonar.example.com", checked: 1, credential: "sq" },
      { tool: "jira", base: "https://acme.atlassian.net", checked: 1, credential: "jira" },
    ]);
    expect(plan.unknown).toBe(demoUnknown() + 1);
  });

  it("errors are short, name the tool and never repeat the answer or the token", async () => {
    const links = [
      "https://github.com/a/b/issues/1",
      "https://github.com/a/b/issues/2",
      "https://github.com/a/b/issues/3",
      "https://github.com/a/b/issues/4",
      "https://github.com/a/b/issues/5",
      "https://github.com/a/b/issues/6",
      "https://github.com/a/b/issues/7",
    ];
    const plan = refreshPlan(wsWith(links), [GH]);
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const route = (url: string) => {
      const n = url.slice(-1);
      return n === "1"
        ? { status: 401, body: { message: "SECRET-BODY ghp_PUBLIC" } }
        : n === "2"
          ? { status: 403, body: {} }
          : n === "3"
            ? { status: 404, body: {} }
            : n === "4"
              ? { status: 302, body: {} }
              : n === "5"
                ? timeout
                : n === "6"
                  ? new TypeError("fetch failed: SECRET")
                  : { status: 200, body: "not an object" };
    };
    const { states } = await fetchStatuses(plan, (c) => tokenFor(c, creds, ALL), stub([], route));
    const reasons = failures(plan, states).map((f) => f.reason);
    expect(reasons).toEqual([
      "the GitHub credential was refused",
      "no access, or the GitHub rate limit",
      "not found in GitHub",
      "GitHub answered with a redirect, which dp does not follow",
      "GitHub gave no answer in 10 seconds",
      "could not reach GitHub",
      "GitHub sent an answer without a state",
    ]);
    expect(JSON.stringify(reasons)).not.toMatch(/SECRET|ghp_/);
  });

  it("a connection whose credential is missing is reported and not called; basic auth needs user:token", async () => {
    const own = conn("gitlab", "https://code.example.com", { credential: "gone" });
    const jira = conn("jira", "https://jira.example.com", { credential: "gl-own", auth: "basic" });
    const plan = refreshPlan(wsWith(["https://code.example.com/a/b/-/issues/1", "https://jira.example.com/browse/X-1"]), [own, jira]);
    const calls: Call[] = [];
    const { states, byTool } = await fetchStatuses(
      plan,
      (c) => tokenFor(c, creds, ALL),
      stub(calls, () => ({ status: 200, body: {} })),
    );
    expect(calls).toEqual([]);
    expect(failures(plan, states).map((f) => f.reason)).toEqual(['the credential "gone" of this connection is missing or locked', 'the credential for basic sign-in must be "user:token"']);
    expect(byTool[0]).toMatchObject({ credential: "gone" });
  });

  it("at most MAX_LINKS links are read; the rest are reported", () => {
    const links = Array.from({ length: MAX_LINKS + 3 }, (_, i) => `https://github.com/a/b/issues/${i + 1}`);
    const ws = demoWs();
    // Spread over elements so no one object passes its own limit.
    setWork(
      ws,
      { type: "project" },
      links.slice(0, 150).map((url) => ({ type: "issue", title: url, url, status: "open" })),
    );
    setWork(
      ws,
      { type: "diagram", id: "flow-sign-in" },
      links.slice(150).map((url) => ({ type: "issue", title: url, url, status: "open" })),
    );
    const plan = refreshPlan(ws, [GH]);
    expect(plan.links).toHaveLength(MAX_LINKS);
    expect(failures(plan, new Map())).toHaveLength(3);
  });

  it("applying: remote and checked are written only when something changed", () => {
    const url = "https://github.com/a/b/issues/1";
    const ws = wsWith([url]);
    const states = new Map([[url, { state: "open" as const, remote: "Open" }]]);
    expect(applyStatuses(ws, states, "2026-01-01T00:00:00.000Z")).toEqual([]); // the status stays open
    const item = () => (JSON.parse(ws.properties!["dp.work"]!) as WorkItem[]).find((w) => w.url === url)!;
    expect(item()).toMatchObject({ status: "open", remote: "Open", checked: "2026-01-01T00:00:00.000Z" });
    applyStatuses(ws, states, "2026-02-02T00:00:00.000Z");
    expect(item().checked).toBe("2026-01-01T00:00:00.000Z");
    expect(applyStatuses(ws, new Map([[url, { state: "done" as const, remote: "Closed" }]]), "2026-03-03T00:00:00.000Z")).toEqual([{ owner: "Project", title: "Item 0", from: "open", to: "done" }]);
    expect(item()).toMatchObject({ status: "done", remote: "Closed", checked: "2026-03-03T00:00:00.000Z" });
  });
});

describe("service addresses", () => {
  it("https unless this machine; no user, query, fragment; never link-local or metadata", () => {
    expect(checkServiceUrl("https://gitlab.example.com/", "address").host).toBe("gitlab.example.com");
    expect(checkServiceUrl("http://127.0.0.1:9000", "address").port).toBe("9000");
    for (const [bad, msg] of [
      ["http://gitlab.example.com", /must use https/],
      ["https://169.254.169.254", /link-local/],
      ["https://metadata.google.internal", /metadata/],
      ["https://[fe80::1]", /link-local/],
      ["https://x.example.com/?a=1", /query/],
      ["https://x.example.com/#a", /fragment/],
      ["https://u:p@x.example.com", /user name/],
      ["ftp://x.example.com", /https/],
      ["not a url", /web address/],
    ] as const) {
      expect(() => checkServiceUrl(bad, "address"), bad).toThrow(msg);
    }
  });
});

/** Links of the demo's own linked work that these connections do not read. */
function demoUnknown(): number {
  return refreshPlan(demoWs(), ALL).unknown;
}
