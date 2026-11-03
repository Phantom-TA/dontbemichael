'use strict';

// The case study screen under React StrictMode, as the app renders it in
// development (src/renderer/src/main.tsx). StrictMode mounts, unmounts and
// mounts again; the screen's "still mounted" flag must survive that, or every
// answer from main is dropped and the owner sees "Reading your office's
// figures" for ever (owner report, 2026-11-03).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildSync } = require('esbuild');

test('the case study screen shows the page and mailboxes under StrictMode', { timeout: 90000 }, async () => {
  // Value: protects=the screen leaves its loading state; fails_when=an unmount flag is set false and never back to true; why_new=no test mounted the screen; seam=preload API faked (window.cth); no_claim=main's real answers (case-study-service.test)
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'case screen '));
  try {
    const result = buildSync({
      entryPoints: [path.join(__dirname, 'fixtures', 'case-study-screen.tsx')], bundle: true, write: false,
      outdir: dir, jsx: 'automatic', format: 'iife',
      alias: { '@': path.join(root, 'src/renderer/src'), '@shared': path.join(root, 'src/shared') },
      loader: { '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' }
    });
    const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
    const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
    fs.writeFileSync(path.join(dir, 'screen.html'), `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures', 'case-study-screen-main.cjs'), dir], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (s) => { output += s; });
    child.stderr.on('data', (s) => { output += s; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`screen fixture timed out:\n${output}`)); }, 75000);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (c) => { clearTimeout(timer); resolve(c); });
    });
    assert.equal(code, 0, output);
    const line = output.split('\n').find((l) => l.startsWith('RESULT '));
    assert.ok(line, output);
    const state = JSON.parse(line.slice(7));
    assert.equal(state.loading, false, `the loading line is gone ${JSON.stringify(state)}`);
    assert.equal(state.mailbox, true, 'the mailboxes from main are listed');
    assert.equal(state.frame, true, 'the page is drawn');
    assert.match(state.headline ?? '', /Harbor Bakery handled\s+1,284\s+emails/, 'with the prepared headline');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp folder */ }
  }
});
