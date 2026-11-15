import type { AppState, Diagram, Lens } from "../types";

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
  focusName: boolean;
}

export const sameKeys = <T,>(a: T[], b: T[]) => JSON.stringify(a) === JSON.stringify(b);
