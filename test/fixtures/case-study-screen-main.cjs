'use strict';
// Electron main for case-study-screen.electron.test.cjs: loads the bundled
// screen and reports what it shows once it has had time to load.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(process.argv[2], 'profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) process.stderr.write(`[page] ${message}\n`); });
  try {
    await win.loadFile(path.join(process.argv[2], 'screen.html'));
    let state = null;
    for (let i = 0; i < 50; i++) {
      state = await win.webContents.executeJavaScript('screenTest.state()');
      // The built in headline shows before the draft's words arrive, so wait
      // for the draft's own text too (a slow Windows runner read in between).
      if (state.headline && state.about && !state.loading) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (process.env.CASE_SCREEN_SHOT) require('node:fs').writeFileSync(process.env.CASE_SCREEN_SHOT, (await win.webContents.capturePage()).toPNG());
    process.stdout.write(`RESULT ${JSON.stringify(state)}\n`);
    app.exit(0);
  } catch (e) { process.stderr.write(String(e && e.stack || e)); app.exit(1); }
});
