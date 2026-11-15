import type { DiagramLevel } from "./types";

/** One-line hint for an empty diagram, specific to its level. */
export function emptyHint(level: DiagramLevel, readOnly: boolean): string {
  if (readOnly) return level === "landscape" ? "This model is empty." : "Nothing on this diagram.";
  switch (level) {
    case "landscape":
      return "This model is empty.";
    case "context":
      return "Nothing here yet. Add a person or a software system from the palette.";
    case "container":
      return "Nothing inside this system yet. Add a container from the palette.";
    case "component":
      return "Nothing inside this container yet. Add a component from the palette.";
    case "connector":
      return "No stages yet. Add a stage from the palette.";
    case "flow":
      return "This flow has no steps yet. Add steps in the panel on the right.";
    case "code":
      return "No files yet. Add code paths in the panel on the right.";
  }
}

/** First-run card on an empty landscape: what to do first, with the two usual starting points. */
export function EmptyStart({ onAdd }: { onAdd(testId: "add-person" | "add-softwareSystem"): void }) {
  return (
    <div className="empty-start" data-testid="empty-state">
      <h2>Start your architecture</h2>
      <ol>
        <li>Add the people and software systems.</li>
        <li>Draw a line between two boxes to connect them.</li>
        <li>Double-click a system to add what is inside it.</li>
      </ol>
      <div className="empty-start-actions">
        <button onClick={() => onAdd("add-person")} data-testid="empty-add-person">Add a person</button>
        <button className="primary" onClick={() => onAdd("add-softwareSystem")} data-testid="empty-add-system">Add a software system</button>
      </div>
    </div>
  );
}
