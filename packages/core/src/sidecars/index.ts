/** Sidecar files of an `architecture/` folder: loading, validation, canonical printing, id refactoring (task 0b-3). */
export { emptySidecarSet } from "./types.js";
export type { AdrDocument, NoteDocument, SidecarSet } from "./types.js";
export { loadSidecars } from "./load.js";
export type { LoadSidecarsResult } from "./load.js";
export { printSidecars } from "./print.js";
export { classifySidecarPath } from "./paths.js";
export { renameElementInSidecars, renameElementId, renameReference } from "./rename.js";
