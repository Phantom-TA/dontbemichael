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
    missions: () => [{ to: 'pam', label: 'Morning inbox', enabled: true }, { to: 'pam', label: 'Old job', enabled: false }],
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
const edits = { headline: { figure: 'email', before: 'Harbor Bakery handled', after: 'emails' }, subtitle: 's', about: 'a', quote: '', team: {}, why: 'w' };

test('the screen input is checked, and the last 30 days end today', () => {
  assert.equal(caseInput({ lang: 'fr', period: 'last-30' }), null);
  assert.deepEqual(caseInput({ lang: 'ar', period: 'this-month', showName: false }), { lang: 'ar', period: 'this-month', showName: false });
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
  assert.deepEqual(await svc.send(input, edits, 'ceo', true), { ok: false, kind: 'no-work' });
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
  assert.deepEqual(await svc.send(input, edits, 'ceo', true), { ok: true });
  assert.equal(calls.sends[0].mailbox, 'ceo');
  assert.equal(calls.sends[0].input.to, 'hello@dontbemichael.com');
  assert.equal(calls.sends[0].input.files[0].filename, 'case-study.pdf');
  assert.match(calls.sends[0].input.body, /will take it down if I ask/);
  const line = calls.log.find((e) => e.kind === 'case-study-sent');
  assert.equal(line.agentId, undefined);
  assert.equal(line.text, "You sent a case study to Don't Be Michael");
  assert.equal(calls.invite, 1);
  // Pulse counts a member's 'mail-sent'; the owner's line is never one.
  assert.deepEqual(logPoints([{ ...line, ts: NOW }], 0, NOW + 1, new Set(['pam'])), []);
});

test('Send refuses without the tick, from a mailbox that cannot send, or with a typed number in the headline', async () => {
  const { svc, calls } = deps();
  assert.deepEqual(await svc.send(input, edits, 'ceo', false), { ok: false, kind: 'no-permission' });
  assert.deepEqual(await svc.send(input, edits, 'old', true), { ok: false, kind: 'no-mailbox' });
  assert.deepEqual(await svc.send(input, { ...edits, headline: { figure: 'email', before: 'Saved 20 hours and handled', after: 'emails' } }, 'ceo', true), { ok: false, kind: 'headline-number' });
  assert.equal(calls.sends.length, 0);
  assert.equal(calls.invite, 0);
});

test('a timeout or an interrupted send may have gone out; a refusal shows the mailbox reason', async () => {
  const fail = (err) => deps({ mailSend: async () => { throw err; } }).svc.send(input, edits, 'ceo', true);
  assert.deepEqual(await fail(new MailError('timeout', 'This email may already have gone out ... tell Michael', true)), { ok: false, kind: 'maybe-sent' });
  assert.deepEqual(await fail(new MailError('refused', 'This email may already have gone out ... tell Michael', false, true)), { ok: false, kind: 'maybe-sent' });
  assert.deepEqual(await fail(new MailError('auth', 'Not sent. The password was not accepted.')), { ok: false, kind: 'failed', reason: 'The password was not accepted.' });
  const broken = deps({ makePdf: async () => ({ ok: false, reason: 'failed' }) });
  assert.deepEqual(await broken.svc.send(input, edits, 'ceo', true), { ok: false, kind: 'failed', reason: '' });
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
  assert.deepEqual(await svc.send(input, edits, 'ceo', true), { ok: true });
  assert.deepEqual(svc.status(), { state: 'idle' });
});

test('the headline is a drafted choice only: words sent from the screen are replaced by main\'s own (D24)', async () => {
  let page = '';
  const { svc } = deps({
    runModel: async () => ({ ok: true, text: JSON.stringify({ subtitle: "A bakery on Don't Be Michael", about: 'Bakes bread', why: "Don't Be Michael frees the owner", headlines: { email: 'Harbor Bakery handled {n} emails', task: 'Harbor Bakery finished {n} tasks', away: 'Harbor Bakery worked {n} hours while the owner was away' }, team: { pam: 'Sorts the inbox', god: 'Routes the work' } }) }),
    makePdf: async (html) => { page = html; return { ok: true, pdf: Buffer.from('%PDF') }; }
  });
  svc.prepare(input);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const fudged = { ...edits, headline: { figure: 'task', before: 'Saved the owner a fortune and finished', after: 'tasks overnight' } };
  assert.deepEqual(await svc.send(input, fudged, 'ceo', true), { ok: true });
  assert.match(page, /<span>Harbor Bakery finished<\/span> <span class="lock"[^>]*>96<\/span> <span>tasks<\/span>/);
  assert.doesNotMatch(page, /fortune|overnight/);
});
