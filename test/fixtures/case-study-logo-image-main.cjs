'use strict';
// Electron main for case-study-logo-image.electron.test.cjs: draws SVG logos
// through the app's own module and reports what came out.
const { app } = require('electron');
const loadTs = require('../load-ts.cjs');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const m = loadTs('src/main/caseLogoImage.ts');
  const size = (png) => (png ? { w: png.readUInt32BE(16), h: png.readUInt32BE(20) } : null);
  // A wide brass logo sized by its viewBox only, with a script and an outside image that must do nothing.
  const wide = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 95"><rect width="300" height="95" fill="#B08D57"/><image href="https://example.com/x.png" width="10" height="10"/><script>window.top.document.title="ran"</script></svg>');
  const drawn = await m.drawCaseSvg(wide);
  const kept = drawn ? m.decodeCaseLogo(drawn) : null;
  const broken = await m.drawCaseSvg(Buffer.from('<svg><g'));
  process.stdout.write(`RESULT ${JSON.stringify({ drawn: size(drawn), kept: kept ? { ...size(kept.png), colour: kept.colour } : null, broken })}\n`);
  app.exit(0);
}).catch((e) => { process.stderr.write(String(e && e.stack || e)); app.exit(1); });
