'use strict';

// The case study service (src/main/caseStudy.ts) with fake deps: what the page
// is built from, when the draft runs, and every Send outcome the screen shows
// (docs/designs/case-study.md, D1, D19, D20, eng A2, C1, C2).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { CaseStudyService, caseInput, caseRange } = loadTs('src/main/caseStudy.ts');
const { MailError } = loadTs('src/main/mail.ts');
const { logPoints } = loadTs('src/main/pulseBackfill.ts');

const NOW = new Date(2026, 10, 3, 12).getTime();
const snapshot = (over = {}) => ({
  period: 'this-month', from: '2026-10-05', to: '2026-11-03', totalUsd: 184,
  outcomes: [{ kind: 'email', total: 1284, by: [] }, { kind: 'sent', total: 0, by: [] }, { kind: 'task', total: 96, by: [] }, { kind: 'check', total: 12, by: [] }],
  members: [{ agentId: 'pam', counts: { email: 640, sent: 0, task: 3, check: 2 }, checksNothing: 1 }],
  running: { ms: 410 * 3_600_000, awayMs: 286 * 3_600_000, since: null },
  michael: { agentId: 'god', routed: 158 },
  ...over
});

function deps(over = {}) {
  const calls = { log: [], sends: [], invite: 0, model: 0, pdf: 0 };
  const d = {
    config: () => ({ businessName: 'Harbor Bakery', businessCity: 'Austin', businessType: 'restaurant-food', companyProfile: { website: 'harbor.example', ceo: 'Dana Reyes' } }),
    typeName: () => 'Restaurant & Food',
    offer: () => 'Bread for cafes',
    roster: () => [
      { id: 'pam', name: 'Pam', role: 'Front desk: Answers the inbox' },
      { id: 'god', name: 'Michael', role: 'Office manager', isGod: true },
      { id: 'off', name: 'Kevin', role: 'Accounts', closedByOwner: true },
      { id: 'helper', name: 'Prep', isAssistant: true }
    ],
    missions: () => [
      { to: 'pam', label: 'Morning inbox', enabled: true, intervalMs: 0, weekly: { days: [1, 2, 3, 4, 5], minute: 450 } },
      { to: 'pam', label: 'Old job', enabled: false, intervalMs: 3_600_000 },
      { to: 'god', label: 'Daily standup', enabled: true, intervalMs: 86_400_000 },
      { to: 'pam', label: 'Heartbeat', enabled: true, intervalMs: 3_600_000, kind: 'heartbeat' }
    ],
    tools: (id) => (id === 'pam' ? ['Email', 'QuickBooks'] : []),
    figures: () => ({ snapshot: snapshot(), days: Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, ms: 0, awayMs: 0 })) }),
    runModel: async () => { calls.model++; return { ok: true, text: JSON.stringify({ subtitle: "A bakery and its Don't Be Michael team", about: 'Bakes bread', why: "Don't Be Michael frees the owner", headlines: { email: 'Harbor Bakery handled {n} emails' }, team: { pam: 'Sorts the inbox', god: 'Routes the work' } }) }; },
    readLogo: () => null, writeLogo: () => {}, fetchLogo: async () => ({ ok: false, reason: 'no-site' }), decodeLogo: () => null, readFile: () => null,
    makePdf: async () => { calls.pdf++; return { ok: true, pdf: Buffer.from('%PDF') }; },
    mailSend: async (mailbox, input) => { calls.sends.push({ mailbox, input }); return { sent: true }; },
    senders: () => [{ id: 'ceo', address: 'ceo@x.com', canSend: true }, { id: 'old', address: 'o@x.com', canSend: false, reason: 'Sign in again.' }],
    log: (e) => calls.log.push(e),
    inviteDone: () => { calls.invite++; },
    office: () => calls.office ?? '/office', onReady: () => { calls.ready = (calls.ready ?? 0) + 1; },
    fonts: () => [], paper: () => 'letter', appVersion: '0.3.5', now: () => NOW,
    ...over
  };
  return { svc: new CaseStudyService(d), calls };
}
const input = { lang: 'en', period: 'last-30', showName: true };

test('the screen input is checked, and the last 30 days end today', () => {
  // Value: protects=the owner can't change the case study (case-study-tab.md, D3): only its language comes from the screen; fails_when=a period or a hidden name sent by the screen reaches main; why_new=owner 2026-11-04; seam=none
  assert.equal(caseInput({ lang: 'fr', period: 'last-30' }), null);
  assert.deepEqual(caseInput({ lang: 'ar', period: 'this-month', showName: false }), { lang: 'ar', period: 'last-30', showName: true }, 'always the last 30 days with the name shown');
  assert.deepEqual(caseInput({ lang: 'en' }), { lang: 'en', period: 'last-30', showName: true });
  const r = caseRange('last-30', NOW);
  assert.equal(r.to, '2026-11-03');
  assert.equal(r.from, '2026-10-05');
  assert.equal(caseRange('this-month', NOW).from, '2026-11-01');
});

