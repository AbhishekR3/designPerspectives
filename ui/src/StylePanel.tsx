import { useEffect, useState } from "react";
import { api } from "./api";
import type { Style } from "./types";

const SWATCHES = ["#ffffff", "#f4f4f5", "#dbeafe", "#bfdbfe", "#85bbf0", "#438dd5", "#1168bd", "#08427b", "#dcfce7", "#86efac", "#2ca02c", "#fef9c3", "#fde047", "#ff7f0e", "#fecaca", "#d62728", "#e9d5ff", "#9467bd", "#6b7280", "#111111"];

function ColorField({ label, value, onCommit, testId }: { label: string; value?: string; onCommit(v: string | null): void; testId: string }) {
  const [draft, setDraft] = useState(value ?? "#888888");
  useEffect(() => setDraft(value ?? "#888888"), [value]);
  return (
    <div className="field">
      <span>
        {label}
        {value && (
          <button className="link small" onClick={() => onCommit(null)} style={{ marginLeft: 8 }}>
            default
          </button>
        )}
      </span>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button key={c} className={`sw${value === c ? " on" : ""}`} style={{ background: c }} aria-label={`${label} ${c}`} title={`${label} ${c}`} onClick={() => onCommit(c)} />
        ))}
        <input type="color" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} data-testid={testId} aria-label={`${label} custom`} />
      </div>
    </div>
  );
}

/** Colours, line style and text size of one element or line. Stored per object, like draw.io / Lucidchart formatting. */
export function StylePanel({
  target,
  style,
  edge,
  mutate,
}: {
  target: string;
  style: Style;
  edge: boolean;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
}) {
  const save = (patch: Partial<Style>) => {
    const next: Record<string, unknown> = { ...style, ...patch };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined || next[k] === "") delete next[k];
    return mutate(() => api.style(target, Object.keys(next).length ? (next as Style) : null));
  };
  return (
    <div data-testid="style-panel">
      {!edge && <ColorField label="Fill" value={style.fill} onCommit={(v) => save({ fill: v ?? undefined })} testId="style-fill" />}
      <ColorField label={edge ? "Line colour" : "Border"} value={style.stroke} onCommit={(v) => save({ stroke: v ?? undefined })} testId="style-stroke" />
      <ColorField label="Text" value={style.text} onCommit={(v) => save({ text: v ?? undefined })} testId="style-text" />
      <div className="row">
        <label className="field inline">
          <span>Line</span>
          <select value={style.strokeStyle ?? "solid"} onChange={(e) => save({ strokeStyle: e.target.value as Style["strokeStyle"] })} data-testid="style-line">
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="dash-dot">Dash-dot</option>
            <option value="long-dash">Long dash</option>
          </select>
        </label>
        <label className="field inline">
          <span>Width</span>
          <input type="number" min={0.5} max={10} step={0.5} value={style.strokeWidth ?? (edge ? 1.6 : 1.5)} onChange={(e) => save({ strokeWidth: Number(e.target.value) })} />
        </label>
        <label className="field inline">
          <span>Text size</span>
          <input type="number" min={8} max={40} value={style.fontSize ?? 15} onChange={(e) => save({ fontSize: Number(e.target.value) })} data-testid="style-font" />
        </label>
      </div>
      {edge && (
        <label className="field inline">
          <span>Arrow</span>
          <select value={style.arrow ?? "end"} onChange={(e) => save({ arrow: e.target.value as Style["arrow"] })} data-testid="style-arrow">
            <option value="end">At the end</option>
            <option value="start">At the start</option>
            <option value="both">Both ends</option>
            <option value="none">None</option>
          </select>
        </label>
      )}
      {edge && (
        <label className="field inline">
          <span>Arrowhead</span>
          <select value={style.arrowHead ?? "filled"} onChange={(e) => save({ arrowHead: e.target.value as Style["arrowHead"] })} data-testid="style-arrow-head">
            <option value="filled">Filled arrow</option>
            <option value="open">Open arrow</option>
            <option value="diamond">Diamond</option>
            <option value="diamond-open">Open diamond</option>
            <option value="circle">Circle</option>
            <option value="bar">Bar</option>
          </select>
        </label>
      )}
      <button onClick={() => mutate(() => api.style(target, null))} disabled={Object.keys(style).length === 0}>
        Reset style
      </button>
    </div>
  );
}
