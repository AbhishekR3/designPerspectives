// Runs bench.mjs inside a real Electron utility process (uses the Electron binary installed by spikes/shell).
const { app, utilityProcess } = require('electron');
const path = require('node:path');
app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'bench.mjs'), process.argv.includes('--json') ? ['--json'] : [], { stdio: 'inherit' });
  child.on('exit', (code) => { console.log('UTILITY_EXIT ' + code); app.exit(code ?? 1); });
});
