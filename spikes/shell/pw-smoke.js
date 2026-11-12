// Playwright _electron smoke test: launches the spike app and inspects the first window. No browser download needed.
const { _electron } = require('playwright');
(async () => {
  const app = await _electron.launch({ args: ['.', '--no-sandbox'], cwd: __dirname });
  const page = await app.firstWindow();
  const r = { title: await page.title(), typeofRequire: await page.evaluate(() => typeof require), bridge: await page.evaluate(() => Object.keys(window.dp)),
    ping: await page.evaluate(() => window.dp.ping('pw')), isPackaged: await app.evaluate(({ app }) => app.isPackaged) };
  console.log('PW_RESULT ' + JSON.stringify(r));
  await app.close().catch(() => {});
})().catch((e) => { console.error('PW_FAIL', e.message.split('\n')[0]); process.exit(1); });
