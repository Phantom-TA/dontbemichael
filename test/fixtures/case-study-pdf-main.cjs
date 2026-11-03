'use strict';
// Electron main for case-study-pdf.electron.test.cjs: prints each page the
// test wrote and reports its page count, its member cards and, for Arabic, its
// layout. A phone-*.html page is the web page at phone width: it reports its
// width only.
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
    const phone = name.startsWith('phone-');
    const win = new BrowserWindow({ show: false, width: phone ? 390 : 900, height: 1200, useContentSize: true, webPreferences: { sandbox: true } });
    // As the app loads it (index.ts caseStudyPdf): the page as a data URL.
    await win.loadURL(`data:text/html;base64,${fs.readFileSync(path.join(dir, name)).toString('base64')}`);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true);
    const layout = await win.webContents.executeJavaScript(`(() => {
      const bars = [...document.querySelectorAll('.bar')];
      const h1 = document.querySelector('.headline');
      const kids = h1 ? [...h1.children].map((c) => c.className || 'words') : [];
      return {
        dir: document.documentElement.dir,
        rows: document.querySelectorAll('.m-card').length,
        scrollWidth: document.documentElement.scrollWidth,
        viewWidth: window.innerWidth,
        firstBarRight: bars.length > 1 ? bars[0].getBoundingClientRect().left > bars[bars.length - 1].getBoundingClientRect().left : null,
        headline: kids
      };
    })()`, true);
    if (phone) { out[name] = layout; win.destroy(); continue; }
    const paper = name.includes('-a4-') ? 'A4' : 'Letter';
    const pdf = await win.webContents.printToPDF({ pageSize: paper, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    out[name] = { ...layout, pages };
    win.destroy();
  }
  process.stdout.write(`RESULT ${JSON.stringify(out)}\n`);
  app.exit(0);
}).catch((e) => { process.stderr.write(String(e && e.stack || e)); app.exit(1); });
