/** Small line icons (24×24 grid, drawn with currentColor). No brand logos. */
const P: Record<string, string> = {
  home: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  back: "M19 12H5m6-6-6 6 6 6",
  forward: "M5 12h14m-6-6 6 6-6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2.2-1.3L14.3 2h-4l-.4 2.4a7.3 7.3 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.3 7.3 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3v.01",
  flows: "M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3",
  play: "M7 5v14l12-7Z",
  pause: "M8 5v14M16 5v14",
  restart: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5m5 5H10a6 6 0 0 0 0 12h3",
  layout: "M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9zM7 10v2h10v-2M12 12v2",
  room: "M3 7h5v10H3zM16 7h5v10h-5zM10 12h4m-1.5-1.5L14 12l-1.5 1.5m-1-3L10 12l1.5 1.5",
  spread: "M9 9 4 4m0 0h4M4 4v4m11 1 5-5m0 0h-4m4 0v4M9 15l-5 5m0 0h4m-4 0v-4m11-1 5 5m0 0h-4m4 0v-4",
  plus: "M12 5v14M5 12h14",
  comment: "M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5",
  close: "M6 6l12 12M18 6 6 18",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  focus: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v4m0 12v4M2 12h4m12 0h4",
  tag: "M3 12V4h8l9 9-8 8-9-9Zm5-4.5a1 1 0 1 0 0 .01",
  code: "m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14",
  gauge: "M4 18a8 8 0 1 1 16 0M12 18l4-6",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12.5c-.5-1-1.6-1.5-3-1.5-1.9 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.4-1.2 2.2-3 2.2-1.5 0-2.6-.6-3.1-1.7M12 5.5v13",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  panel: "M4 4h16v16H4zM9 4v16",
  person: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0Z",
  system: "M3 6h18v12H3zM3 10h18",
  service: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h3",
  web: "M3 5h18v14H3zM3 9h18M6 7h.01M8.5 7h.01",
  mobile: "M7 2h10v20H7zM11 18h2",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  cache: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  queue: "M3 7h4v10H3zM10 7h4v10h-4zM17 7h4v10h-4z",
  pipeline: "M3 12h4l3-6 4 12 3-6h4",
  storage: "M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01",
  cloud: "M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5Z",
  document: "M6 2h8l5 5v15H6zM14 2v5h5",
  component: "M7 4h12v16H7zM4 8h6v3H4zM4 13h6v3H4z",
  container: "M3 7l9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10",
  file: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h6M9 17h6",
  stage: "M4 12h16m-5-5 5 5-5 5",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z",
  warning: "M12 3 2 20h20L12 3Zm0 6v5m0 3v.01",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 5a2 2 0 0 0 4 0",
  check: "m5 12 5 5 9-10",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  chevron: "m6 9 6 6 6-6",
  pin: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  paste: "M9 4h6v3H9zM7 5H5v16h14V5h-2",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  brush: "M14 4l6 6-8 8H6v-6l8-8ZM4 20h4",
  shapes: "M4 4h7v7H4zM17.5 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM13 20l3.5-6 3.5 6Z",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5M8 11h6M11 8v6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5M8 11h6",
  up: "M12 19V5m-6 6 6-6 6 6",
  resize: "M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7",
  line: "M4 20 20 4",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className, title, fill = false }: { name: IconName | string; size?: number; className?: string; title?: string; fill?: boolean }) {
  const d = P[name] ?? P.system;
  return (
    <svg
      className={`icon-svg${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

/** Icon for a model object: person, or its symbol (architecture type), or its C4 kind. */
export function iconFor(kind: string, archType?: string): string {
  if (kind === "person") return "person";
  if (kind === "file") return "file";
  if (kind === "stage") return "stage";
  if (archType && archType !== "box" && archType in P) return archType;
  if (kind === "softwareSystem") return "system";
  if (kind === "container") return "container";
  if (kind === "component") return "component";
  return "system";
}
