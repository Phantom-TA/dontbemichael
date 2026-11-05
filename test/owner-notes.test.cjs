/**
 * The owner's notes for members' memory (src/main/ownerNotes.ts, memory
 * evidence D9): kept in harness.db outside every agent folder, pending until
 * the tidy-up files them, held in memory when a write fails, cleared with the
 * office's memory.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!process.env.OWNER_NOTES_UNDER_ELECTRON) {
  let bin = null;
  try { bin = require('electron'); } catch { bin = null; }
  const ok = typeof bin === 'string' && fs.existsSync(bin);
  test('owner notes store (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    // Value: protects=a failing test in this file fails the suite; fails_when=the nested run inherits NODE_TEST_CONTEXT and exits 0 on a failure; why_new=same nesting as pulse-telemetry.test.cjs; seam=none; no_claim=none beyond protects
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', OWNER_NOTES_UNDER_ELECTRON: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(bin, ['--test', __filename], { env, encoding: 'utf8', timeout: 300_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# fail 0/, 'the nested run reported its own results');
  });
  return;
}

const loadTs = require('./load-ts.cjs');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const { PersistStore } = loadTs('src/main/db.ts');
const { OwnerNotes, MAX_OWNER_NOTE_CHARS } = loadTs('src/main/ownerNotes.ts');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-ownernotes-'));
  const persist = new PersistStore(path.join(dir, 'harness.db'));
  persist.open();
  t.after(() => { persist.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  let office = '/office-a';
  const store = new OwnerNotes(() => persist.database(), () => office, () => Date.UTC(2026, 9, 23, 12));
  return { persist, store, setOffice: (o) => { office = o; } };
}

test('a note waits for its member until the tidy-up files it, per office', (t) => {
  // Value: protects=the owner's notes reach the right member once; fails_when=pending ignores the office or member, or a filed note comes back; why_new=memory evidence D9; seam=none; no_claim=the tidy-up's use of them (memory-tidy tests)
  const { persist, store, setOffice } = setup(t);
  assert.equal(persist.database().prepare("SELECT name FROM sqlite_master WHERE name = 'owner_notes'").get()?.name, 'owner_notes');
  assert.equal(persist.database().prepare("SELECT name FROM sqlite_master WHERE name = 'cost_ledger'").get()?.name, 'cost_ledger', 'migration 5 still runs first');
  assert.equal(store.add('oscar', '- From the owner (2026-10-23): pay on time.\n', 'you decided proposal p_1 on Ask me, 2026-10-23'), true);
  assert.equal(store.add('pam', 'Write short emails', 'you told Michael in the dock, 2026-10-23'), true);
  const [n] = store.pending('oscar');
  assert.deepEqual([n.agentId, n.text, n.why, n.at], ['oscar', 'From the owner (2026-10-23): pay on time.', 'you decided proposal p_1 on Ask me, 2026-10-23', '2026-10-23T12:00:00.000Z']);
  assert.ok(n.id > 0, 'saved, not held');
  setOffice('/office-b');
  assert.deepEqual(store.pending('oscar'), [], 'another office sees none');
  setOffice('/office-a');
  store.filed([n.id]);
  assert.deepEqual(store.pending('oscar'), []);
  assert.equal(store.pending('pam').length, 1);
  assert.equal(store.add('../x', 'a', 'b'), false);
  assert.equal(store.add('oscar', '   ', 'b'), false);
  store.add('oscar', 'x'.repeat(MAX_OWNER_NOTE_CHARS + 50), 'y'.repeat(300));
  const [long] = store.pending('oscar');
  assert.equal(long.text.length, MAX_OWNER_NOTE_CHARS);
  assert.equal(long.why.length, 120, 'the Why is capped like any evidence');
});

test('a note whose write fails is held and saved on the next try', (t) => {
  // Value: protects=an owner's note is never lost to a database hiccup; fails_when=a failed insert drops the note or a held one is filed twice; why_new=memory evidence T3; seam=database getter
  const { persist, store: _unused } = setup(t);
  let up = false;
  const store = new OwnerNotes(() => (up ? persist.database() : null), () => '/office-a');
  store.add('oscar', 'Keep invoices in the shared folder', 'you answered on Ask me on card t_1, 2026-10-23');
  const [held] = store.pending('oscar');
  assert.ok(held.id < 0, 'held in memory');
  up = true;
  const [saved] = store.pending('oscar');
  assert.ok(saved.id > 0, 'saved once the database is back');
  assert.equal(store.pending('oscar').length, 1, 'once, not twice');
});

test('a memory reset clears the office\'s notes and only that office\'s', (t) => {
  // Value: protects=a reset leaves no owner note to refile into fresh memory; fails_when=clearOffice keeps rows or clears another office; why_new=memory evidence T3; seam=none
  const { store, setOffice } = setup(t);
  store.add('oscar', 'one', 'w');
  setOffice('/office-b');
  store.add('oscar', 'two', 'w');
  store.clearOffice('/office-b');
  assert.deepEqual(store.pending('oscar'), []);
  setOffice('/office-a');
  assert.equal(store.pending('oscar').length, 1);
});
