'use strict';

/**
 * Hiring after setup (owner, 2026-09-25): the hire dialog has the same Role,
 * Role description and Work style fields as Edit Agent, and on a business
 * install a new team member's folder goes inside Michael's, named after the
 * role, so same-role hires share it. Michael's folder and the Office can't be a
 * team member's own folder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const modal = read('src/renderer/src/components/AddAgentModal.tsx');
const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));

test('the hire wizard asks for Role and what they will do, stored as Role: description', () => {
  for (const key of ['addAgent.role', 'addAgent.roleHelp', 'jobChange.whatWillDo', 'jobChange.handles']) {
    assert.match(modal, new RegExp(`tr\\('${key.replace('.', '\\.')}'`), key);
  }
  assert.match(modal, /const description = hireRole\(title, routing\);/, 'stored as Role: description');
  assert.match(modal, /const split = splitAgentRole\(m\.description\);/, 'an imported hire fills both fields');
  assert.equal(en.addAgent.description, undefined, 'the old Description field is gone');
});

test('a new team member gets its own folder inside Michael\'s, suffixed with its name on a clash', () => {
  assert.match(modal, /const michaelFolder = config\.businessFolder;/);
  assert.match(modal, /window\.cth\.foldersExist\(michaelFolder, candidates\)/);
  assert.match(modal, /setFolderName\(hireFolderName\(base, n, \(f\) => !!onDisk\[f\] \|\| used\.has\(f\.toLowerCase\(\)\)\)\)/, 'on disk or used by a teammate');
  assert.match(modal, /if \(michaelFolder && !customCwd\) \{\s*const \[made\] = await window\.cth\.foldersEnsure\(\[cwd\]\)/, 'made on hire, never overwritten');
});

test('Michael\'s folder is never a team member\'s own folder', () => {
  assert.match(modal, /if \(michaelFolder && samePath\(michaelFolder, cwd\)\)/);
  assert.match(wizard, /key !== OFFICE_KEY && same\(michaelFolderFor\(folderSuggestions, folderOverrides\)\)/);
  assert.doesNotMatch(en.addAgent.errFolderShared, /[–—]/);
});

// ─── A long job folder name (the 60 unit cut) ───────────────────────────────

const loadTs = require('./load-ts.cjs');
const { hireFolderName, hireFolderCandidates, safeFolder } = loadTs('src/shared/hireTemplates.ts');
const { safeFolderName } = loadTs('src/main/agentFolders.ts');

/** Hires one member as the wizard does: the folder it picks, cleaned for the
 *  path it makes, against what is already on disk (as main checks it). */
function hireInto(disk, base, name) {
  const folder = safeFolder(hireFolderName(base, name, (f) => disk.has(safeFolderName(f))));
  disk.add(folder);
  return folder;
}

test('a long job folder name still gives each hire its own folder', () => {
  // Value: protects=two hires never share one folder; fails_when=the _<Name> suffix is added past 60 units and the cut takes it off again; why_new=a long job name put every later hire in the first hire's folder; seam=none
  const base = safeFolder('Customer Success and Retention Operations Lead for North America');
  const disk = new Set();
  const made = ['Avery', 'Avery', 'Blake', 'Avery'].map((n) => hireInto(disk, base, n));
  assert.equal(new Set(made).size, made.length, made.join(' | '));
  for (const f of made) {
    assert.ok(f.length <= 60, `${f.length}: ${f}`);
    assert.equal(safeFolderName(f), f, 'the folder main checks is the folder the wizard makes');
  }
  assert.match(made[1], /_Avery$/);
  assert.match(made[3], /_Avery_2$/);
});

test('a very long hire name still leaves room for the counter', () => {
  const disk = new Set();
  const made = [1, 2, 3].map(() => hireInto(disk, 'Sales', 'Bartholomew'.repeat(8)));
  assert.equal(new Set(made).size, 3, made.join(' | '));
  for (const f of made) assert.ok(f.length <= 60, `${f.length}`);
  assert.match(made[0], /^Sales$/);
  assert.match(made[1], /^Sales_Bartholomew/);
});

test('the wizard checks on disk exactly the folders hireFolderName tries', () => {
  const base = safeFolder('Customer Success and Retention Operations Lead for North America');
  const candidates = hireFolderCandidates(base, 'Avery', 10);
  assert.equal(candidates.length, 10);
  assert.equal(new Set(candidates).size, 10);
  const taken = new Set(candidates.slice(0, 4));
  assert.equal(hireFolderName(base, 'Avery', (f) => taken.has(f)), candidates[4]);
  assert.match(modal, /const candidates = hireFolderCandidates\(base, n, 10\);/);
});

test('the wizard and the main process clean a folder name the same way', () => {
  // Value: protects=the folder the wizard makes is the one main finds; fails_when=the two cleaners differ (doubled spaces, tabs, reserved names); why_new=the wizard kept "A  B" and "CON" while main checked "A B" and "CON-folder"; seam=none
  for (const raw of ['A  B', 'Tab\there', 'CON', 'con.tar.gz', 'Del\u007fete', '../../x', '  Café  ', 'A/B Consulting', 'Q: What?', 'Finance.', 'Word '.repeat(30), `Sunny${'😀'.repeat(28)} Bakery`]) {
    assert.equal(safeFolder(raw), safeFolderName(raw), JSON.stringify(raw));
  }
  assert.equal(safeFolder('  ..  '), '', 'nothing usable is still empty in the wizard');
});
