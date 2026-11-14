/** Symbols for the architecture types. Drawn as SVG behind a box's text; `inset` is the text padding each needs. */
export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
}

export interface ShapeInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const base = { top: 10, bottom: 10, left: 12, right: 12 };

export function shapeInset(type: string, w: number, h: number): ShapeInset {
  switch (type) {
    case "database":
    case "cache":
    case "storage":
      return { ...base, top: Math.min(36, h * 0.28), bottom: 18 };
    case "queue":
      return { ...base, left: 16, right: Math.min(44, w * 0.2) };
    case "web":
      return { ...base, top: 30 };
    case "mobile":
      return { ...base, top: 26, bottom: 24, left: 20, right: 20 };
    case "pipeline":
      return { ...base, left: 14, right: Math.min(36, w * 0.18) };
    case "document":
      return { ...base, top: 14, right: 28 };
    case "service":
      return { ...base, left: 24 };
    case "cloud":
      return { top: h * 0.22, bottom: h * 0.14, left: w * 0.14, right: w * 0.14 };
    case "person":
      return { ...base, top: 40 };
    default:
      return base;
  }
}

export function Shape({ type, w, h, s }: { type: string; w: number; h: number; s: ShapeStyle }) {
  const p = { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, strokeDasharray: s.dash, strokeLinejoin: "round" as const };
  const line = { fill: "none", stroke: s.stroke, strokeWidth: s.strokeWidth, strokeDasharray: s.dash };
  const sw = s.strokeWidth / 2;
  const x0 = sw;
  const y0 = sw;
  const x1 = w - sw;
  const y1 = h - sw;
  let body: React.ReactNode;
  switch (type) {
    case "database":
    case "cache": {
      const ry = Math.min(16, h * 0.11);
      const rx = (x1 - x0) / 2;
      body = (
        <>
          <path {...p} d={`M${x0},${y0 + ry} A${rx},${ry} 0 0 1 ${x1},${y0 + ry} V${y1 - ry} A${rx},${ry} 0 0 1 ${x0},${y1 - ry} Z`} />
          <path {...line} d={`M${x0},${y0 + ry} A${rx},${ry} 0 0 0 ${x1},${y0 + ry}`} />
          {type === "cache" && <path {...line} d={`M${x0},${y0 + ry * 3} A${rx},${ry} 0 0 0 ${x1},${y0 + ry * 3}`} />}
        </>
      );
      break;
    }
    case "storage": {
      const ry = Math.min(14, h * 0.1);
      const inset = Math.min(22, w * 0.1);
      const rx = (x1 - x0 - inset * 2) / 2;
      body = (
        <>
          <path {...p} d={`M${x0},${y0 + ry} A${(x1 - x0) / 2},${ry} 0 0 1 ${x1},${y0 + ry} L${x1 - inset},${y1 - ry} A${rx},${ry} 0 0 1 ${x0 + inset},${y1 - ry} Z`} />
          <path {...line} d={`M${x0},${y0 + ry} A${(x1 - x0) / 2},${ry} 0 0 0 ${x1},${y0 + ry}`} />
        </>
      );
      break;
    }
    case "queue": {
      const rx = Math.min(24, w * 0.11);
      const ry = (y1 - y0) / 2;
      body = (
        <>
          <path {...p} d={`M${x0 + rx},${y0} H${x1 - rx} A${rx},${ry} 0 0 1 ${x1 - rx},${y1} H${x0 + rx} A${rx},${ry} 0 0 1 ${x0 + rx},${y0} Z`} />
          <path {...line} d={`M${x1 - rx},${y0} A${rx},${ry} 0 0 0 ${x1 - rx},${y1}`} />
        </>
      );
      break;
    }
    case "pipeline": {
      const tip = Math.min(36, w * 0.18);
      body = <path {...p} d={`M${x0},${y0} H${x1 - tip} L${x1},${h / 2} L${x1 - tip},${y1} H${x0} L${x0 + tip * 0.45},${h / 2} Z`} />;
      break;
    }
    case "web":
      body = (
        <>
          <rect {...p} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={6} />
          <path {...line} d={`M${x0},${y0 + 24} H${x1}`} />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={x0 + 12 + i * 12} cy={y0 + 12} r={3.5} fill={s.stroke} opacity={0.8} />
          ))}
        </>
      );
      break;
    case "mobile":
      body = (
        <>
          <rect {...p} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={18} />
          <path {...line} d={`M${w / 2 - 14},${y0 + 12} H${w / 2 + 14}`} />
          <path {...line} d={`M${w / 2 - 18},${y1 - 12} H${w / 2 + 18}`} />
        </>
      );
      break;
    case "document": {
      const f = Math.min(24, w * 0.12);
      body = (
        <>
          <path {...p} d={`M${x0},${y0} H${x1 - f} L${x1},${y0 + f} V${y1} H${x0} Z`} />
          <path {...line} d={`M${x1 - f},${y0} V${y0 + f} H${x1}`} />
        </>
      );
      break;
    }
    case "service":
      body = (
        <>
          <rect {...p} x={x0 + 10} y={y0} width={x1 - x0 - 10} height={y1 - y0} rx={6} />
          <rect {...p} x={x0} y={y0 + (y1 - y0) * 0.25} width={20} height={14} rx={3} />
          <rect {...p} x={x0} y={y0 + (y1 - y0) * 0.6} width={20} height={14} rx={3} />
        </>
      );
      break;
    case "cloud":
      body = (
        <svg className="shape-svg" viewBox="0 0 100 62" preserveAspectRatio="none" width={w} height={h}>
          <path
            {...p}
            vectorEffect="non-scaling-stroke"
            d="M26,56 C10,56 3,44 8,34 C10,26 17,22 24,22 C25,10 36,3 48,5 C58,6 64,12 66,19 C78,15 94,22 94,36 C94,48 86,56 74,56 Z"
          />
        </svg>
      );
      break;
    case "person": {
      const r = Math.min(20, h * 0.14);
      body = (
        <>
          <rect {...p} x={x0} y={y0 + r * 1.6} width={x1 - x0} height={y1 - y0 - r * 1.6} rx={Math.min(30, w * 0.12)} />
          <circle {...p} cx={w / 2} cy={y0 + r + 2} r={r} />
        </>
      );
      break;
    }
    default:
      body = <rect {...p} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={8} />;
  }
  if (type === "cloud") return <>{body}</>;
  return (
    <svg className="shape-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {body}
    </svg>
  );
}

/** Small icon of a type, for pickers. */
export function ShapeIcon({ type }: { type: string }) {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" style={{ verticalAlign: "middle" }}>
      <Shape type={type} w={28} h={20} s={{ fill: "#e8eef6", stroke: "#44546a", strokeWidth: 1.2 }} />
    </svg>
  );
}
