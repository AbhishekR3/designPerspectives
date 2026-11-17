import { useState } from "react";
import { useModalBehavior } from "../panels/formParts";
import { Icon, iconFor } from "./icons";
import { KIND_LABEL, LEVEL_LABEL, type AppState } from "../types";

/** Ctrl/Cmd+K: find an object or a diagram by name, description or technology. A modal dialog: focus stays inside and returns on close (useModalBehavior). */
export function SearchBox({ state, onClose, onPick, onOpen }: { state: AppState; onClose(): void; onPick(id: string): void; onOpen(key: string): void }) {
  const box = useModalBehavior(onClose);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const t = q.trim().toLowerCase();
  const els = state.elements
    .filter((e) => !t || e.name.toLowerCase().includes(t) || e.description.toLowerCase().includes(t) || e.technologies.some((x) => x.toLowerCase().includes(t)))
    .slice(0, 10)
    .map((e) => ({ type: "el" as const, id: e.id, label: e.name, sub: `${KIND_LABEL[e.kind]}${e.technologies.length ? ` · ${e.technologies.join(", ")}` : ""}`, icon: iconFor(e.kind, e.archType) }));
  const ds = state.diagrams
    .filter((d) => t && (d.title.toLowerCase().includes(t) || d.label.toLowerCase().includes(t)))
    .slice(0, 5)
    .map((d) => ({ type: "d" as const, id: d.key, label: d.title, sub: `${d.c4 ? `${d.c4} · ` : ""}${LEVEL_LABEL[d.level]} diagram`, icon: "layers" }));
  const items = [...els, ...ds];
  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    if (it.type === "el") onPick(it.id);
    else onOpen(it.id);
  };
  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-box" role="dialog" aria-modal="true" aria-label="Search" tabIndex={-1} ref={box}>
        <div className="search-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder="Find an object or diagram…"
            onChange={(e) => {
              setQ(e.target.value);
              setCur(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setCur(Math.min(items.length - 1, cur + 1));
              else if (e.key === "ArrowUp") setCur(Math.max(0, cur - 1));
              else if (e.key === "Enter") pick(cur);
              else return;
              e.preventDefault();
            }}
            data-testid="search-input"
          />
        </div>
        <ul className="search-results">
          {items.map((it, i) => (
            <li key={`${it.type}-${it.id}`}>
              <button className={i === cur ? "on" : ""} onMouseEnter={() => setCur(i)} onClick={() => pick(i)} title={`${it.label}: ${it.sub}`} data-testid={`result-${it.id}`}>
                <Icon name={it.icon} size={15} />
                <span className="truncate">{it.label}</span>
                <span className="muted small truncate">{it.sub}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="empty-note pad">Nothing found.</li>}
        </ul>
      </div>
    </div>
  );
}
