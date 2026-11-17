import { useEffect } from "react";

const mac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const MOD = mac ? "Cmd" : "Ctrl";

/** Every keyboard shortcut there is (see useShortcuts.ts), as key and what it does. */
const SHORTCUTS: [string, string][] = [
  ["?", "Show or hide this help"],
  [`${MOD}+K`, "Find an object or a diagram"],
  ["F2", "Rename the selected box (a line: its name in the panel)"],
  ["Delete", "Delete the selected box, boxes or line"],
  ["Arrow keys", "Move the selected box or boxes by 10 (Shift: 40)"],
  [`Shift+click or ${MOD}+click, Shift+drag`, "Select several boxes"],
  [`${MOD}+C, ${MOD}+V, ${MOD}+D`, "Copy, paste, duplicate the selected box"],
  [`${MOD}+Z, ${MOD}+Shift+Z`, "Undo, redo"],
  [`${MOD}+0, ${MOD}+plus, ${MOD}+minus`, "Fit the diagram to the window, zoom in, zoom out"],
  ["Shift+F10, Menu key", "Open the right-click menu for the selection"],
  ["Alt+Left, Alt+Right", "Back, forward between diagrams"],
  ["Escape", "Close a menu or dialog, or clear the selection"],
];

/** Keys of the system testing mode, shown under their own heading. */
const TESTING_SHORTCUTS: [string, string][] = [
  ["F8", "Continue the paused call"],
  ["F10", "Continue it, and pause the next call or reply"],
  ["F9", "Set or take away a breakpoint on the selected line or box"],
];

/** The help card: how to work on the canvas and the shortcut list. It scrolls when the window is short, and Escape closes it. */
export function HelpCard({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="float help-card small" data-testid="help-card" role="region" aria-label="Help">
      <ul className="hints">
        <li>Click a box or line to see and edit it in the panel on the right.</li>
        <li>
          Right-click a box, a line or empty space for a menu of what you can do there (open, rename, copy and paste, symbol, line shape, arrows, style, add here, layout, make room, spread out, zoom).
        </li>
        <li>Double-click a system or container to open the next level.</li>
        <li>Add: drag a database, queue, pipeline, service and more from the Add palette onto the diagram, or click it.</li>
        <li>Drag from a dot on any side of a box to another box to connect them, or to empty space to pick a kind and add a connected box.</li>
        <li>Shift+click or {MOD}+click boxes, or Shift+drag over empty canvas, to select several: drag or use the arrow keys to move them together, Delete removes them (one undo step).</li>
        <li>
          On a context, container or component diagram a new person or system is connected to the system, or to the box you selected. Right-click a container or component, then Move to…, to put it in
          another parent.
        </li>
        <li>Rename on the canvas: select a box, then click its name (or press F2). The bar above a selected box also changes its symbol, opens it, duplicates or deletes it.</li>
        <li>Select a box to resize it; select a line to drag its ends, bend it, or slide its label along it.</li>
        <li>Double-click a line to open the connector behind it.</li>
        <li>
          Comments: right-click a box, a line or empty space and choose Comment…, or use the speech-bubble button in the tools bar for the list of this diagram. Mark a note as a comment, an idea or a
          question; reply, then resolve it. Every role can do this, a viewer too.
        </li>
        <li>Dashed lines are derived from relationships between elements inside the boxes.</li>
        <li>Bottom left: colour boxes by a tag group, technology, characteristic or cost; click a value to focus on or hide those boxes.</li>
      </ul>
      <h4>Keyboard</h4>
      <dl className="keys" data-testid="help-shortcuts">
        {SHORTCUTS.map(([k, what]) => (
          <div key={k} className="key-row">
            <dt>
              {k.split(", ").map((x) => (
                <kbd key={x}>{x}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <h4>System testing</h4>
      <dl className="keys" data-testid="help-testing-shortcuts">
        {TESTING_SHORTCUTS.map(([k, what]) => (
          <div key={k} className="key-row">
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">These keys work while the Test mode is on.</p>
    </div>
  );
}
