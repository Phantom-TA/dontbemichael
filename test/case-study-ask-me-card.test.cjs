'use strict';

/**
 * A case study prepared in the background is ready: Michael's card on Ask me,
 * not a corner toast that left after 15 seconds and could be missed (owner,
 * 2026-11-04). Main keeps whether it waits (case-study-service.test.cjs); this
 * covers the feed and where the card sits.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

function runFeed(body) {
  const script = `
    globalThis.setInterval = () => 1;
    globalThis.clearInterval = () => {};
    globalThis.document = { hidden: false };
    let changed = null;
    globalThis.status = { state: 'idle' };
    globalThis.window = { cth: {
      hiveTasks: () => Promise.resolve({ tasks: [] }),
      listScheduleRequests: () => Promise.resolve([]),
      onScheduleRequestsUpdated: () => () => {},
      caseStudyStatus: () => Promise.resolve(globalThis.status),
      onCaseStudyWaiting: (cb) => { changed = cb; return () => { changed = null; }; }
    } };
    const feed = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/shell/useNeedsYou.ts');
    const tick = () => new Promise((r) => setImmediate(r));
    const out = {};
    (async () => { ${body}; process.stdout.write(JSON.stringify(out)); })().catch((e) => { console.error(e); process.exit(1); });`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' }));
}

test('a waiting case study counts on Ask me, and leaves when main says it was seen', () => {
  // Value: protects=the pill shows the ready case study and drops it once opened or put off; fails_when=the feed ignores main's waiting flag or never reads it again; why_new=new behavior; seam=none
  const r = runFeed(`
    globalThis.status = { state: 'ready', input: {}, draft: null, logo: null, hasWork: true, waiting: true };
    feed.subscribeNeedsYou(() => {});
    await tick(); await tick();
    out.waiting = [feed.getNeedsYouFeed().caseStudyWaiting, feed.getNeedsYouFeed().count];
    globalThis.status = { state: 'ready', input: {}, draft: null, logo: null, hasWork: true };
    changed();
    await tick(); await tick();
    out.seen = [feed.getNeedsYouFeed().caseStudyWaiting, feed.getNeedsYouFeed().count];
  `);
  assert.deepEqual(r.waiting, [true, 1]);
  assert.deepEqual(r.seen, [false, 0]);
});

test('the card is on Ask me from Michael, and no toast says it any more', () => {
  // Value: protects=the card sits on the board under Michael's name with View and Later, and the 15 second toast is gone; fails_when=the card is unmounted, loses Michael's chip, or a toast comes back; why_new=new behavior; seam=source pin; no_claim=the look (live check in the dev app)
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /<UpdateCard update=\{update\} later=\{updateLater\} \/>\s*<CaseStudyCard waiting=\{caseStudyWaiting\} \/>/);
  assert.match(ask, /!engineCard && !updateShown && !caseShown && !onBreak/);
  const card = read('src/renderer/src/components/pulse/CaseStudyCard.tsx');
  assert.match(card, /<AgentAvatar id=\{godId\} name=\{godName\} size=\{16\} \/>\{godName\}/, 'sent by Michael');
  assert.match(card, /window\.cth\.caseStudySeen/, 'Later tells main');
  assert.match(card, /t\('caseStudy\.readyView'\)/);
  assert.doesNotMatch(card, /hiveAddTask|hivePatchTask|hiveSend/, 'nothing goes in tasks.json or to an agent');
  assert.equal(existsSync(path.join(root, 'src/renderer/src/components/pulse/CaseStudyToast.tsx')), false);
  const events = read('src/renderer/src/components/pulse/CaseStudyEvents.tsx');
  assert.doesNotMatch(events, /AUTO_DISMISS|role="status"/);
  assert.match(events, /if \(useStore\.getState\(\)\.caseStudyOpen\) void window\.cth\.caseStudySeen/, 'ready with the screen open needs no card');
  assert.match(read('src/main/caseStudy.ts'), /open\(input: CaseInput\): CaseOpen \| null \{\s*\/\/[^\n]*\n\s*this\.seen\(\);/);
});
