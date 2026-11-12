/** designPerspectives desktop shell: workspace header, element list, one view canvas with key, demo job. */
import { useEffect, useState } from "react";
import type { ElementRow, VersionInfo, ViewPayload, WorkspaceSummary } from "../shared/ipc.js";
import { Canvas } from "./Canvas.js";
import { DemoJob } from "./DemoJob.js";
import { dp } from "./dp.js";
import { ElementList } from "./ElementList.js";
import { KeyPanel } from "./KeyPanel.js";

function defaultViewId(ws: WorkspaceSummary): string | undefined {
  return (ws.views.find((v) => v.type === "container") ?? ws.views[0])?.id;
}

function countBy(ws: WorkspaceSummary | undefined, severity: string): number {
  return ws?.diagnostics.filter((d) => d.severity === severity).length ?? 0;
}

function StatusBar({ ws, version, error }: { ws?: WorkspaceSummary; version?: VersionInfo; error?: string }) {
  const notes = ws?.diagnostics.filter((d) => d.code.startsWith("desktop/")) ?? [];
  const errors = countBy(ws, "error");
  const warnings = countBy(ws, "warning");
  return (
    <footer className="status-bar" data-testid="status-bar">
      <span data-testid="diagnostics-count">
        Diagnostics: {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"}, {countBy(ws, "info")} info
      </span>
      {notes.map((n) => (
        <span key={n.code} className="status-note" data-testid="status-note">
          Note: {n.message}
        </span>
      ))}
      {error ? (
        <span className="error" role="alert">
          Error: {error}
        </span>
      ) : null}
      {version ? (
        <span className="status-version">
          IPC v{version.ipcApi} · Electron {version.electron} · Node {version.node}
        </span>
      ) : null}
    </footer>
  );
}

export function App() {
  const [version, setVersion] = useState<VersionInfo>();
  const [ws, setWs] = useState<WorkspaceSummary>();
  const [elements, setElements] = useState<ElementRow[]>([]);
  const [viewId, setViewId] = useState<string>();
  const [payload, setPayload] = useState<ViewPayload>();
  const [error, setError] = useState<string>();
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    void (async () => {
      const v = await dp().version();
      if (v.ok) setVersion(v.value);
      const w = await dp().openWorkspace();
      if (!w.ok) return setError(w.error);
      setWs(w.value);
      const els = await dp().listElements();
      if (els.ok) setElements(els.value);
      else setError(els.error);
      setViewId(defaultViewId(w.value));
    })();
  }, []);

  useEffect(() => {
    if (!viewId) return;
    let stale = false;
    setLoadingView(true);
    void dp()
      .getView(viewId)
      .then((r) => {
        if (stale) return;
        setLoadingView(false);
        if (r.ok) {
          setPayload(r.value);
          setError(undefined);
        } else setError(r.error);
      });
    return () => {
      stale = true;
    };
  }, [viewId]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>designPerspectives</h1>
        <div className="ws-name" data-testid="workspace-name">
          {ws ? ws.name : "Opening workspace…"}
        </div>
        {ws ? (
          <div className="ws-meta">
            {ws.elementCount} elements · {ws.relationshipCount} relationships · {ws.views.length} views · <code>{ws.root}</code>
          </div>
        ) : null}
      </header>
      <aside className="side">
        <ElementList rows={elements} />
        <DemoJob />
      </aside>
      <main className="main">
        <div className="view-bar">
          <label htmlFor="view-select">View</label>
          <select id="view-select" value={viewId ?? ""} onChange={(e) => setViewId(e.target.value)} data-testid="view-select">
            {ws?.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.type})
              </option>
            ))}
          </select>
          {loadingView ? <span className="muted">Laying out…</span> : null}
        </div>
        {payload ? (
          <>
            <h2 className="view-title" data-testid="view-title">
              {payload.view.title}
            </h2>
            {payload.view.description ? <p className="view-desc">{payload.view.description}</p> : null}
            <div className="view-body">
              <Canvas view={payload.view} />
              <KeyPanel entries={payload.key} />
            </div>
          </>
        ) : (
          <p className="muted">No view loaded yet.</p>
        )}
      </main>
      <StatusBar ws={ws} version={version} error={error} />
    </div>
  );
}
