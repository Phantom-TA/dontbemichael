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
      if (state.headline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // The owner types in the panel; the read only page follows.
    const typed = await win.webContents.executeJavaScript("screenTest.type('Before', 'We bake bread for twelve cafes in town')");
    let after = null;
    for (let i = 0; i < 30; i++) {
      after = await win.webContents.executeJavaScript('screenTest.state()');
      if (after.about && after.about.includes('twelve cafes')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (process.env.CASE_SCREEN_SHOT) require('node:fs').writeFileSync(process.env.CASE_SCREEN_SHOT, (await win.webContents.capturePage()).toPNG());
    process.stdout.write(`RESULT ${JSON.stringify({ ...state, typed, aboutAfter: after && after.about })}\n`);
    app.exit(0);
  } catch (e) { process.stderr.write(String(e && e.stack || e)); app.exit(1); }
});
