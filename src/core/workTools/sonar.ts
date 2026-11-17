/**
 * SonarQube and SonarCloud (DEC-085): issues, security hotspots and a project's quality gate. Sonar links
 * carry their keys in the query, so the link's query is read here (the path only says which page it is):
 *
 *   <base>/project/issues?id=P&issues=K (or &open=K)          → /api/issues/search?issues=K
 *   <base>/security_hotspots?id=P&hotspots=K                   → /api/hotspots/show?hotspot=K
 *     (also /project/security_hotspots)
 *   <base>/dashboard?id=P (also /project/overview, /summary/overall)
 *                                                              → /api/qualitygates/project_status?projectKey=P
 *                                                                + /api/measures/component?component=P&metricKeys=…
 *
 * Keys have tight character classes and go into the API query encoded, never into its path. An issue that is
 * resolved or closed is done; a hotspot that is reviewed is done; a project whose gate passes is done and one
 * whose gate fails is open. Severity comes from the model's `sonar` severity table (DEC-087; by default BLOCKER
 * and CRITICAL → critical, MAJOR → high, MINOR → medium, INFO → low): the issue's severity, else the worst of its
 * newer impact severities (BLOCKER, HIGH, MEDIUM, LOW, INFO); a hotspot's probability by the same table.
 */

import { ReadError, obj, query, text, words, type Parsed, type WorkAdapter } from "./types.js";
import type { WorkSeverityMaps } from "../../shared/types.js";
import { severityOf } from "../../shared/workLinks.js";

const PROJECT_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,399}$/;
const ITEM_KEY = /^[A-Za-z0-9_-]{1,100}$/;
const RANK = ["low", "medium", "high", "critical"];
const METRICS: [string, string, string][] = [
  ["bugs", "bug", "bugs"],
  ["vulnerabilities", "vulnerability", "vulnerabilities"],
  ["security_hotspots", "hotspot", "hotspots"],
  ["code_smells", "code smell", "code smells"],
];

/** The one value of a query parameter, or null when it is missing, repeated or not a plain key. */
function one(link: URL, name: string, re: RegExp): string | null {
  const all = link.searchParams.getAll(name);
  return all.length === 1 && re.test(all[0]!) ? all[0]! : null;
}

function issueSeverity(issue: Record<string, unknown>, table: WorkSeverityMaps["sonar"]): string | undefined {
  const legacy = severityOf(table, text(issue.severity));
  if (legacy) return legacy;
  const impacts = Array.isArray(issue.impacts) ? issue.impacts : [];
  let best = -1;
  for (const i of impacts) best = Math.max(best, RANK.indexOf(severityOf(table, text(obj(i).severity)) ?? ""));
  return best >= 0 ? RANK[best] : undefined;
}

export const sonar: WorkAdapter = {
  tool: "sonar",
  provider: "sonarqube",
  apiRoot: (conn) => `${conn.base}/api`,
  match(link, rest): Parsed | null {
    const page = rest.replace(/\/$/, "");
    const id = one(link, "id", PROJECT_KEY);
    if (!id) return null;
    if (page === "/project/issues") {
      const key = link.searchParams.has("issues") ? one(link, "issues", ITEM_KEY) : one(link, "open", ITEM_KEY);
      return key ? { kind: "issue", parts: { project: id, key } } : null;
    }
    if (page === "/security_hotspots" || page === "/project/security_hotspots") {
      const key = one(link, "hotspots", ITEM_KEY);
      return key ? { kind: "hotspot", parts: { project: id, key } } : null;
    }
    if (page === "/dashboard" || page === "/project/overview" || page === "/summary/overall") return { kind: "project", parts: { project: id } };
    return null;
  },
  requests(p) {
    if (p.kind === "issue") return [`/issues/search${query({ issues: p.parts.key! })}`];
    if (p.kind === "hotspot") return [`/hotspots/show${query({ hotspot: p.parts.key! })}`];
    return [`/qualitygates/project_status${query({ projectKey: p.parts.project! })}`, `/measures/component${query({ component: p.parts.project!, metricKeys: METRICS.map((m) => m[0]).join(",") })}`];
  },
  headers(token, conn) {
    const h: Record<string, string> = { Accept: "application/json", "User-Agent": "designPerspectives" };
    if (token) h.Authorization = conn.auth === "basic" ? `Basic ${Buffer.from(token.includes(":") ? token : `${token}:`, "utf-8").toString("base64")}` : `Bearer ${token}`;
    return h;
  },
  read(bodies, p, maps) {
    if (p.kind === "issue") {
      const list = obj(bodies[0]).issues;
      const issue = Array.isArray(list) ? list.map(obj).find((i) => i.key === p.parts.key) : undefined;
      if (!issue) throw new ReadError("SonarQube has no such issue (or it is private without a credential)");
      const status = text(issue.status);
      const resolution = text(issue.resolution);
      const done = status === "RESOLVED" || status === "CLOSED" || ["FIXED", "ACCEPTED", "FALSE_POSITIVE"].includes(text(issue.issueStatus));
      const severity = issueSeverity(issue, maps.sonar);
      return { state: done ? "done" : "open", remote: `${words(status || text(issue.issueStatus) || "open")}${resolution ? ` (${words(resolution)})` : ""}`, ...(severity ? { severity } : {}) };
    }
    if (p.kind === "hotspot") {
      const h = obj(bodies[0]);
      const status = text(h.status);
      if (!status) throw new ReadError("SonarQube sent a hotspot without a status");
      const resolution = text(h.resolution);
      const severity = severityOf(maps.sonar, text(obj(h.rule).vulnerabilityProbability));
      return { state: status === "REVIEWED" ? "done" : "open", remote: `${words(status)}${resolution ? ` (${words(resolution)})` : ""}`, ...(severity ? { severity } : {}) };
    }
    const gate = text(obj(obj(bodies[0]).projectStatus).status);
    if (!gate) throw new ReadError("SonarQube sent a quality gate without a status");
    const measures = obj(obj(bodies[1]).component).measures;
    const counts: string[] = [];
    for (const [metric, singular, plural] of METRICS) {
      const m = Array.isArray(measures) ? measures.map(obj).find((x) => x.metric === metric) : undefined;
      const n = Number(text(m?.value) || m?.value);
      if (Number.isFinite(n) && n > 0) counts.push(`${n} ${n === 1 ? singular : plural}`);
    }
    const tail = counts.length ? ` · ${counts.join(", ")}` : "";
    if (gate === "OK") return { state: "done", remote: `Quality gate passed${tail}` };
    if (gate === "ERROR") return { state: "open", remote: `Quality gate failed${tail}` };
    if (gate === "WARN") return { state: "open", remote: `Quality gate warning${tail}` };
    return { state: "open", remote: `No quality gate${tail}` };
  },
};
