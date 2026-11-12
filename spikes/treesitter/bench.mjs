// W0-SPIKE-TREESITTER prototype. Usage: node bench.mjs [--json]
// Parses one sample per language with web-tree-sitter (three wasm sources) and, where loadable, the native binding;
// runs an imports + top-level-declarations query; times a ~5,000-line synthetic file; hashes output for determinism.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Parser, Language, Query } from 'web-tree-sitter';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = (...p) => path.join(here, 'node_modules', ...p);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const top = (root, kinds, name = 'identifier') => kinds.map((k) => `(${root} (${k} name: (${name}) @decl))`).join('\n');
const tsDecl = (cls) => {
  const kinds = [['function_declaration', 'identifier'], ['generator_function_declaration', 'identifier'], ['class_declaration', cls],
    ...(cls === 'type_identifier' ? [['interface_declaration', cls], ['type_alias_declaration', cls], ['enum_declaration', 'identifier']] : [])];
  const body = kinds.map(([k, n]) => `(${k} name: (${n}) @decl)`).concat(['(lexical_declaration (variable_declarator name: (identifier) @decl))', '(variable_declaration (variable_declarator name: (identifier) @decl))']);
  return '(import_statement source: (string) @import)\n' + body.map((b) => `(program ${b})\n(program (export_statement declaration: ${b}))`).join('\n');
};

