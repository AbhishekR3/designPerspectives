import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal, useBusy } from "./fields";
import { confirmDialog, promptDialog } from "../common/dialogs";

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
            <button onClick={() => onPick(e.path)} aria-label={`Select ${e.name}`} title={`Select ${e.name}`}>
              Select
            </button>
          </li>
        ))}
        {entries.length === 0 && !error && <li className="muted">Empty folder</li>}
      </ul>
    </Modal>
  );
}

/**
 * "+ New planned file" (drafts only): ask for a path, plan the file in the draft and map the path to
 * `ownerId` (an element or a relationship), as one request: both happen or neither. Then open it.
 */
export function NewPlannedFile({ ownerId, paths, mutate, onOpenFile }: { ownerId: string; paths: string[]; mutate(fn: () => Promise<unknown>): Promise<boolean>; onOpenFile(path: string): void }) {
  const create = async () => {
    const folder = paths.find((x) => !/\.[A-Za-z0-9]+$/.test(x)) ?? paths[0]?.replace(/[^/]*$/, "") ?? "";
    const path = await promptDialog({ title: "Path of the new file", label: "Relative to the code folder", initial: folder ? `${folder.replace(/\/$/, "")}/` : "", confirmLabel: "Create" });
    if (!path) return;
    const done = await mutate(() => api.newCodeFile(path, "", ownerId));
    if (done) onOpenFile(path);
  };
  return (
    <button onClick={() => void create()} data-testid="new-planned-file">
      + New planned file
    </button>
  );
}

/** "Open code diagram": a Section footer, so it also works while the panel is read-only. */
export function OpenCodeDiagram({ onOpen }: { onOpen(): void }) {
  return (
    <button onClick={onOpen} data-testid="open-code-diagram">
      Open code diagram
    </button>
  );
}

/** The code paths of an element or connector, with a picker. */
export function CodePaths({ paths, onSave }: { paths: string[]; onSave(paths: string[]): void }) {
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
            <button className="icon edit-only" aria-label={`Remove ${p}`} title={`Remove ${p}`} onClick={() => onSave(paths.filter((x) => x !== p))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row edit-only">
        <input placeholder="path/to/file or folder" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(text)} data-testid="code-path-input" />
        <button onClick={() => add(text)} disabled={!text.trim()}>
          Add
        </button>
        <button onClick={() => setPicking(true)} data-testid="code-browse">
          Browse…
        </button>
      </div>
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

const PLANNED_TEXT: Record<string, string> = {
  added: "New file planned in this draft.",
  changed: "This draft plans a change to this file.",
  deleted: "This draft plans to delete this file (the current version is shown).",
};

/** Edit one source file. Saves back to the file on disk; in a draft, to the draft's planned edits. */
export function FileEditor({
  path,
  onClose,
  inDraft = false,
  onChanged,
  readOnlyNote = "Read-only.",
}: {
  path: string;
  onClose(): void;
  inDraft?: boolean;
  onChanged?(): void;
  /** Why the server says the file cannot be saved here (a git version, or the person's role). */ readOnlyNote?: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [mtime, setMtime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [planned, setPlanned] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const load = () =>
    api
      .codeFile(path)
      .then((f) => {
        setContent(f.content);
        setOrig(f.content);
        setMtime(f.mtime);
        setPlanned(f.planned);
        setReadOnly(f.readOnly);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const act = async (fn: () => Promise<unknown>, close = false) => {
    try {
      await fn();
      setError(null);
      onChanged?.();
      if (close) onClose();
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const dirty = content !== null && content !== orig;
  const frozen = readOnly || planned === "deleted";
  const canSave = dirty && !readOnly && planned !== "deleted";
  const [saving, guard] = useBusy();
  const save = () =>
    guard(async () => {
      if (content === null || !canSave) return;
      try {
        const r = await api.saveCodeFile(path, content, mtime);
        setMtime(r.mtime);
        setOrig(content);
        setSaved(true);
        setError(null);
        if (inDraft) {
          onChanged?.();
          await load();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  const close = async () => {
    if (dirty && !(await confirmDialog({ title: "Close without saving your changes?", confirmLabel: "Close without saving", danger: true }))) return;
    onClose();
  };
  return (
    <Modal title={path} onClose={close} wide>
      {readOnly && (
        <div className="note small" data-testid="code-readonly-note">
          {readOnlyNote}
        </div>
      )}
      {!readOnly && planned === "deleted" && (
        <div className="note small" data-testid="code-readonly-note">
          Read-only: this file is planned for deletion in this draft.
        </div>
      )}
      {inDraft && readOnly && planned && (
        <div className="draft-note small" data-testid="code-draft-note">
          {PLANNED_TEXT[planned]}
        </div>
      )}
      {inDraft && !readOnly && (
        <div className="draft-note small" data-testid="code-draft-note">
          {planned ? PLANNED_TEXT[planned] : "Saving here plans the change in the draft."} The code folder is only written when the draft is applied.
          <span className="spacer" />
          {planned && (
            <button className="small" onClick={() => act(() => api.revertCodeFile(path), planned === "added")} data-testid="code-revert">
              {planned === "added" ? "Drop the new file" : "Revert to the code folder's version"}
            </button>
          )}
          {planned !== "deleted" && planned !== "added" && (
            <button
              className="small"
              onClick={async () => (await confirmDialog({ title: `Plan to delete ${path}?`, confirmLabel: "Plan deletion", danger: true })) && act(() => api.deleteCodeFile(path))}
              data-testid="code-plan-delete"
            >
              Plan deletion
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {content === null && !error && (
        <p className="muted" data-testid="code-loading">
          Loading…
        </p>
      )}
      {content !== null && (
        <textarea
          className="code-editor"
          value={content}
          readOnly={frozen}
          spellCheck={false}
          onChange={(e) => {
            setContent(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              if (canSave) void save();
            }
            if (e.key === "Tab" && !frozen) {
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
        <span className="muted small">
          {saved ? (inDraft ? "Saved to the draft." : "Saved.") : dirty ? "Unsaved changes" : readOnly ? "" : inDraft ? "Ctrl/Cmd+S saves to the draft" : "Ctrl/Cmd+S saves to the file"}
        </span>
        <span className="spacer" />
        <button onClick={close}>Close</button>
        {!readOnly && (
          <button className="primary" onClick={() => void save()} disabled={!canSave} aria-busy={saving} data-testid="code-save">
            Save
          </button>
        )}
      </div>
    </Modal>
  );
}
