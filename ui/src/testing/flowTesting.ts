import type { FlowStep } from "../types";

/** What the testing mode adds to a flow's steps (the flow card and the flow panel). */
export interface FlowTesting {
  /** "live": an open intercept point covers the step; "watched": only the chosen trace shows it; "not live": neither. */
  liveness(step: FlowStep): "live" | "watched" | "not-live";
  hasBreakpoint(step: FlowStep): boolean;
  toggleBreakpoint(step: FlowStep): void;
}

export const LIVENESS_LABEL = { live: "live", watched: "watched", "not-live": "not live" } as const;
