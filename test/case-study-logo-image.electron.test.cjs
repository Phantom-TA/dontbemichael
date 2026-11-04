'use strict';

// An SVG logo (owner, 2026-11-03: many sites have no other) is drawn to PNG
// in the app's own hidden window, keeps its shape, gives its colour, and a
// broken one is refused. Real Chromium, so macOS only (platform scoped tests).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('an SVG logo is drawn to PNG with its shape and colour; a broken one is refused', { skip: process.platform === 'darwin' ? false : 'macOS only (platform scoped tests)', timeout: 60000 }, async () => {
  // Value: protects=a case study keeps the business's logo and colour when its site serves only SVG; fails_when=SVG drawing breaks, squashes a wide logo or loses its colour; why_new=node tests cannot draw; seam=none; no_claim=other platforms
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [path.join(__dirname, 'fixtures', 'case-study-logo-image-main.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (s) => { output += s; });
  child.stderr.on('data', (s) => { output += s; });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0, output);
  const line = output.split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, output);
  const r = JSON.parse(line.slice(7));
  assert.ok(r.drawn, 'the SVG was drawn');
  assert.ok(Math.abs(r.drawn.w / r.drawn.h - 300 / 95) < 0.05, `keeps its wide shape (${r.drawn.w}x${r.drawn.h})`);
  assert.ok(r.kept && Math.max(r.kept.w, r.kept.h) <= 512, 'kept at most 512 px on its long side');
  assert.equal(r.kept.colour, '#B08D57', 'its brass is the page colour');
  assert.equal(r.broken, null);
});
