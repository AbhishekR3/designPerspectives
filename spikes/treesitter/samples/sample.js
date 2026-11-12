import fs from 'node:fs';
import { join, resolve } from 'node:path';
import * as util from 'node:util';
const legacy = require('./legacy.cjs');

export const VERSION = '0.1.0';
let cache = new Map();
var debug = false;

export function readJson(file) {
  const full = resolve(file);
  if (!cache.has(full)) {
    cache.set(full, JSON.parse(fs.readFileSync(full, 'utf8')));
  }
  return cache.get(full);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

export class Scanner {
  constructor(root) { this.root = root; }
  files() { return [...walk(this.root)]; }
  describe() { return util.format('%s (%d files)', this.root, this.files().length); }
}

export default function main(argv) {
  const scanner = new Scanner(argv[2] ?? '.');
  if (debug) legacy.log(scanner.describe());
  return scanner.files().length;
}
