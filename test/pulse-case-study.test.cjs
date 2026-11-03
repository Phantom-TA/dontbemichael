'use strict';
/**
 * Pulse's case study entry (docs/designs/case-study.md, eng A1, A6, DS3)
 * against a real harness.db: figures for a day span equal what Pulse shows for
 * that span, the away strip sums running points by their own local day, and
 * the invitation counts days with an outcome and stays gone once dismissed.
 * better-sqlite3 is built for Electron, so this reruns under Electron's Node.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (!process.env.PULSE_UNDER_ELECTRON) {
  let bin = null;
  try { bin = require('electron'); } catch { bin = null; }
  const ok = typeof bin === 'string' && fs.existsSync(bin);
  test('pulse case study (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PULSE_UNDER_ELECTRON: '1' };
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
const { TelemetryStore } = loadTs('src/main/telemetryStore.ts');
const { TelemetryProcessor } = loadTs('src/main/telemetryProcessor.ts');
const { PulseService, CASE_STUDY_INVITE_DAYS } = loadTs('src/main/pulse.ts');
const { dayKey } = loadTs('src/shared/teamPerformance.ts');

function setup(t, office = '/office') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-case-'));
  const persist = new PersistStore(path.join(dir, 'harness.db'));
  persist.open();
  t.after(() => { persist.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  let now = new Date(2026, 10, 3, 12).getTime();
  let current = office;
  const clock = () => now;
  const store = new TelemetryStore(() => persist.database(), () => current, clock);
  const proc = new TelemetryProcessor(() => persist.database(), store, clock);
  const svc = new PulseService({
    db: () => persist.database(), store, processor: proc, office: () => current,
    members: () => [{ id: 'pam', isGod: false }, { id: 'god', isGod: true }], godId: () => 'god', tasks: () => [],
    missions: () => [], models: () => [], ladder: () => [], priceOf: () => undefined,
    applyMissions: () => ({ ok: true }), billing: () => 'apiKey', plan: () => null, memory: () => ({ notes: [], procedures: {} }), now: clock
  });
  const db = persist.database();
  const day = (agent, d, cols) => db.prepare('INSERT INTO telemetry_daily (office, agent_id, day, usd, emails, sent, tasks, checks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(current, agent, d, cols.usd ?? 0, cols.emails ?? 0, cols.sent ?? 0, cols.tasks ?? 0, cols.checks ?? 0);
  const running = (ts, ms, away) => db.prepare("INSERT INTO telemetry_events (office, agent_id, kind, ts, value, attrs) VALUES (?, NULL, 'running', ?, ?, ?)").run(current, ts, ms, JSON.stringify({ away }));
  return { svc, db, day, running, setOffice: (o) => { current = o; } };
}

const span = (from, to) => ({ from, to, fromMs: new Date(`${from}T00:00:00`).getTime(), toMs: new Date(`${to}T23:59:59.999`).getTime() });
const H = 3_600_000;

test('figures for a span are the ones Pulse measures for it, per kind, members summing to the band', (t) => {
  // Value: protects=the case study shows Pulse's own numbers (D4); fails_when=the range entry counts differently from the tiles or a member's kind; why_new=new range entry (P15); seam=none; no_claim=plan scaled spend (an API key here)
  const { svc, day } = setup(t);
  day('pam', '2026-10-10', { emails: 40, sent: 3, usd: 2.5 });
  day('pam', '2026-10-20', { emails: 10, tasks: 4, usd: 1.5 });
  day('god', '2026-10-20', { tasks: 2, usd: 1 });
  day('pam', '2026-09-01', { emails: 999 });
  const r = svc.caseStudyFigures(span('2026-10-04', '2026-11-02'));
  const total = (k) => r.snapshot.outcomes.find((o) => o.kind === k).total;
  assert.equal(total('email'), 50, 'a day before the span is left out');
  assert.equal(total('task'), 6);
  assert.equal(r.snapshot.totalUsd, 5);
  for (const k of ['email', 'sent', 'task']) {
    assert.equal(r.snapshot.members.reduce((s, m) => s + m.counts[k], 0), total(k), `members sum to the band for ${k}`);
  }
  assert.equal(r.days.length, 30, 'one entry per local day of the span');
});

test('the strip sums running points by their own local day, a point at 23:59:59.999 included', (t) => {
  // Value: protects=D18 bars match the hours; fails_when=a point is put on the next day or counted twice; why_new=new per day sum; seam=none; no_claim=DST days (dates are built from local midnights)
  const { svc, running } = setup(t);
  const lastMs = new Date(2026, 9, 10, 23, 59, 59, 999).getTime();
  running(lastMs, 2 * H, H);
  running(new Date(2026, 9, 11, 8).getTime(), 3 * H, 0);
  running(new Date(2026, 9, 1, 8).getTime(), 5 * H, 5 * H);
  const r = svc.caseStudyFigures(span('2026-10-04', '2026-11-02'));
  const d10 = r.days.find((d) => d.day === '2026-10-10');
  const d11 = r.days.find((d) => d.day === '2026-10-11');
  assert.deepEqual([d10.ms, d10.awayMs, d11.ms, d11.awayMs], [2 * H, H, 3 * H, 0]);
  assert.equal(r.days.reduce((s, d) => s + d.ms, 0), r.snapshot.running.ms, 'the bars add up to the hours the band and strip name');
  assert.equal(dayKey(lastMs), '2026-10-10');
});

test('the invitation shows after 30 days with an outcome, not days with other activity, per office, never after dismiss', (t) => {
  // Value: protects=D7 one time nudge, per office (eng A1, OE2); fails_when=the flag lives in office.json, days without outcomes count, or one office hides another's; why_new=new invite; seam=none; no_claim=the Pulse view's drawing of it
  const { svc, day, db, setOffice } = setup(t);
  for (let i = 0; i < CASE_STUDY_INVITE_DAYS - 1; i++) day('pam', dayKey(new Date(2026, 8, 1 + i).getTime()), { emails: 1 });
  day('pam', '2026-10-30', { usd: 3 });
  assert.equal(svc.caseStudyInvite('/office'), false, '29 outcome days and a day with only cost');
  day('god', '2026-10-31', { checks: 1 });
  assert.equal(svc.caseStudyInvite('/office'), true);
  assert.equal(svc.snapshot('this-week').caseStudyInvite, true);
  assert.equal(svc.caseStudyInviteDone(), true);
  assert.equal(svc.caseStudyInvite('/office'), false, 'dismissed stays dismissed');
  setOffice('/other');
  for (let i = 0; i < CASE_STUDY_INVITE_DAYS; i++) day('pam', dayKey(new Date(2026, 8, 1 + i).getTime()), { tasks: 1 });
  assert.equal(svc.caseStudyInvite('/other'), true, "one office's dismiss doesn't hide another's");
  assert.ok(db.prepare("SELECT 1 FROM telemetry_dismissed WHERE office = '/office' AND advice_id = 'case-study-invite'").get());
});
