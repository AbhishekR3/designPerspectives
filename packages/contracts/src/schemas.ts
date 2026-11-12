/**
 * Sidecar and workspace file schemas (spec file 04 §1, §4–§7, file 02 §4).
 * Zod is the source of truth; JSON Schema files are generated from these (tools/gen-json-schema.mjs).
 * Schemas are `strict`: unknown keys are errors, so typos surface in `dp validate`.
 */
import { z } from "zod";
import { ELEMENT_KINDS, GROUP_TYPES, RELATIONSHIP_KINDS } from "./model.js";

const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, "ISO-8601 date-time expected");
const elementId = z.string().regex(/^[a-z][a-zA-Z0-9-]*(\.[a-z][a-zA-Z0-9-]*)*$/, "element id: dot-separated slugs");
const SEG = "[a-z][a-zA-Z0-9-]*";
const relationshipId = z
  .string()
  .regex(
    new RegExp(`^${SEG}(\\.${SEG})*->${SEG}(\\.${SEG})*#(${RELATIONSHIP_KINDS.join("|")})(:[a-z0-9-]+)?$`),
    "relationship id: <source>-><target>#<kind>[:<key>]",
  );
/** Ids that become file names (layout views, notes, risk sessions): no path separators. */
const fileId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "file-safe id: letters, digits, '.', '_' or '-'");

// ---- designperspectives.yaml ---------------------------------------------------------------
export const WorkspaceSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1),
    description: z.string().optional(),
    modelBackend: z.enum(["likec4"]).default("likec4"),
    /** Path to the ADR folder, relative to `architecture/` or absolute (file 04 §1). */
    decisions: z.string().default("decisions"),
    plugins: z.array(z.string()).default([]),
    thresholds: z
      .object({
        /** Decisions above this cost need review-board approval (file 02 §4.3). */
        decisionCostUsd: z.number().nonnegative().default(5000),
      })
      .strict()
      .default({ decisionCostUsd: 5000 }),
  })
  .strict();
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

// ---- provenance ----------------------------------------------------------------------------
export const PROVENANCE_SOURCES = ["manual", "parser-tier1", "parser-tier2", "iac", "cloud", "trace", "llm", "import"] as const;
export const ProvenanceSchema = z
  .object({
    source: z.enum(PROVENANCE_SOURCES),
    evidence: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    confirmedBy: z.string().optional(),
    at: isoDateTime,
  })
  .strict()
  .refine((p) => p.source !== "llm" || !!p.confirmedBy, {
    message: "provenance with source 'llm' requires confirmedBy (FF10)",
    path: ["confirmedBy"],
  });
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ---- sidecars/elements/<id>.yaml (file 04 §4.1) ----------------------------------------------
const riskCell = z
  .object({
    impact: z.number().int().min(1).max(3),
    likelihood: z.number().int().min(1).max(3),
    score: z.number().int().min(1).max(9),
    direction: z.enum(["up", "down", "same"]).optional(),
  })
  .strict()
  .refine((r) => r.score === r.impact * r.likelihood, { message: "score must equal impact × likelihood", path: ["score"] });

