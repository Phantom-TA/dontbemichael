'use strict';

// Ctrl+C on selected terminal text copies it on every keyboard layout. On a
// Russian, Arabic, Greek or Hebrew layout `key` is not 'c', so the copy was
// skipped and xterm sent the agent an interrupt instead.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { shortcutLetter } = loadTs('src/renderer/src/components/shortcutLetter.ts');

test('a shortcut on a non-Latin layout is read from the physical key', () => {
  // Value: protects=Ctrl+C copies a selection and Ctrl+Shift+V pastes on any layout; fails_when=a non-Latin layout's letter is compared with 'c' or 'v'; why_new=bug fix; seam=none; no_claim=xterm's own key mapping
  for (const [layout, key] of [['Russian', 'с'], ['Arabic', 'ؤ'], ['Greek', 'ψ'], ['Hebrew', 'ב'], ['Russian with Shift', 'С']]) {
    assert.equal(shortcutLetter({ key, code: 'KeyC' }), 'c', layout);
  }
  assert.equal(shortcutLetter({ key: 'М', code: 'KeyV' }), 'v', 'Ctrl+Shift+V on a Russian layout');
});

test('a Latin layout keeps its own letter', () => {
  // Value: protects=US, Dvorak and AZERTY owners keep the shortcuts they know; fails_when=the physical key wins over a Latin letter; why_new=bug fix; seam=none; no_claim=none
  assert.equal(shortcutLetter({ key: 'c', code: 'KeyC' }), 'c', 'US');
  assert.equal(shortcutLetter({ key: 'C', code: 'KeyC' }), 'c', 'US with Shift');
  assert.equal(shortcutLetter({ key: 'c', code: 'KeyI' }), 'c', 'Dvorak C sits on the I key');
  assert.equal(shortcutLetter({ key: 'j', code: 'KeyC' }), 'j', 'Dvorak J sits on the C key and is not a copy');
  assert.equal(shortcutLetter({ key: 'Enter', code: 'Enter' }), 'enter', 'a key that is not a letter stays as it is');
  assert.equal(shortcutLetter({ key: 'с' }), 'с', 'no code: nothing to fall back on');
});

test('an AltGr character keeps its own letter', () => {
  // Value: protects=Polish, Hungarian and other AltGr typists on Windows, where AltGr arrives as Ctrl+Alt; fails_when=the physical-key fallback runs with Alt held; why_new=review fix; seam=none; no_claim=xterm's own AltGr handling
  assert.equal(shortcutLetter({ key: 'ć', code: 'KeyC', altKey: true }), 'ć', 'Polish AltGr+C');
  assert.equal(shortcutLetter({ key: 'Ć', code: 'KeyC', altKey: true }), 'ć', 'Polish AltGr+Shift+C');
  assert.equal(shortcutLetter({ key: '&', code: 'KeyC', altKey: true }), '&', 'Hungarian AltGr+C');
  assert.equal(shortcutLetter({ key: 'с', code: 'KeyC', altKey: false }), 'c', 'Russian Ctrl+C still copies');
  assert.equal(shortcutLetter({ key: 'c', code: 'KeyC', altKey: true }), 'c', 'Cmd+Option+C keeps its Latin letter');
});

test('an input method, dead or unidentified key is never read as a shortcut letter', () => {
  // Value: protects=a Japanese, Chinese or Korean input method, and dead-key accents, under Ctrl or Cmd with Shift or a selection; fails_when=a named key on the C or V key falls back to its physical letter and copies or pastes instead of reaching the input method; why_new=review note on #657; seam=none; no_claim=xterm's composition handling
  for (const key of ['Process', 'Dead', 'Unidentified']) {
    assert.equal(shortcutLetter({ key, code: 'KeyC' }), key.toLowerCase(), `${key} on the C key`);
    assert.equal(shortcutLetter({ key, code: 'KeyV' }), key.toLowerCase(), `${key} on the V key`);
  }
  assert.equal(shortcutLetter({ key: 'с', code: 'KeyC' }), 'c', 'a Russian Ctrl+C still copies');
  assert.equal(shortcutLetter({ key: 'М', code: 'KeyV' }), 'v', 'a Russian Ctrl+Shift+V still pastes');
});

test('the terminal reads its copy and paste letter through shortcutLetter', () => {
  // Value: protects=the wiring of the helper into the terminal's key handler; fails_when=the handler goes back to ev.key; why_new=bug fix; seam=none; no_claim=none
  const src = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/terminalPool.ts'), 'utf8');
  assert.match(src, /attachCustomKeyEventHandler\(\(ev\) => \{\n\s+const key = shortcutLetter\(ev\);/);
  assert.doesNotMatch(src, /ev\.key\.toLowerCase\(\)/);
});