test('facts: Michael first, members turned off left out, scheduled jobs and each figure', () => {
  const f = deps().svc.facts(input);
  assert.deepEqual(f.members.map((m) => m.id), ['god', 'pam']);
  const pam = f.members[1];
  assert.equal(pam.role, 'Front desk');
  assert.equal(pam.roleDescription, 'Answers the inbox');
  assert.deepEqual(pam.jobs, ['Morning inbox']);
  assert.deepEqual(pam.schedules, [{ label: 'Morning inbox', when: 'Weekdays at 07:30' }], 'running jobs only, never a heartbeat, with their times (D28)');
  assert.deepEqual(pam.tools, ['Email', 'QuickBooks']);
  assert.deepEqual(f.members[0].schedules, [{ label: 'Daily standup', when: 'Every day' }], "Michael's jobs say 'god'");
  assert.deepEqual(pam.figure, { kind: 'email', count: 640 });
  assert.deepEqual(f.members[0].figure, { kind: 'routed', count: 158 });
  assert.equal(f.figures.spendUsd, 184);
  assert.equal(f.businessType, 'Restaurant & Food');
});

test('no measured work: no draft call, and Save and Send refuse (D19)', async () => {
  const empty = snapshot({ outcomes: [{ kind: 'email', total: 0 }, { kind: 'sent', total: 0 }, { kind: 'task', total: 0 }, { kind: 'check', total: 0 }] });
  const { svc, calls } = deps({ figures: () => ({ snapshot: empty, days: [] }) });
  assert.deepEqual(await svc.draft(input), { ok: false, reason: 'no-work' });
  assert.equal(calls.model, 0);
  assert.deepEqual(await svc.send(input, 'ceo', true), { ok: false, kind: 'no-work' });
  assert.equal(svc.open(input).hasWork, false);
});

test('the draft runs a second time only for parts the first left out', async () => {
  let n = 0;
  const { svc } = deps({ runModel: async () => ({ ok: true, text: n++ === 0 ? JSON.stringify({ subtitle: "First words with Don't Be Michael", about: 'Saves 10 hours' }) : JSON.stringify({ subtitle: "Later words with Don't Be Michael", about: 'Bakes bread' }) }) });
  const r = await svc.draft(input);
  assert.equal(n, 2);
  assert.equal(r.draft.subtitle, "First words with Don't Be Michael", 'the first draft wins where it gave a part');
  assert.equal(r.draft.about, 'Bakes bread');
  const failed = deps({ runModel: async () => ({ ok: false, error: 'engine unavailable' }) });
  assert.deepEqual(await failed.svc.draft(input), { ok: false, reason: 'failed' });
});

test('Send goes to our address only, logs its own kind with no member, and ends the invitation', async () => {
  const { svc, calls } = deps();
  assert.deepEqual(await svc.send(input, 'ceo', true), { ok: true });
  assert.equal(calls.sends[0].mailbox, 'ceo');
  assert.equal(calls.sends[0].input.to, 'hello@dontbemichael.com');
  assert.deepEqual(calls.sends[0].input.files.map((x) => [x.filename, x.contentType]), [['case-study.html', 'text/html'], ['case-study.pdf', 'application/pdf']], 'the web page to publish and its PDF copy (D28)');
  const web = calls.sends[0].input.files[0].content.toString('utf8');
  assert.match(web, /@media \(max-width:760px\)/, 'the attached page is the web page, not the print one');
  assert.doesNotMatch(web, /@page/);
  assert.match(calls.sends[0].input.body, /will take it down if I ask/);
  const line = calls.log.find((e) => e.kind === 'case-study-sent');
  assert.equal(line.agentId, undefined);
  assert.equal(line.text, "You sent a case study to Don't Be Michael");
  assert.equal(calls.invite, 1);
  // Pulse counts a member's 'mail-sent'; the owner's line is never one.
  assert.deepEqual(logPoints([{ ...line, ts: NOW }], 0, NOW + 1, new Set(['pam'])), []);
});

