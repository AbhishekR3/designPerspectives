import { useState } from "react";
import { lineLegend, KIND_HUE } from "../lineColours";
import { useDismiss } from "../common/useDismiss";
import type { Diagram } from "../types";

/**
 * Bottom left of the canvas: what the colours the diagram has by itself mean (lines by connection kind, a pipeline's
 * own colour, a tint per kind of box), and the switch that turns them off. Colour from an overlay is explained by the dock.
 */
export function ColourLegend({ diagram, relKinds, on, setOn }: { diagram: Diagram; relKinds: ReadonlyMap<string, string>; on: boolean; setOn(v: boolean): void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const items = on ? lineLegend(diagram, relKinds) : [];
  const boxes = on
    ? (
        [
          ["person", "Person"],
          ["softwareSystem", "Software system"],
          ["container", "Container"],
          ["component", "Component"],
        ] as const
      ).filter(([k]) => diagram.nodes.some((n) => n.kind === k))
    : [];
  return (
    <div className="colour-legend" ref={ref} data-testid="colour-legend" data-occludes="bottom">
      {open && (
        <div className="float colour-card" role="dialog" aria-label="What the colours mean">
          <label className="colour-switch">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} data-testid="colour-switch" />
            Colour by kind
          </label>
          {on && items.length === 0 && boxes.length === 0 && (
            <div className="muted small">Nothing on this diagram has a kind to colour yet. Set a connection kind on a line, or give it a technology such as HTTPS, to colour it.</div>
          )}
          {items.length > 0 && <div className="colour-head">Lines</div>}
          {items.map((i) => (
            <div className="colour-row" key={i.key} data-testid={`legend-line-${i.key}`}>
              <span className="colour-line" style={{ background: i.color }} />
              {i.label} <span className="n">{i.n}</span>
            </div>
          ))}
          {boxes.length > 0 && <div className="colour-head">Boxes</div>}
          {boxes.map(([k, label]) => (
            <div className="colour-row" key={k}>
              <span className="dot" style={{ background: KIND_HUE[k] }} />
              {label}
            </div>
          ))}
          <div className="muted small">A line with no kind takes one from its technology when that names one (HTTPS, SQL, Kafka, SFTP). A colour set by hand, or an overlay, comes first.</div>
        </div>
      )}
      <button
        className={`float-btn${open ? " on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="What the colours mean, and the switch to turn them off"
        data-testid="colour-toggle"
      >
        <span className="colour-dots" aria-hidden="true">
          {(on ? [...new Set(lineLegend(diagram, relKinds).map((i) => i.color))].slice(0, 4) : []).map((c) => (
            <span className="dot" key={c} style={{ background: c }} />
          ))}
          {!on && <span className="dot none" />}
        </span>
        Colour
      </button>
    </div>
  );
}
