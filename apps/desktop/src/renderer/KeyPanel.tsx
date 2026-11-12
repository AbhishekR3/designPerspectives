/** KEY built only from the entries the host derived from the view (file 05 rule 2). */
import type { KeyEntry } from "@designperspectives/contracts";
import { kindClass } from "./kind-style.js";

function Swatch({ entry }: { entry: KeyEntry }) {
  if (entry.category === "relationship") {
    return (
      <svg className="key-line" width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
        <line x1="2" y1="6" x2="34" y2="6" className={entry.id === "async" ? "c4-edge-async" : "c4-edge-sync"} />
        <path d="M34 1 L43 6 L34 11 Z" className="key-arrow" />
      </svg>
    );
  }
  const boundary = entry.id.endsWith(":boundary");
  const kind = boundary ? entry.id.slice(0, -":boundary".length) : entry.id;
  return <span aria-hidden="true" className={boundary ? "key-swatch key-swatch-boundary" : `key-swatch ${kindClass(kind)}`} />;
}

export function KeyPanel({ entries }: { entries: KeyEntry[] }) {
  return (
    <section className="key-panel" aria-labelledby="key-heading" data-testid="key-panel">
      <h3 id="key-heading">Key</h3>
      <ul>
        {entries.map((e) => (
          <li key={`${e.category}:${e.id}`} data-testid="key-entry">
            <Swatch entry={e} />
            <span>{e.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