test('Send refuses without the tick or from a mailbox that cannot send', async () => {
  const { svc, calls } = deps();
  assert.deepEqual(await svc.send(input, 'ceo', false), { ok: false, kind: 'no-permission' });
  assert.deepEqual(await svc.send(input, 'old', true), { ok: false, kind: 'no-mailbox' });
  assert.equal(calls.sends.length, 0);
  assert.equal(calls.invite, 0);
});

test('a timeout or an interrupted send may have gone out; a refusal shows the mailbox reason', async () => {
  const fail = (err) => deps({ mailSend: async () => { throw err; } }).svc.send(input, 'ceo', true);
  assert.deepEqual(await fail(new MailError('timeout', 'This email may already have gone out ... tell Michael', true)), { ok: false, kind: 'maybe-sent' });
  assert.deepEqual(await fail(new MailError('refused', 'This email may already have gone out ... tell Michael', false, true)), { ok: false, kind: 'maybe-sent' });
  assert.deepEqual(await fail(new MailError('auth', 'Not sent. The password was not accepted.')), { ok: false, kind: 'failed', reason: 'The password was not accepted.' });
  const broken = deps({ makePdf: async () => ({ ok: false, reason: 'failed' }) });
  assert.deepEqual(await broken.svc.send(input, 'ceo', true), { ok: false, kind: 'failed', reason: '' });
});

test('the mail app link carries our address, the subject and the permission line', () => {
  const url = deps().svc.mailto(input);
  assert.match(url, /^mailto:hello@dontbemichael\.com\?subject=Case%20study/);
  assert.match(decodeURIComponent(url), /will take it down if I ask/);
  assert.ok(url.length <= 2000);
});

test('the case study is prepared in the background and opens complete; asking again does not redraft (owner, 2026-11-03)', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { svc, calls } = deps({
    runModel: async () => { calls.model++; await gate; return { ok: true, text: JSON.stringify({ subtitle: "A bakery on Don't Be Michael", about: 'Bakes bread', why: "Don't Be Michael frees the owner", headlines: { email: 'Harbor Bakery handled {n} emails', task: 'Harbor Bakery finished {n} tasks', away: 'Harbor Bakery worked {n} hours while the owner was away' }, team: { pam: 'Sorts the inbox', god: 'Routes the work' } }) }; },
    readLogo: () => ({ png: Buffer.from('PNG'), colour: '#8C5A2B' })
  });
  assert.deepEqual(svc.prepare(input), { state: 'preparing', input }, 'returns at once');
  assert.deepEqual(svc.prepare(input), { state: 'preparing', input }, 'a second click waits for the same one');
  assert.equal(svc.status().state, 'preparing');
  release();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const p = svc.status();
  assert.equal(p.state, 'ready');
  assert.equal(calls.ready, 1, 'main is told once');
  assert.equal(p.draft.subtitle, "A bakery on Don't Be Michael");
  assert.equal(p.logo.ok, true);
  assert.equal(calls.model, 1, 'one draft for both clicks');
  assert.equal(svc.prepare(input).state, 'ready', 'asking again returns the prepared one');
  calls.office = '/other';
  assert.deepEqual(svc.status(), { state: 'idle' }, "another office never opens this office's case study");
});

test('with no measured work there is nothing to prepare: ready at once, no draft, no notice', () => {
  const empty = snapshot({ outcomes: [{ kind: 'email', total: 0 }, { kind: 'sent', total: 0 }, { kind: 'task', total: 0 }, { kind: 'check', total: 0 }] });
  const { svc, calls } = deps({ figures: () => ({ snapshot: empty, days: [] }) });
  const p = svc.prepare(input);
  assert.equal(p.state, 'ready');
  assert.equal(p.hasWork, false);
  assert.equal(calls.model, 0);
  assert.equal(calls.ready, undefined);
});

test('after Send the next Get featured prepares a fresh case study', async () => {
  const { svc } = deps();
  svc.prepare(input);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(svc.status().state, 'ready');
  assert.deepEqual(await svc.send(input, 'ceo', true), { ok: true });
  assert.deepEqual(svc.status(), { state: 'idle' });
});

