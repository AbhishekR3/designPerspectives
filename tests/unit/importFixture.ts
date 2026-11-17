/** A valid import file over the demo model, for the import tests (a fresh copy per call). */

import fs from "node:fs";
import path from "node:path";
import type { ImportFile } from "../../src/shared/types.js";

export function sampleImport(): ImportFile {
  return {
    schemaVersion: 1,
    promptVersion: "1.0.0",
    level: "c2",
    source: { kind: "hand" },
    objects: [
      {
        id: "ledger-service",
        type: "container",
        name: "Ledger Service",
        parent: "internet-banking-system",
        description: "Keeps the ledger of every posted entry.",
        technologies: ["typescript", "Node.js"],
        owner: "Payments team",
        tags: { Risk: "Low" },
        codePaths: ["sample_code/payments"],
        evidence: [{ kind: "file", path: "sample_code/payments/controller.ts", lines: [1, 3], text: "EVIDENCE-MARKER-QUOTE" }],
        confidence: "medium",
      },
      {
        id: "ledger-events",
        type: "container",
        name: "Ledger Events",
        parent: "internet-banking-system",
        archType: "queue",
        technologies: ["Kafka"],
        evidence: [{ kind: "user", note: "EVIDENCE-MARKER-USER" }],
        confidence: "low",
      },
    ],
    relationships: [
      {
        source: "api-application",
        target: "ledger-service",
        description: "Posts ledger entries to",
        technologies: ["HTTPS"],
        evidence: [{ kind: "scan", fact: "EVIDENCE-MARKER-SCAN" }],
        confidence: "high",
      },
      { source: "ledger-service", target: "database", via: "ledger-events", description: "Publishes ledger events to", viaDescription: "Delivers ledger events to", technologies: ["Kafka"] },
    ],
    flows: [
      {
        title: "Post a ledger entry",
        steps: [{ relationship: "api-application--ledger-service" }, { relationship: "ledger-service--ledger-events", note: "Publishes the entry" }, { relationship: "ledger-events--database" }],
      },
    ],
    decisions: [
      {
        title: "Keep a separate ledger service",
        status: "proposed",
        context: "The API writes balances directly.",
        decision: "Move ledger writes to their own service.",
        alternatives: [{ name: "Keep it in the API", whyNot: "Couples releases." }],
        affects: ["ledger-service", "api-application--ledger-service"],
        evidence: [{ kind: "user", note: "EVIDENCE-MARKER-DECISION" }],
      },
    ],
    questions: ["Who owns the ledger?"],
    assumptions: ["The ledger is append-only."],
    ignore: ["IGNORE-MARKER/generated"],
  };
}

/** Write what "a person typed" into the project's intake (`architecture/import/intake.json`): a `user` note counts only when it is found there. */
export function typeIntake(dir: string, ...texts: string[]): void {
  const d = path.join(dir, "architecture", "import");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "intake.json"), JSON.stringify({ schemaVersion: 1, system: { name: "", purpose: texts.join("\n") } }));
}

/** The notes of the sample import file and of the demo example. */
export const SAMPLE_NOTES = ["EVIDENCE-MARKER-USER", "EVIDENCE-MARKER-DECISION"];
