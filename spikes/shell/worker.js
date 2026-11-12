// Runs in an Electron utility process (Node environment, no DOM). Progress + cooperative cancel over parentPort.
let cancelled = false;
const info = { type: 'ready', pid: process.pid, processType: process.type, node: process.versions.node };
try { const D = require('better-sqlite3'); const d = new D(':memory:'); info.betterSqlite3 = d.prepare('select sqlite_version() as v').get().v; d.close(); } catch (e) { info.betterSqlite3 = 'ERR ' + e.message; }
try { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(':memory:'); info.nodeSqlite = d.prepare('select sqlite_version() as v').get().v; d.close(); } catch (e) { info.nodeSqlite = 'ERR ' + e.message; }
process.parentPort.on('message', async ({ data }) => {
  if (data.type === 'cancel') { cancelled = true; return; }
  if (data.type !== 'start') return;
  process.parentPort.postMessage(info);
  let done = 0;
  for (; done < data.total; done++) {
    if (cancelled) { process.parentPort.postMessage({ type: 'cancelled', done }); process.exit(0); }
    await new Promise((r) => setTimeout(r, 10)); // one unit of work; yields so the cancel message can be delivered
    if (done % 5 === 4) process.parentPort.postMessage({ type: 'progress', done: done + 1, total: data.total });
  }
  process.parentPort.postMessage({ type: 'done', done }); process.exit(0);
});
