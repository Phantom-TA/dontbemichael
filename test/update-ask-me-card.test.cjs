'use strict';

/**
 * A new version reaches the owner as Michael's card on Ask me, not as a corner
 * popup with Later and Restart over the office (owner, 2026-11-04). The card is
 * the app's own (UpdateCard), like Get Michael ready: nothing in tasks.json,
 * so no agent can write, answer or restart through it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const { updateNeed, updateCardShown } = loadTs('src/shared/updateState.ts');

const downloaded = { state: 'downloaded', version: '0.3.6', notes: '- Faster mail' };
const manual = { state: 'available-manual', version: '0.3.6', url: 'https://github.com/x/y/releases/tag/v0.3.6' };

test('only a version the owner acts on makes the card, and Later holds for that version only', () => {
  // Value: protects=the card shows for restart and download, never for a check or an error, and Later never hides a newer version; fails_when=another state makes a card, or Later hides every version; why_new=new behavior; seam=none
  assert.equal(updateNeed(downloaded), downloaded);
  assert.equal(updateNeed(manual), manual);
  for (const s of [{ state: 'idle' }, { state: 'checking' }, { state: 'not-available' }, { state: 'available', version: '0.3.6' },
    { state: 'downloading', version: '0.3.6', percent: 40 }, { state: 'just-updated', version: '0.3.6' }, { state: 'error', message: 'x' }, null, undefined]) {
    assert.equal(updateNeed(s), null, JSON.stringify(s));
  }
  assert.equal(updateCardShown(downloaded, null), true);
  assert.equal(updateCardShown(downloaded, '0.3.6'), false, 'Later for this version');
  assert.equal(updateCardShown({ ...downloaded, version: '0.3.7' }, '0.3.6'), true, 'a newer version asks again');
  assert.equal(updateCardShown(null, null), false);
});

function runFeed(body) {
  const script = `
    globalThis.setInterval = () => 1;
    globalThis.clearInterval = () => {};
    globalThis.document = { hidden: false };
    let push = null;
    globalThis.window = { cth: {
      hiveTasks: () => Promise.resolve({ tasks: [] }),
      listScheduleRequests: () => Promise.resolve([]),
      onScheduleRequestsUpdated: () => () => {},
      onUpdateStatus: (cb) => { push = cb; return () => { push = null; }; },
      updateCurrent: () => Promise.resolve(globalThis.current ?? { state: 'idle' })
    } };
    const feed = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/shell/useNeedsYou.ts');
    const tick = () => new Promise((r) => setImmediate(r));
    const out = {};
    (async () => { ${body}; process.stdout.write(JSON.stringify(out)); })().catch((e) => { console.error(e); process.exit(1); });`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' }));
}

test('the update counts on Ask me, survives a re-check, and Later takes it off until a newer version', () => {
  // Value: protects=the pill shows the update like an open ask, a 6h re-check never takes it away, and Later works per version; fails_when=the update is not counted, a checking push clears it, or Later hides a newer version; why_new=new behavior; seam=none
  const r = runFeed(`
    feed.subscribeNeedsYou(() => {});
    await tick(); await tick();
    out.none = feed.getNeedsYouFeed().count;
    push(${JSON.stringify(downloaded)});
    out.ready = [feed.getNeedsYouFeed().count, feed.getNeedsYouFeed().update?.version];
    push({ state: 'checking' });
    push({ state: 'not-available' });
    out.recheck = [feed.getNeedsYouFeed().count, feed.getNeedsYouFeed().update?.state];
    feed.putOffUpdate('0.3.6');
    out.later = feed.getNeedsYouFeed().count;
    push(${JSON.stringify({ ...downloaded, version: '0.3.7' })});
    out.newer = feed.getNeedsYouFeed().count;
  `);
  assert.equal(r.none, 0);
  assert.deepEqual(r.ready, [1, '0.3.6'], 'one for the pill, like an open ask');
  assert.deepEqual(r.recheck, [1, 'downloaded'], 'a re-check keeps the card');
  assert.equal(r.later, 0, 'Later takes it off Ask me');
  assert.equal(r.newer, 1, 'a newer version asks again');
});

test('a status main already had when the window opened makes the card', () => {
  // Value: protects=an update found before the window listened still reaches Ask me; fails_when=the feed only follows pushes; why_new=new behavior; seam=none
  const r = runFeed(`
    globalThis.current = ${JSON.stringify(manual)};
    feed.subscribeNeedsYou(() => {});
    await tick(); await tick();
    out.got = [feed.getNeedsYouFeed().count, feed.getNeedsYouFeed().update?.state];
  `);
  assert.deepEqual(r.got, [1, 'available-manual']);
});

test('Ask me shows the card from Michael, and no popup offers Later or Restart over the office', () => {
  // Value: protects=the card is on the board under Michael's name, and the corner popup is gone; fails_when=the card is unmounted, loses Michael's chip, or UpdateToast offers the restart again; why_new=new behavior; seam=source pin; no_claim=the look (live check in the dev app)
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /<EngineSetupCard status=\{engineCard \? engineSetup : null\} \/>\s*<UpdateCard update=\{update\} later=\{updateLater\} \/>/);
  const card = read('src/renderer/src/components/UpdateCard.tsx');
  assert.match(card, /<AgentAvatar id=\{godId\} name=\{godName\} size=\{16\} \/>\{godName\}/, 'sent by Michael');
  assert.match(card, /onClick=\{\(\) => putOffUpdate\(update\.version\)\}>\{t\('updateToast\.later'\)\}/);
  assert.match(card, /window\.cth\.updateRestartAndInstall\(\)/);
  assert.doesNotMatch(card, /hiveAddTask|hivePatchTask|hiveSend/, 'nothing goes in tasks.json or to an agent');
  const toast = read('src/renderer/src/components/UpdateToast.tsx');
  assert.doesNotMatch(toast, /updateRestartAndInstall|updateToast\.later|updateToast\.restart|cth-toast/);
  assert.match(toast, /<ReleaseDrop /, 'the authored release page still opens');
});

test('the words on the card have no dashes', () => {
  // Value: protects=the owner rule on dashes in what they read; fails_when=a card string gains a dash; why_new=the strings now sit on an Ask me card; seam=none
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).updateToast;
  for (const k of ['downloadedTitle', 'availableTitle', 'downloadedBody', 'manualBody', 'whatsNew', 'readMore', 'later', 'restart', 'download', 'openReleases']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});