test('the page is the app\'s own draft: the first headline choice and the drafted words, nothing from the screen (case-study-tab.md, D2)', async () => {
  // Value: protects=the owner can't change the page; fails_when=main prints any words but its own draft or built in ones, or a later headline choice; why_new=owner 2026-11-04 (replaces D24's pick); seam=fake model and PDF
  let page = '';
  const { svc } = deps({
    runModel: async () => ({ ok: true, text: JSON.stringify({ subtitle: "A bakery on Don't Be Michael", about: 'Bakes bread', why: "Don't Be Michael frees the owner", headlines: { email: 'Harbor Bakery handled {n} emails', task: 'Harbor Bakery finished {n} tasks', away: 'Harbor Bakery worked {n} hours while the owner was away' }, team: { pam: 'Sorts the inbox', god: 'Routes the work' } }) }),
    makePdf: async (html) => { page = html; return { ok: true, pdf: Buffer.from('%PDF') }; }
  });
  svc.prepare(input);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(svc.send.length, 3, 'send takes the input, the mailbox and the tick: no words');
  assert.deepEqual(await svc.send(input, 'ceo', true), { ok: true });
  assert.match(page, /<span>Harbor Bakery handled<\/span> <span class="lock"[^>]*>1,284<\/span> <span>emails<\/span>/, 'the first headline choice, in the drafted words');
  assert.match(page, /A bakery on Don(&#39;|')t Be Michael/);
  assert.match(page, /Sorts the inbox/);
  // Without a draft the page uses the built in words.
  let plain = '';
  const bare = deps({ makePdf: async (html) => { plain = html; return { ok: true, pdf: Buffer.from('%PDF') }; } });
  assert.equal((await bare.svc.pdf(input)).ok, true);
  assert.match(plain, /Don(&#39;|')t Be Michael/);
});

test('Save writes the PDF as .pdf and never replaces a file beside it with the page (ship review)', () => {
  // Value: protects=an earlier page or another file with the same name is never overwritten without being asked; fails_when=Save writes <name>.html over an existing file, or the PDF under a name without .pdf; why_new=ship review of 0.3.5; seam=an injected exists check
  const { savePaths } = require('./load-ts.cjs')('src/main/caseStudy.ts');
  const none = () => false;
  assert.deepEqual(savePaths('/d/case-study.pdf', none), { pdf: '/d/case-study.pdf', html: '/d/case-study.html' });
  assert.deepEqual(savePaths('/d/story', none), { pdf: '/d/story', html: '/d/story.html' }, 'the PDF goes exactly where the dialog confirmed');
  assert.deepEqual(savePaths('/d/Story.PDF', none).html, '/d/Story.html');
  const stranger = new Set(['/d/case-study.html', '/d/case-study (2).html']);
  assert.equal(savePaths('/d/case-study.pdf', (p) => stranger.has(p)).html, '/d/case-study (3).html', 'a page with no PDF beside it is never replaced');
  const pair = new Set(['/d/case-study.pdf', '/d/case-study.html']);
  assert.equal(savePaths('/d/case-study.pdf', (p) => pair.has(p)).html, '/d/case-study.html', 'saving over an earlier pair replaces its page too');
  assert.equal(savePaths('/d/x.pdf', (p) => p !== '/d/x.pdf', () => 7).html, '/d/x 7.html', 'never overwrites, however many copies');
});

test('a case study prepared in the background waits on Ask me until it is opened or put off (owner, 2026-11-04)', async () => {
  // Value: protects=the ready case study stays in front of the owner instead of a toast that leaves after 15 seconds, and leaves once seen; fails_when=ready never waits, opening or Later leaves it waiting, Send or a new one leaves a stale card, or the card is never told; why_new=new behavior; seam=none
  const settle = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
  let changes = 0;
  const { svc } = deps({ onWaitingChange: () => { changes++; } });
  svc.prepare(input);
  assert.equal(svc.status().waiting, undefined, 'nothing waits while it prepares');
  await settle();
  assert.equal(svc.status().waiting, true, 'ready: it waits for the owner');
  assert.equal(changes, 1);
  svc.open(input);
  assert.equal(svc.status().waiting, undefined, 'opening the screen takes it off Ask me');
  assert.equal(changes, 2);
  svc.seen();
  assert.equal(changes, 2, 'nothing to tell twice');

  const later = deps({ onWaitingChange: () => { changes++; } });
  later.svc.prepare(input);
  await settle();
  later.svc.seen();
  assert.equal(later.svc.status().waiting, undefined, 'Later takes it off Ask me');

  const sent = deps();
  sent.svc.prepare(input);
  await settle();
  assert.deepEqual(await sent.svc.send(input, 'ceo', true), { ok: true });
  assert.deepEqual(sent.svc.status(), { state: 'idle' }, 'a sent one waits for nothing');

  const empty = snapshot({ outcomes: [{ kind: 'email', total: 0 }, { kind: 'sent', total: 0 }, { kind: 'task', total: 0 }, { kind: 'check', total: 0 }] });
  const none = deps({ figures: () => ({ snapshot: empty, days: [] }) });
  assert.equal(none.svc.prepare(input).waiting, undefined, 'ready at once, on the screen already: no card');
});
