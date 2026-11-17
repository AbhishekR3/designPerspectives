import type { BacktrackQuery } from "../api";
import type { AppState, CatalogEntry, Diagram, Lens } from "../types";

export interface Common {
  state: AppState;
  diagram: Diagram;
  lens: Lens;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onSelect(sel: { type: "node" | "edge"; id: string } | null): void;
  /** Rename an element; its first rename after creation also makes its ID readable. */
  onRename(id: string, name: string): Promise<boolean>;
  /** Open the "Move to…" dialog (containers and components). */
  onMove(id: string): void;
  onOpen(key: string): void;
  onReveal(elementId: string): void;
  onOpenFile(path: string): void;
  /** Backtrack from a connector stage (0 = the data entering it) or a flow step. */
  onBacktrack(q: BacktrackQuery): void;
  /** Open a decision record on the decisions page. */
  onOpenDecision(id: string): void;
  /** Ask BMO to explain an element or a relationship (opens the BMO sheet). */
  onExplain(target: { element?: string; relationship?: string }, name: string): void;
  /** Open the BMO chat with this element or relationship referred to in its input. */
  onAsk?(target: { element?: string; relationship?: string }): void;
  /** The hub's shared catalog elements; null when this project is not in a hub with a catalog (or is the catalog). */
  catalog: CatalogEntry[] | null;
  focusName: boolean;
}

export const sameKeys = <T>(a: T[], b: T[]) => JSON.stringify(a) === JSON.stringify(b);
