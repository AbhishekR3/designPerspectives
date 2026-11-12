(async () => {
  const r = {};
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + (e.blockedURI || '')));
  r.typeofRequire = typeof require; r.typeofProcess = typeof process; r.typeofModule = typeof module;
  r.typeofBuffer = typeof Buffer; r.typeofGlobal = typeof global; r.typeofIpcRenderer = typeof window.ipcRenderer;
  r.bridgeKeys = Object.keys(window.dp); r.env = window.dp.env;
  r.inlineScriptRan = window.__inlineRan === true;
  try { r.eval = String(eval('1+1')); } catch (e) { r.eval = 'blocked: ' + e.name; }
  try { await fetch('https://example.com/'); r.fetch = 'allowed'; } catch (e) { r.fetch = 'blocked: ' + e.name; }
  const w = window.open('https://example.com/'); r.windowOpenReturned = w === null ? 'null' : typeof w;
  r.ping = await window.dp.ping('hello');
  try { await window.dp.ping({ toString() { throw new Error('x'); } }); r.badPing = 'no error'; } catch (e) { r.badPing = 'rejected'; }
  await new Promise((res) => setTimeout(res, 100));
  r.cspViolations = violations;
  await window.dp.report(r);
})();
