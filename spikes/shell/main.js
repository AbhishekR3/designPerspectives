// W0-SPIKE-SHELL prototype: hardened BrowserWindow + typed IPC + utilityProcess worker + SQLite load checks.
const { app, BrowserWindow, ipcMain, utilityProcess, session } = require('electron');
const path = require('node:path');
const out = { versions: process.versions, argv: process.argv.slice(1), checks: {} };
const CH = { ping: 'dp:ping', report: 'dp:report' };
let win;
const timer = setTimeout(() => finish('timeout'), 30000);

function finish(reason) {
  clearTimeout(timer);
  out.finish = reason;
  console.log('SPIKE_RESULT ' + JSON.stringify(out, null, 1));
  app.quit();
}
function sqliteChecks() {
  const r = {};
  try { const D = require('better-sqlite3'); const d = new D(':memory:'); d.exec('create table t(x)'); d.prepare('insert into t values (?)').run(7);
    r.betterSqlite3 = d.prepare('select x, sqlite_version() as v from t').get(); d.close(); } catch (e) { r.betterSqlite3 = 'ERR ' + e.message; }
  try { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(':memory:');
    r.nodeSqlite = d.prepare('select sqlite_version() as v').get(); d.close(); } catch (e) { r.nodeSqlite = 'ERR ' + e.message; }
  return r;
}
function runWorker() {
  return new Promise((resolve) => {
    const log = { progress: [], events: [] };
    const child = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], { serviceName: 'dp-worker', stdio: 'pipe' });
    child.on('spawn', () => { log.events.push('spawn'); child.postMessage({ type: 'start', total: 1000 }); });
    child.on('message', (m) => {
      if (m.type === 'progress') { log.progress.push(m.done); if (log.progress.length === 3) { log.events.push('cancel-sent'); child.postMessage({ type: 'cancel' }); } }
      else { log.events.push(m.type); if (m.type === 'ready') log.workerInfo = m; if (m.type === 'cancelled') log.cancelledAt = m.done; }
    });
    child.on('exit', (code) => { log.exitCode = code; resolve(log); });
  });
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e, url) => { e.preventDefault(); (out.checks.blockedNavigations ??= []).push(url); });
  wc.setWindowOpenHandler(({ url }) => { (out.checks.blockedWindowOpen ??= []).push(url); return { action: 'deny' }; });
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => console.log('SPIKE_EVENT will-quit'));

app.whenReady().then(async () => {
  out.checks.mainSqlite = sqliteChecks();
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ipcMain.handle(CH.ping, (event, payload) => {
    if (event.senderFrame !== win.webContents.mainFrame) throw new Error('unexpected sender');
    if (typeof payload !== 'object' || payload === null || typeof payload.text !== 'string') throw new Error('bad payload');
    return { echo: payload.text.toUpperCase(), pid: process.pid, length: payload.text.length };
  });
  ipcMain.handle(CH.report, async (_e, rendererResults) => {
    out.checks.renderer = rendererResults;
    setImmediate(async () => {
      const before = win.webContents.getURL();
      await win.webContents.executeJavaScript("location.href='https://example.com/'; 1").catch((e) => String(e));
      await new Promise((r) => setTimeout(r, 500));
      out.checks.urlUnchangedAfterNavAttempt = win.webContents.getURL() === before;
      out.checks.worker = await runWorker();
      win.destroy();
      finish('ok');
    });
    return true;
  });
  win = new BrowserWindow({
    width: 800, height: 600, show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, nodeIntegrationInWorker: false,
    },
  });
  out.checks.lastWebPreferences = (({ contextIsolation, nodeIntegration, sandbox }) => ({ contextIsolation, nodeIntegration, sandbox }))(win.webContents.getLastWebPreferences());
  await win.loadFile(path.join(__dirname, 'index.html'));
});