const LANGS = {
  typescript: { sample: 'sample.ts', pkg: 'tree-sitter-typescript', own: 'tree-sitter-typescript.wasm', agg: 'typescript', vs: 'typescript', native: (m) => m.typescript, query: tsDecl('type_identifier'),
    unit: (i) => `export interface Shape${i} { id: string; size: number }\nexport function area${i}(s: Shape${i}): number {\n  const k = s.size * ${i};\n  if (k > 10) { return k / 2; }\n  return [1, 2, 3].map((x) => x * k).reduce((a, b) => a + b, 0);\n}\nexport class Box${i} implements Shape${i} {\n  constructor(public id: string, public size: number) {}\n  grow(by: number): Box${i} { return new Box${i}(this.id, this.size + by); }\n}\n`, head: "import { a } from './a';\n" },
  tsx: { sample: 'sample.tsx', pkg: 'tree-sitter-typescript', own: 'tree-sitter-tsx.wasm', agg: 'tsx', vs: 'tsx', native: (m) => m.tsx, query: tsDecl('type_identifier'),
    unit: (i) => `export interface Props${i} { label: string; n: number }\nexport function View${i}({ label, n }: Props${i}) {\n  const items = Array.from({ length: n }, (_, k) => k * ${i});\n  return (\n    <ul className="v${i}">\n      {items.map((k) => <li key={k} onClick={() => console.log(k)}>{label}-{k}</li>)}\n    </ul>\n  );\n}\n`, head: "import React from 'react';\n" },
  javascript: { sample: 'sample.js', pkg: 'tree-sitter-javascript', own: 'tree-sitter-javascript.wasm', agg: 'javascript', vs: 'javascript', native: (m) => m, query: tsDecl('identifier'),
    unit: (i) => `export function area${i}(s) {\n  const k = s.size * ${i};\n  if (k > 10) { return k / 2; }\n  return [1, 2, 3].map((x) => x * k).reduce((a, b) => a + b, 0);\n}\nexport class Box${i} {\n  constructor(id, size) { this.id = id; this.size = size; }\n  grow(by) { return new Box${i}(this.id, this.size + by); }\n}\n`, head: "import { a } from './a.js';\n" },
  python: { sample: 'sample.py', pkg: 'tree-sitter-python', own: 'tree-sitter-python.wasm', agg: 'python', vs: 'python', native: (m) => m,
    query: `(import_statement) @import\n(import_from_statement) @import\n${top('module', ['function_definition', 'class_definition'])}\n(module (decorated_definition definition: (_ name: (identifier) @decl)))\n(module (expression_statement (assignment left: (identifier) @decl)))`,
    unit: (i) => `class Box${i}:\n    def __init__(self, id: str, size: int) -> None:\n        self.id = id\n        self.size = size\n\n    def grow(self, by: int) -> "Box${i}":\n        return Box${i}(self.id, self.size + by)\n\n\ndef area${i}(s: Box${i}) -> float:\n    k = s.size * ${i}\n    if k > 10:\n        return k / 2\n    return sum(x * k for x in (1, 2, 3))\n\n\n`, head: 'import os\n' },
  java: { sample: 'Sample.java', pkg: 'tree-sitter-java', own: 'tree-sitter-java.wasm', agg: 'java', vs: 'java', native: (m) => m,
    query: `(import_declaration) @import\n${top('program', ['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration', 'annotation_type_declaration'])}`,
    unit: (i) => `class Box${i} {\n    private final String id;\n    private final int size;\n    Box${i}(String id, int size) { this.id = id; this.size = size; }\n    Box${i} grow(int by) { return new Box${i}(id, size + by); }\n    double area() {\n        int k = size * ${i};\n        if (k > 10) { return k / 2.0; }\n        return java.util.stream.IntStream.of(1, 2, 3).map(x -> x * k).sum();\n    }\n}\n`, head: 'package p;\nimport java.util.List;\n' },
  go: { sample: 'sample.go', pkg: 'tree-sitter-go', own: 'tree-sitter-go.wasm', agg: 'go', vs: 'go', native: (m) => m,
    query: `(import_spec path: (_) @import)\n(source_file (function_declaration name: (identifier) @decl))\n(source_file (method_declaration name: (field_identifier) @decl))\n(source_file (type_declaration (type_spec name: (type_identifier) @decl)))\n(source_file (const_declaration (const_spec name: (identifier) @decl)))\n(source_file (var_declaration (var_spec name: (identifier) @decl)))`,
    unit: (i) => `type Box${i} struct {\n\tID   string\n\tSize int\n}\n\nfunc (b Box${i}) Grow(by int) Box${i} {\n\treturn Box${i}{ID: b.ID, Size: b.Size + by}\n}\n\nfunc Area${i}(b Box${i}) float64 {\n\tk := b.Size * ${i}\n\tif k > 10 {\n\t\treturn float64(k) / 2\n\t}\n\treturn float64(k * 6)\n}\n\n`, head: 'package p\n\nimport "fmt"\n\nvar _ = fmt.Sprint\n\n' },
  csharp: { sample: 'Sample.cs', pkg: 'tree-sitter-c-sharp', own: 'tree-sitter-c_sharp.wasm', agg: 'c_sharp', vs: 'c-sharp', native: (m) => m,
    query: ['compilation_unit', 'namespace_declaration body: (declaration_list', 'compilation_unit (namespace_declaration body: (declaration_list'].map((r, idx) => `(using_directive) @import\n(compilation_unit (namespace_declaration name: (_) @decl))\n(compilation_unit (file_scoped_namespace_declaration name: (_) @decl))\n` +
      ['class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration', 'record_declaration', 'delegate_declaration'].map((k) => `(${r} (${k} name: (identifier) @decl))${idx ? ')' : ''}${idx === 2 ? ')' : ''}`).join('\n'))[1].replace(/^\(namespace_declaration/gm, '(namespace_declaration'),
    unit: (i) => `    public class Box${i}\n    {\n        public string Id { get; }\n        public int Size { get; }\n        public Box${i}(string id, int size) { Id = id; Size = size; }\n        public Box${i} Grow(int by) => new Box${i}(Id, Size + by);\n        public double Area()\n        {\n            var k = Size * ${i};\n            if (k > 10) { return k / 2.0; }\n            return new[] { 1, 2, 3 }.Select(x => x * k).Sum();\n        }\n    }\n`, head: 'using System.Linq;\nnamespace P\n{\n', tail: '}\n' },
};

function synth(l) { let s = l.head, i = 0; const tail = l.tail ?? ''; while ((s + tail).split('\n').length < 5000) s += l.unit(i++); return s + tail; }
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
function time(fn, n = 7) { const t = []; let r; for (let i = 0; i < n; i++) { const s = performance.now(); r = fn(); t.push(performance.now() - s); } return { first: +t[0].toFixed(1), median: +median(t.slice(1)).toFixed(1), r }; }
const fmtCaps = (caps) => caps.map((c) => `${c.name}:${c.node.text.replace(/\s+/g, ' ')}`);

await Parser.init();
const out = { runtime: { node: process.versions.node, electron: process.versions.electron ?? null, type: process.type ?? 'node', platform: process.platform, arch: process.arch }, langs: {} };
let nativeParser = null, nativeErr = null;
try { nativeParser = require('tree-sitter'); } catch (e) { nativeErr = e.message.split('\n')[0]; }
out.nativeCore = nativeParser ? 'loaded' : 'ERR ' + nativeErr;

for (const [name, l] of Object.entries(LANGS)) {
  const src = readFileSync(path.join(here, 'samples', l.sample), 'utf8');
  const big = synth(l);
  const res = (out.langs[name] = { sampleLines: src.split('\n').length - 1, synthLines: big.split('\n').length - 1, synthBytes: big.length, wasm: {} });
  const sources = { own: nm(l.pkg, l.own), 'tree-sitter-wasms': nm('tree-sitter-wasms', 'out', `tree-sitter-${l.agg}.wasm`), '@vscode/tree-sitter-wasm': nm('@vscode', 'tree-sitter-wasm', 'wasm', `tree-sitter-${l.vs}.wasm`) };
  for (const [srcName, file] of Object.entries(sources)) {
    try {
      const t0 = performance.now(); const lang = await Language.load(file); const loadMs = +(performance.now() - t0).toFixed(1);
      const parser = new Parser(); parser.setLanguage(lang);
      const tree = parser.parse(src); const q = new Query(lang, l.query); const caps = fmtCaps(q.captures(tree.rootNode));
      const r = { abi: lang.abiVersion, loadMs, sampleHasError: tree.rootNode.hasError, sexpHash: sha(tree.rootNode.toString()), capsHash: sha(caps.join('|')), imports: caps.filter((c) => c.startsWith('import:')).length, decls: caps.filter((c) => c.startsWith('decl:')).map((c) => c.slice(5)) };
      const p2 = new Parser(); p2.setLanguage(lang); const tree2 = p2.parse(src);
      r.sameAcrossTwoParsers = sha(tree2.rootNode.toString()) === r.sexpHash && sha(fmtCaps(q.captures(tree2.rootNode)).join('|')) === r.capsHash;
      const b = time(() => { const t = parser.parse(big); const o = { err: t.rootNode.hasError, n: t.rootNode.descendantCount }; t.delete(); return o; });
      const bt = parser.parse(big); const qt = time(() => q.captures(bt.rootNode).length, 4);
      Object.assign(r, { bigFirstMs: b.first, bigMedianMs: b.median, bigHasError: b.r.err, bigNodes: b.r.n, bigQueryMs: qt.median, bigCaptures: qt.r, bigSexpHash: sha(bt.rootNode.toString()) });
      res.wasm[srcName] = r;
    } catch (e) { res.wasm[srcName] = { error: (String(e && e.message || '') + ' ' + String(e)).trim().split('\n')[0].slice(0, 200) || 'unknown error' }; }
  }
  if (nativeParser) {
    try {
      let mod; try { mod = require(l.pkg); } catch (e) { mod = (await import(l.pkg)).default; res.nativeLoadedVia = 'import() after require() failed: ' + e.code; }
      const lang = l.native(mod); const parser = new nativeParser(); parser.setLanguage(lang);
      const opts = { bufferSize: 4 * 1024 * 1024 };
      const tree = parser.parse(src, undefined, opts); const q = new nativeParser.Query(lang, l.query);
      const caps = q.captures(tree.rootNode).map((c) => `${c.name}:${c.node.text.replace(/\s+/g, ' ')}`);
      const r = { sampleHasError: tree.rootNode.hasError, sexpHash: sha(tree.rootNode.toString()), capsHash: sha(caps.join('|')), imports: caps.filter((c) => c.startsWith('import:')).length, declCount: caps.filter((c) => c.startsWith('decl:')).length };
      const b = time(() => { const t = parser.parse(big, undefined, opts); return { err: t.rootNode.hasError, n: t.rootNode.descendantCount }; });
      const bt = parser.parse(big, undefined, opts); const qt = time(() => q.captures(bt.rootNode).length, 4);
      Object.assign(r, { bigFirstMs: b.first, bigMedianMs: b.median, bigHasError: b.r.err, bigNodes: b.r.n, bigQueryMs: qt.median, bigCaptures: qt.r, bigSexpHash: sha(bt.rootNode.toString()) });
      res.native = r;
    } catch (e) { res.native = { error: String(e.message ?? e).split('\n')[0].slice(0, 160) }; }
  }
}
// Determinism digest: everything except timings.
const stable = JSON.stringify(out.langs, (k, v) => (/Ms$/.test(k) ? undefined : v));
out.deterministicDigest = sha(stable);
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log('runtime', JSON.stringify(out.runtime), 'nativeCore', out.nativeCore, 'digest', out.deterministicDigest);
  for (const [n, r] of Object.entries(out.langs)) {
    console.log(`\n${n}: sample ${r.sampleLines} lines; synthetic ${r.synthLines} lines / ${r.synthBytes} bytes`);
    for (const [s, w] of Object.entries({ ...r.wasm, native: r.native ?? { error: 'not loaded' } }))
      console.log('  ' + s.padEnd(26), w.error ? 'ERROR ' + w.error : `abi=${w.abi ?? '-'} load=${w.loadMs ?? '-'}ms sampleErr=${w.sampleHasError} imports=${w.imports} decls=${w.decls ? w.decls.length : w.declCount} same2=${w.sameAcrossTwoParsers ?? '-'} sexp=${w.sexpHash} caps=${w.capsHash} | big first=${w.bigFirstMs}ms median=${w.bigMedianMs}ms query=${w.bigQueryMs}ms nodes=${w.bigNodes} caps=${w.bigCaptures} err=${w.bigHasError} sexp=${w.bigSexpHash}`);
    console.log('  decls(own):', (r.wasm.own.decls ?? []).join(', '));
  }
}
if (process.parentPort) process.exit(0);
