#!/usr/bin/env node
import { main } from "./index.js";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(3);
  },
);
