'use strict';

// The privacy docs name the case study's send and its logo read
// (docs/designs/case-study.md, 0A and Behavior changes): both are things the
// app does on the internet, so TELEMETRY.md and the README must say so.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('TELEMETRY.md and the README disclose the case study send and the logo read', () => {
  const tel = read('TELEMETRY.md');
  assert.match(tel, /## Case studies you send us/);
  assert.match(tel, /Nothing leaves unless you press Send/);
  assert.match(tel, /hello@dontbemichael\.com/);
  assert.match(tel, /Your logo is read from your own website/);
  const readme = read('README.md');
  assert.match(readme, /reads your logo from your own website/);
  assert.match(readme, /A case study, only if you send it/);
  assert.match(readme, /TELEMETRY\.md#case-studies-you-send-us/);
});
