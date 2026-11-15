/** Small file-system helpers shared by the model store, drafts and code files. */

import fs from "node:fs";
import path from "node:path";

/** Write via a temporary file and rename (no half-written files). `mode`: the new file's permissions
 *  (set when the temporary file is created, so the content is never readable with wider ones). */
export function atomicWrite(file: string, text: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, text, mode === undefined ? "utf-8" : { encoding: "utf-8", mode });
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}
