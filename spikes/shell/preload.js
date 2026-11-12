// Sandboxed preload: only a narrow, named API crosses the bridge; ipcRenderer itself is never exposed.
const { contextBridge, ipcRenderer } = require('electron');
let fsRequire; try { require('fs'); fsRequire = 'available'; } catch (e) { fsRequire = 'blocked: ' + e.message; }
contextBridge.exposeInMainWorld('dp', {
  ping: (text) => ipcRenderer.invoke('dp:ping', { text: String(text) }),
  report: (results) => ipcRenderer.invoke('dp:report', results),
  env: { sandboxed: process.sandboxed === true, contextIsolated: process.contextIsolated === true, preloadFsRequire: fsRequire },
});