export const ElementSidecarSchema = z
  .object({
    id: elementId,
    owners: z.array(z.string()).optional(),
    teamType: z.enum(["stream-aligned", "enabling", "complicated-subsystem", "platform"]).optional(),
    status: z.enum(["proposed", "accepted", "deprecated"]).optional(),
    provenance: z.array(ProvenanceSchema).optional(),
    characteristics: z.array(z.string()).optional(),
    quantum: z.string().optional(),
    risk: z.record(z.string(), riskCell).optional(),
    dataClassification: z.array(z.string()).optional(),
    sla: z.record(z.string(), z.string()).optional(),
    cost: z.object({ monthlyEstimate: z.number().nonnegative(), currency: z.string().length(3) }).strict().optional(),
    tags: z.array(z.string()).optional(),
    links: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type ElementSidecar = z.infer<typeof ElementSidecarSchema>;

// ---- sidecars/relationships.yaml (file 04 §4.2) --------------------------------------------
export const RelationshipSidecarEntrySchema = z
  .object({
    id: relationshipId,
    mode: z.enum(["sync", "async"]).optional(),
    protocol: z.string().optional(),
    payload: z
      .object({
        type: z.enum(["key-based", "data-based"]).optional(),
        approxBytes: z.number().nonnegative().optional(),
        ratePerSec: z.number().nonnegative().optional(),
      })
      .strict()
      .optional(),
    coupling: z.array(z.enum(["static", "dynamic"])).optional(),
    connascence: z.array(z.string()).optional(),
    latencyBudgetMs: z.record(z.string(), z.number().nonnegative()).optional(),
    dataLossChecklist: z.record(z.string(), z.boolean()).optional(),
    crossesTrustBoundary: z.boolean().optional(),
    authn: z.string().optional(),
    provenance: z.array(ProvenanceSchema).optional(),
  })
  .strict();
export const RelationshipsSidecarSchema = z.array(RelationshipSidecarEntrySchema);
export type RelationshipSidecarEntry = z.infer<typeof RelationshipSidecarEntrySchema>;

// ---- sidecars/characteristics.yaml (file 04 §4.3) ------------------------------------------
export const CharacteristicsSchema = z
  .object({
    driving: z
      .array(
        z
          .object({
            id: z.string().min(1),
            explicit: z.boolean(),
            trigger: z.string().optional(),
            structural: z.boolean().optional(),
            measures: z.array(z.string()).default([]),
            scope: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .max(7, "at most 7 driving characteristics [FoSA p.78]"),
    top3: z.array(z.string()).max(3),
    implicitConsidered: z.array(z.string()).default([]),
    othersConsidered: z.array(z.string()).default([]),
    composites: z.record(z.string(), z.array(z.string())).default({}),
    leastImportant: z.string().optional(),
  })
  .strict();
export type Characteristics = z.infer<typeof CharacteristicsSchema>;

// ---- sidecars/codemapping.yaml (file 04 §4.4) ----------------------------------------------
export const CodeMappingSchema = z
  .object({
    rules: z.array(
      z
        .object({
          element: elementId,
          include: z.array(z.string()).min(1),
          exclude: z.array(z.string()).default([]),
          language: z.string().optional(),
          pinned: z.boolean().default(false),
        })
        .strict(),
    ),
  })
  .strict();
export type CodeMapping = z.infer<typeof CodeMappingSchema>;

// ---- sidecars/layout/<view-id>.yaml --------------------------------------------------------
export const LayoutSchema = z
  .object({
    view: fileId,
    nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number() }).strict()),
  })
  .strict();
export type Layout = z.infer<typeof LayoutSchema>;

// ---- sidecars/notes/<id>.md front matter (file 04 §4.5) ------------------------------------
export const NoteFrontMatterSchema = z
  .object({
    id: fileId,
    anchor: z.string().min(1),
    type: z.enum(["comment", "question", "risk", "todo", "change-request"]),
    author: z.string().min(1),
    status: z.enum(["open", "sent-to-llm", "resolved"]),
    proposalId: z.string().optional(),
    created: isoDateTime,
  })
  .strict();
export type NoteFrontMatter = z.infer<typeof NoteFrontMatterSchema>;

// ---- sidecars/risk/<session-id>.yaml (file 03 §Risk) ---------------------------------------
export const RiskSessionSchema = z
  .object({
    id: fileId,
    criterion: z.string().min(1),
    view: z.string().optional(),
    status: z.enum(["scoring", "revealed", "consensus", "closed"]),
    participants: z.array(z.string()),
    scores: z.array(
      z
        .object({
          participant: z.string(),
          element: elementId,
          impact: z.number().int().min(1).max(3),
          likelihood: z.number().int().min(1).max(3),
        })
        .strict(),
    ),
    mitigations: z
      .array(z.object({ element: elementId, proposal: z.string(), costEstimate: z.string().optional() }).strict())
      .default([]),
  })
  .strict();
export type RiskSession = z.infer<typeof RiskSessionSchema>;

// ---- decisions/**/ADR-NNNN-<slug>.md front matter (file 04 §5) -----------------------------
export const ADR_STATUSES = ["draft", "rfc", "proposed", "accepted", "superseded", "deferred"] as const;
export const AdrFrontMatterSchema = z
  .object({
    id: z.string().regex(/^ADR-\d{4}$/),
    title: z.string().min(1),
    status: z.enum(ADR_STATUSES),
    rfcDeadline: z.string().nullable().optional(),
    supersedes: z.array(z.string()).default([]),
    supersededBy: z.string().nullable().optional(),
    elements: z.array(elementId).default([]),
    characteristics: z.array(z.string()).default([]),
    category: z.string().optional(),
    architecturallySignificant: z
      .array(z.enum(["structure", "nonfunctional", "dependencies", "interfaces", "construction"]))
      .default([]),
    contextSnapshot: z.record(z.string(), z.unknown()).optional(),
    costEstimate: z.object({ hours: z.number(), fteRate: z.number() }).strict().optional(),
    fitnessFunctions: z.array(z.string()).default([]),
    approvals: z.array(z.string()).default([]),
  })
  .strict();
export type AdrFrontMatter = z.infer<typeof AdrFrontMatterSchema>;

// ---- approvals/*.sig.yaml (file 04 §7) -----------------------------------------------------
export const ApprovalRecordSchema = z
  .object({
    subject: z.string().min(1),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    approver: z.string().min(1),
    role: z.string().min(1),
    at: isoDateTime,
    signature: z.string().optional(),
  })
  .strict();
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

// ---- permissions.yaml (file 02 §4) ---------------------------------------------------------
export const CAPABILITIES = ["view", "comment", "propose", "approve", "edit", "export", "admin"] as const;
export const PermissionsSchema = z
  .object({
    profiles: z.record(
      z.string(),
      z
        .object({
          title: z.string(),
          capabilities: z.array(z.enum(CAPABILITIES)),
          homeView: z.string().optional(),
          levels: z.array(z.enum(["landscape", "context", "container", "component", "code", "deployment", "dynamic"])).optional(),
          perspectives: z.array(z.string()).default([]),
          members: z.array(z.string()).default([]),
        })
        .strict(),
    ),
    decisionRights: z
      .array(
        z
          .object({
            category: z.string(),
            decides: z.array(z.string()).default([]),
            recommends: z.array(z.string()).default([]),
            approves: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type Permissions = z.infer<typeof PermissionsSchema>;

// ---- Proposals (file 04 §6) ----------------------------------------------------------------
const addElementOp = z
  .object({
    op: z.literal("addElement"),
    kind: z.enum(ELEMENT_KINDS),
    id: elementId,
    title: z.string().min(1),
    description: z.string().optional(),
    technology: z.string().optional(),
    groupType: z.enum(GROUP_TYPES).optional(),
  })
  .strict();
const addRelationshipOp = z
  .object({
    op: z.literal("addRelationship"),
    from: elementId,
    to: elementId,
    kind: z.enum(RELATIONSHIP_KINDS),
    label: z.string().min(1),
    technology: z.string().optional(),
  })
  .strict();
const setSidecarOp = z.object({ op: z.literal("setSidecar"), target: z.string(), path: z.string(), value: z.unknown() }).strict();
const removeOp = z.object({ op: z.enum(["removeElement", "removeRelationship"]), id: z.string() }).strict();
const proposeDecisionOp = z
  .object({ op: z.literal("proposeDecision"), title: z.string(), options: z.array(z.unknown()).min(1) })
  .strict();

export const ProposalSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(PROVENANCE_SOURCES),
    stage: z.string().optional(),
    rationale: z.string().optional(),
    operations: z.array(z.discriminatedUnion("op", [addElementOp, addRelationshipOp, setSidecarOp, removeOp, proposeDecisionOp])),
    tradeOffs: z.array(z.unknown()).default([]),
    lintResults: z.array(z.unknown()).default([]),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalSchema>;

/** Registry used by the loader and the JSON Schema generator. */
export const SIDECAR_SCHEMAS = {
  "designperspectives.yaml": WorkspaceSettingsSchema,
  "sidecars/elements/*.yaml": ElementSidecarSchema,
  "sidecars/relationships.yaml": RelationshipsSidecarSchema,
  "sidecars/characteristics.yaml": CharacteristicsSchema,
  "sidecars/codemapping.yaml": CodeMappingSchema,
  "sidecars/layout/*.yaml": LayoutSchema,
  "sidecars/notes/*.md": NoteFrontMatterSchema,
  "sidecars/risk/*.yaml": RiskSessionSchema,
  "decisions/**/ADR-*.md": AdrFrontMatterSchema,
  "approvals/*.sig.yaml": ApprovalRecordSchema,
  "permissions.yaml": PermissionsSchema,
} as const;
export type SidecarPattern = keyof typeof SIDECAR_SCHEMAS;
