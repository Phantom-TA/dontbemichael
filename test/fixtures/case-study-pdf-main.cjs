'use strict';
// Electron main for case-study-pdf.electron.test.cjs: prints each page the
// test wrote and reports its page count, its fit and, for Arabic, its layout.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
app.disableHardwareAcceleration();
// With no window left Electron quits by default; the real app keeps its main window.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const out = {};
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true } });
    // As the app loads it (index.ts caseStudyPdf): the page as a data URL.
    await win.loadURL(`data:text/html;base64,${fs.readFileSync(path.join(dir, name)).toString('base64')}`);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true);
    const layout = await win.webContents.executeJavaScript(`(() => {
      const b = document.querySelector('.body');
      const bars = [...document.querySelectorAll('.bar')];
      const h1 = document.querySelector('.headline');
      const kids = h1 ? [...h1.children].map((c) => c.className || 'words') : [];
      return {
        overflow: !!b && b.scrollHeight > b.clientHeight + 1,
        over: b ? b.scrollHeight - b.clientHeight : null,
        parts: Object.fromEntries(['.hero', '.band', '.cols', '.team', '.awaybox', '.why', '.foot'].map((q) => [q, document.querySelector(q)?.offsetHeight ?? 0])),
        dir: document.documentElement.dir,
        rows: document.querySelectorAll('.t-row').length,
        more: !!document.querySelector('.t-more'),
        firstBarRight: bars.length > 1 ? bars[0].getBoundingClientRect().left > bars[bars.length - 1].getBoundingClientRect().left : null,
        headline: kids
      };
    })()`, true);
    const paper = name.includes('-a4-') ? 'A4' : 'Letter';
    const pdf = await win.webContents.printToPDF({ pageSize: paper, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    out[name] = { ...layout, pages };
    win.destroy();
  }
  process.stdout.write(`RESULT ${JSON.stringify(out)}\n`);
  app.exit(0);
}).catch((e) => { process.stderr.write(String(e && e.stack || e)); app.exit(1); });
