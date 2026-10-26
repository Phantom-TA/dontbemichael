'use strict';

/**
 * An office stop leaves the circuit breaker alone (business-mode-office-packs.md,
 * plan limits: the limit "must never trip the circuit breaker", and while the
 * office is on break "the breaker ignores rate-limit errors").
 *
 * While the account is out of credit, signed out or at its plan limit, every
 * Claude turn is refused, the 15 minute checks' included, and each refusal
 * reaches the breaker as an api_error. Counted, they made an error storm: after
 * about an hour a member with work waiting was held back with Michael told she
 * needs his call, or with "stop at once" her terminal was closed, mid outage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector, TELEMETRY_TOKEN_HEADER } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');
const { OfficeBreak } = loadTs('src/main/officeBreak.ts');
const { countsTowardErrorStorm } = loadTs('src/shared/officeBreak.ts');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

/** An api_error log the way the engine exports it over OTLP. */
function apiError(agentId, status, error) {
  return {
    resourceLogs: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
      scopeLogs: [{ logRecords: [{ attributes: [
        { key: 'event.name', value: { stringValue: 'api_error' } },
        { key: 'session.id', value: { stringValue: `s-${agentId}` } },
        { key: 'status_code', value: { stringValue: String(status) } },
        { key: 'error', value: { stringValue: error } }
      ] }] }]
    }]
  };
}

/** The office as main runs it: telemetry feeds the breaker through the same
 *  rule index.ts uses, and a stopped turn clears that member's count. Kelly
 *  runs on another engine. */
async function office(t, hardStop = false) {
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0 });
  await telemetry.start();
  t.after(() => telemetry.stop());
  const clock = { t: Date.UTC(2026, 9, 21, 14, 0, 0) };
  const store = { s: null, load() { return this.s; }, save(s) { this.s = s; } };
  const stop = new OfficeBreak(store, () => clock.t);
  const breaker = new CircuitBreaker(() => ({ hardStop }));
  const onClaudePlan = (id) => id !== 'kelly';
  telemetry.onApiError((id) => { if (countsTowardErrorStorm(stop.view(), onClaudePlan(id))) breaker.recordError(id); });
  const error = async (id, n = 1) => {
    for (let i = 0; i < n; i++) {
      const res = await fetch(`${telemetry.endpoint()}/v1/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [TELEMETRY_TOKEN_HEADER]: telemetry.tokenFor(id) },
        body: JSON.stringify(apiError(id, 400, 'Credit balance is too low'))
      });
      await res.text();
    }
  };
  const refused = (id) => { stop.limitReached(id, 'credit'); breaker.clearErrors(id); };
  const beat = (id) => breaker.tick([{ agentId: id, sample: null, progressing: false }], clock.t)[0];
  return { clock, stop, breaker, error, refused, beat };
}

test('a stop with checks every 15 minutes never makes an error storm', async (t) => {
  // Value: protects=a member with work waiting is not held back, or with stop at once closed, because the account can't answer; fails_when=refused turns during a stop or a check count toward the storm, or the retries of the turn that hit the stop do; why_new=the design said the breaker ignores the stop's errors and nothing did; seam=the real collector, breaker and office break, wired as index.ts wires them
  const o = await office(t, true);
  // 2:00 pm: Pam's turn fails after the engine retried it, then the stop starts.
  await o.error('pam', 6);
  o.refused('pam');
  const levels = new Set();
  for (let minute = 1; minute <= 120; minute++) {
    o.clock.t += 60_000;
    const r = o.stop.tick();
    // Each check opens delivery, Pam's waiting job wakes her, and it's refused again.
    if (r && r.step === 'check') { await o.error('pam'); o.refused('pam'); }
    levels.add(o.beat('pam').state.level);
  }
  assert.ok(o.stop.view(), 'still out of credit two hours on');
  assert.deepEqual([...levels], ['healthy']);

  // The owner adds credit: the next turn goes through and the stop ends.
  o.stop.ownerRetry();
  assert.ok(o.stop.turnFinished('pam'));
  assert.equal(o.beat('pam').state.level, 'healthy');
  // From here on a real storm trips as before.
  await o.error('pam', 5);
  assert.notEqual(o.beat('pam').state.level, 'healthy');
});

test('a member on another engine still trips on its own errors during a stop', async (t) => {
  // Value: protects=a Codex member's real storm is still caught while the Claude plan is stopped; fails_when=the stop hides every engine's errors; why_new=new rule; seam=the real collector and breaker
  const o = await office(t);
  o.refused('pam');
  await o.error('kelly', 5);
  assert.notEqual(o.beat('kelly').state.level, 'healthy');
});

test('the rule, and main uses it for every api_error and every stopped turn', () => {
  // Value: protects=the wiring the scenarios above copy is the one main runs; fails_when=index.ts feeds the breaker without the rule, or stops clearing the count of a stopped turn; why_new=new rule; seam=source pin, index.ts needs Electron
  const waiting = { until: null, checking: false, reason: 'limit', again: false };
  assert.equal(countsTowardErrorStorm(null, true), true);
  assert.equal(countsTowardErrorStorm(waiting, true), false);
  assert.equal(countsTowardErrorStorm({ ...waiting, checking: true }, true), false, 'a check is refused too');
  assert.equal(countsTowardErrorStorm({ ...waiting, reason: 'signin' }, true), false);
  assert.equal(countsTowardErrorStorm(waiting, false), true, 'another engine keeps working');
  const main = read('src/main/index.ts');
  assert.match(main, /telemetry\.onApiError\(\(agentId\) => \{\n  if \(countsTowardErrorStorm\(officeBreak\.view\(\), onClaudePlan\(agentId\)\)\) breaker\.recordError\(agentId\);\n\}\);/);
  assert.equal((main.match(/breaker\.recordError\(/g) ?? []).length, 1, 'no other way in');
  assert.match(main, /const step = officeBreak\.limitReached\(signal\.agentId, signal\.reason, retry\);[\s\S]{0,250}breaker\.clearErrors\(signal\.agentId\);/);
});
