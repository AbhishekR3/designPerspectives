/** Read-only element list of the open workspace. */
import { kindLabel } from "@designperspectives/contracts";
import type { ElementRow } from "../shared/ipc.js";

export function ElementList({ rows }: { rows: ElementRow[] }) {
  return (
    <section className="element-list" aria-labelledby="elements-heading">
      <h2 id="elements-heading">Elements ({rows.length})</h2>
      <table data-testid="element-list">
        <thead>
          <tr>
            <th scope="col">Element</th>
            <th scope="col">Technology</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid="element-row" title={r.description ?? ""}>
              <td>
                <div className="el-title">{r.title}</div>
                <div className="el-meta">
                  <code>{r.id}</code> <span className="el-kind">[{kindLabel(r.kind)}]</span>
                </div>
              </td>
              <td className="el-tech">{r.technology ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
