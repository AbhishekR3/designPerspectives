export const NODE_W = 225;
export const NODE_H = 150;

// elkjs is large; load it only when a diagram needs laying out.
let elkPromise: Promise<{ layout(g: object): Promise<unknown> }> | null = null;
function getElk() {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  return elkPromise;
}

const SPACING = {
  "elk.spacing.nodeNode": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

type ElkNode = { id: string; x?: number; y?: number; children?: ElkNode[] };

/**
 * Layered top-to-bottom layout for a whole diagram. Returns top-left positions.
 * `grouped` nodes (the elements inside the diagram's boundary) are laid out inside one
 * parent box, so elements outside the boundary are placed outside it.
 */
export async function autoLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  grouped: string[] = [],
): Promise<Record<string, { x: number; y: number }>> {
  const ids = new Set(nodeIds);
  const inGroup = new Set(grouped.filter((g) => ids.has(g)));
  const box = (id: string) => ({ id, width: NODE_W, height: NODE_H });
  const outside = nodeIds.filter((n) => !inGroup.has(n)).map(box);
  const children: object[] = [...outside];
  if (inGroup.size) {
    children.push({
      id: "__group__",
      layoutOptions: { ...SPACING, "elk.padding": "[top=70,left=50,bottom=60,right=50]" },
      children: [...inGroup].map(box),
    });
  }
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      ...SPACING,
    },
    children,
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e, i) => ({ id: `e${i}`, sources: [e.source], targets: [e.target] })),
  };
  const out = (await (await getElk()).layout(graph)) as ElkNode;
  const pos: Record<string, { x: number; y: number }> = {};
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      if (c.id === "__group__") walk(c, x, y);
      else pos[c.id] = { x: Math.round(x), y: Math.round(y) };
    }
  };
  walk(out, 0, 0);
  return pos;
}

/** Place nodes that have no saved position in a column to the right of the others. */
export function placeMissing(
  positioned: Record<string, { x: number; y: number }>,
  missing: string[],
): Record<string, { x: number; y: number }> {
  const xs = Object.values(positioned);
  const right = xs.length ? Math.max(...xs.map((p) => p.x)) + NODE_W + 80 : 0;
  const top = xs.length ? Math.min(...xs.map((p) => p.y)) : 0;
  const out: Record<string, { x: number; y: number }> = {};
  missing.forEach((id, i) => (out[id] = { x: right, y: top + i * (NODE_H + 40) }));
  return out;
}
