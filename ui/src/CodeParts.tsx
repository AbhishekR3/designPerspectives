import { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./fields";

/** Browse the code folder and pick a file or folder. */
export function CodePicker({ onPick, onClose }: { onPick(path: string): void; onClose(): void }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<{ name: string; path: string; type: "dir" | "file" }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .codeTree(path)
      .then((r) => {
        setEntries(r.entries);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [path]);
  const up = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return (
    <Modal title="Choose code" onClose={onClose}>
      <div className="muted small">Folder: /{path}</div>
      {error && <div className="error">{error}</div>}
      <ul className="picker" data-testid="code-picker">
        {path && (
          <li>
            <button className="link" onClick={() => setPath(up)}>
              ↑ ..
            </button>
          </li>
        )}
        {entries.map((e) => (
          <li key={e.path} className="row between">
            <button className="link" onClick={() => (e.type === "dir" ? setPath(e.path) : onPick(e.path))} data-testid={`pick-${e.path}`}>
              {e.type === "dir" ? "📁" : "📄"} {e.name}
            </button>
            <button onClick={() => onPick(e.path)} aria-label={`Select ${e.name}`}>
              Select
            </button>
          </li>
        ))}
        {entries.length === 0 && !error && <li className="muted">Empty folder</li>}
      </ul>
    </Modal>
  );
}

/** The code paths of an element or connector, with a picker. */
export function CodePaths({
  paths,
  onSave,
  onOpenDiagram,
}: {
  paths: string[];
  onSave(paths: string[]): void;
  onOpenDiagram?(): void;
}) {
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState("");
  const add = (p: string) => {
    const v = p.trim();
    if (v && !paths.includes(v)) onSave([...paths, v]);
    setText("");
  };
  return (
    <div data-testid="code-paths">
      <ul className="links">
        {paths.map((p) => (
          <li key={p}>
            <code>{p}</code>
            <button className="icon" aria-label={`Remove ${p}`} onClick={() => onSave(paths.filter((x) => x !== p))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input placeholder="path/to/file or folder" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(text)} data-testid="code-path-input" />
        <button onClick={() => add(text)} disabled={!text.trim()}>
          Add
        </button>
        <button onClick={() => setPicking(true)} data-testid="code-browse">
          Browse…
        </button>
      </div>
      {onOpenDiagram && paths.length > 0 && (
        <button onClick={onOpenDiagram} data-testid="open-code-diagram">
          Open code diagram
        </button>
      )}
      {picking && (
        <CodePicker
          onClose={() => setPicking(false)}
          onPick={(p) => {
            add(p);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/** Edit one source file. Saves back to the file on disk. */
export function FileEditor({ path, onClose }: { path: string; onClose(): void }) {
  const [content, setContent] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [mtime, setMtime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api
      .codeFile(path)
      .then((f) => {
        setContent(f.content);
        setOrig(f.content);
        setMtime(f.mtime);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [path]);
  const dirty = content !== null && content !== orig;
  const save = async () => {
    if (content === null) return;
    try {
      const r = await api.saveCodeFile(path, content, mtime);
      setMtime(r.mtime);
      setOrig(content);
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const close = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };
  return (
    <Modal title={path} onClose={close} wide>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {content !== null && (
        <textarea
          className="code-editor"
          value={content}
          spellCheck={false}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              save();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = t;
              setContent(content.slice(0, a) + "    " + content.slice(b));
              requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = a + 4));
            }
          }}
          data-testid="code-editor"
        />
      )}
      <div className="modal-actions">
        <span className="muted small">{saved ? "Saved." : dirty ? "Unsaved changes" : "Ctrl/Cmd+S saves to the file"}</span>
        <span className="spacer" />
        <button onClick={close}>Close</button>
        <button className="primary" onClick={save} disabled={!dirty} data-testid="code-save">
          Save
        </button>
      </div>
    </Modal>
  );
}
