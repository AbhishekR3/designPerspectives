import { addBlockedReason, needsConnection } from "./connectRequired";
import { Icon, iconFor } from "./icons";
import type { Diagram } from "./types";

/** One thing that can be added: a C4 kind plus the symbol (architecture type) it starts with. */
export interface PaletteItem {
  kind: string;
  archType?: string;
  external?: boolean;
  label: string;
  name: string; // starting name; numbered if taken ("Database 2")
  testId: string;
}

export const DRAG_TYPE = "application/x-dp-item";

const TYPED: { archType: string; label: string }[] = [
  { archType: "service", label: "Service / API" },
  { archType: "web", label: "Web app" },
  { archType: "mobile", label: "Mobile app" },
  { archType: "database", label: "Database" },
  { archType: "cache", label: "Cache" },
  { archType: "queue", label: "Queue / stream" },
  { archType: "pipeline", label: "Pipeline / job" },
  { archType: "storage", label: "File storage" },
  { archType: "cloud", label: "Cloud service" },
  { archType: "document", label: "Document" },
];

/** What can be added on this diagram, most common first. */
export function paletteItems(d: Diagram): PaletteItem[] {
  const out: PaletteItem[] = [];
  const can = (k: string) => d.addable.includes(k);
  for (const kind of ["container", "component"]) {
    if (!can(kind)) continue;
    const word = kind === "container" ? "Container" : "Component";
    out.push({ kind, label: word, name: `New ${kind}`, testId: `add-${kind}` });
    for (const t of TYPED) out.push({ kind, archType: t.archType, label: t.label, name: t.label.split(" /")[0], testId: `add-${kind}-${t.archType}` });
  }
  if (can("softwareSystem")) {
    out.push({ kind: "softwareSystem", label: "Software system", name: "New system", testId: "add-softwareSystem" });
    out.push({ kind: "softwareSystem", external: true, label: "External system", name: "External system", testId: "add-softwareSystem-external" });
  }
  if (can("person")) out.push({ kind: "person", label: "Person", name: "New person", testId: "add-person" });
  if (can("stage")) out.push({ kind: "stage", label: "Stage", name: "", testId: "add-stage" });
  return out;
}

/**
 * Left-hand palette: drag an item onto the canvas to place it there, or click it to add it in the
 * nearest free spot. Lines dragged from a box's dot onto empty canvas create a connected box.
 */
export function Palette({ diagram, open, onToggle, onAdd }: { diagram: Diagram; open: boolean; onToggle(): void; onAdd(item: PaletteItem): void }) {
  const items = paletteItems(diagram);
  if (!items.length) return null;
  return (
    <div className={`palette float${open ? "" : " closed"}`} data-testid="palette" data-occludes="left">
      <button
        className="palette-head ghost"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Collapse the Add palette" : "Open the Add palette"}
        title={open ? "Collapse the Add palette" : "Add objects to the diagram"}
        data-testid="palette-toggle"
      >
        <Icon name="plus" size={14} /> <span>Add</span>
        <Icon name="chevron" size={12} className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="palette-scroll">
          <div className="palette-items">
            {items.map((it) => {
              // A person or system that must connect to a box inside is off while the boundary is empty.
              const blocked = addBlockedReason(diagram, it.kind);
              const connects = needsConnection(diagram, it.kind);
              return (
                <button
                  key={it.testId}
                  className="palette-item ghost"
                  draggable={!blocked}
                  disabled={!!blocked}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(it));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAdd(it)}
                  title={
                    blocked ??
                    `${it.label}: drag onto the diagram, or click to add${connects ? (diagram.level === "context" ? ". It is connected to the system." : ". It is connected to the selected box.") : ""}`
                  }
                  data-testid={it.testId}
                >
                  <Icon name={it.kind === "stage" ? "stage" : iconFor(it.kind, it.archType)} size={15} />
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
          <div className="palette-hint muted">
            Drag onto the diagram, or click. Drag from a box's dot to empty space to add a connected box.
            {(diagram.connectRequired ?? []).length > 0 && diagram.level !== "context" && " A person or system is connected to the selected box."}
          </div>
        </div>
      )}
    </div>
  );
}
