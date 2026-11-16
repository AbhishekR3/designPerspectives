/** Line shapes: the names shown in the diagram panel, the line panel and the line menus. */

import type { EdgeLayout } from "../types";

export type LineShape = NonNullable<EdgeLayout["routing"]>;

/** What a line without a shape of its own uses when the diagram has no default. */
export const BUILT_IN_SHAPE: LineShape = "rounded";

/** Short names, in the order the menus list them. */
export const LINE_SHAPE_NAMES: [LineShape, string][] = [
  ["straight", "Straight"],
  ["curved", "Curved"],
  ["smooth", "Smooth S-curve"],
  ["orthogonal", "Right angles (elbow)"],
  ["rounded", "Rounded right angles"],
];

export const lineShapeName = (shape: LineShape): string => LINE_SHAPE_NAMES.find(([v]) => v === shape)?.[1] ?? shape;

/** The "Automatic" choice of a line, naming what it follows. */
export const automaticLabel = (diagramShape: LineShape | null): string =>
  `Automatic (diagram default: ${lineShapeName(diagramShape ?? BUILT_IN_SHAPE)
    .replace(/ \(.*\)$/, "")
    .toLowerCase()})`;
