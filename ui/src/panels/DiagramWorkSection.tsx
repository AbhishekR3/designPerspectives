/** Linked work pinned to a diagram or a flow itself (DEC-085): the same section as for a box or a line, saved with `PUT /api/work/target`. */
import { api } from "../api";
import { isOpenWork } from "../../../src/shared/workLinks";
import { Section } from "./formParts";
import { WorkEditor, WorkRefreshButton } from "./listEditors";
import type { Common } from "./panelProps";
import type { AppState, WorkItem, WorkTarget } from "../types";

export function DiagramWorkSection({ state, rows, target, mutate }: { state: AppState; rows: WorkItem[]; target: WorkTarget; mutate: Common["mutate"] }) {
  const open = rows.filter(isOpenWork).length;
  return (
    <Section title={`Linked work${open ? ` · ${open} open` : ""}`} count={rows.length} testId="sec-diagram-work" footer={<WorkRefreshButton state={state} mutate={mutate} extra={rows} />}>
      <WorkEditor rows={rows} enums={state.enums} connections={state.workConnections} onSave={(r) => void mutate(() => api.setWork(target, r))} />
    </Section>
  );
}
