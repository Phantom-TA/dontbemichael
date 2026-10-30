'use strict';

// The breaker's error storm trip counts api_error log records. Claude Code logs
// a single api_error only after it gives up on a request (the retries in
// between are not logged), and its monitoring docs tell a recovered session
// from a stalled one by a later api_request. A request re-issued after a
// streaming failure starts `attempt` again at 1, so one turn can log several
// api_errors and then succeed. The collector reports that api_request, with its
// query_source, so the breaker can clear the count when the calls that were
// failing got through (breaker.recordApiSuccess); without it an agent that
// recovered, answered in text and went idle was walked up to a stop.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector, TELEMETRY_TOKEN_HEADER } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');

/** One OTLP log record as Claude Code exports it: bare event.name, prefixed body. */
function logBatch(agentId, name, extra = [], querySource = 'repl_main_thread') {
  return {
    resourceLogs: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
      scopeLogs: [{
        logRecords: [{
          body: { stringValue: `claude_code.${name}` },
          attributes: [
            { key: 'event.name', value: { stringValue: name } },
            { key: 'session.id', value: { stringValue: 's1' } },
            { key: 'query_source', value: { stringValue: querySource } },
            ...extra
          ]
        }]
      }]
    }]
  };
}

async function post(endpoint, body, token) {
  const response = await fetch(`${endpoint}/v1/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TELEMETRY_TOKEN_HEADER]: token },
    body: JSON.stringify(body)
  });
  await response.text();
  return response.status;
}

async function started(t) {
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0 });
  await telemetry.start();
  t.after(() => telemetry.stop());
  return { telemetry, endpoint: telemetry.endpoint() };
}

test('an api_request log reports a success, and an api_error does not', async (t) => {
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const successes = [];
  const errors = [];
  telemetry.onApiSuccess((id, source) => successes.push([id, source]));
  telemetry.onApiError((id, source) => errors.push([id, source]));
  assert.equal(await post(endpoint, logBatch('agent-1', 'api_error'), token), 200);
  assert.deepEqual(successes, []);
  assert.deepEqual(errors, [['agent-1', 'repl_main_thread']]);
  assert.equal(await post(endpoint, logBatch('agent-1', 'api_request', [], 'compact'), token), 200);
  assert.deepEqual(successes, [['agent-1', 'compact']], 'each record carries its own query_source');
  assert.deepEqual(errors, [['agent-1', 'repl_main_thread']]);
});

test('a turn that logs several api_errors and then succeeds leaves an idle agent healthy', async (t) => {
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const breaker = new CircuitBreaker(() => ({ enabled: true, hardStop: true, errorStormLimit: 5 }));
  // The same wiring as src/main/index.ts.
  telemetry.onApiError((id, source) => breaker.recordError(id, source));
  telemetry.onApiSuccess((id, source) => breaker.recordApiSuccess(id, source));
  breaker.recordToolUse('agent-1', 'Read', { file: 'x' });
  // Each re-issue after a streaming failure gives up again and logs one
  // api_error, with `attempt` starting again at 1 each time.
  for (let reissue = 1; reissue <= 5; reissue++) {
    await post(endpoint, logBatch('agent-1', 'api_error', [
      { key: 'error', value: { stringValue: 'Overloaded' } },
      { key: 'attempt', value: { intValue: '1' } }
    ]), token);
  }
  await post(endpoint, logBatch('agent-1', 'api_request'), token);
  // The agent answers in text and idles: no tool call follows.
  for (let i = 1; i <= 4; i++) {
    const [d] = breaker.tick([{ agentId: 'agent-1', sample: null, progressing: true }], 1_000_000 + i * 30_000);
    assert.equal(d.state.level, 'healthy', `beat ${i}: ${d.state.reason}`);
  }
});

test('a side call that gets through between main loop errors does not hold the storm off', async (t) => {
  // An outage on the main model only: turn after turn a side call succeeds and
  // the main request gives up. The storm must still trip.
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const breaker = new CircuitBreaker(() => ({ enabled: true, hardStop: true, errorStormLimit: 5 }));
  telemetry.onApiError((id, source) => breaker.recordError(id, source));
  telemetry.onApiSuccess((id, source) => breaker.recordApiSuccess(id, source));
  for (let turn = 1; turn <= 5; turn++) {
    await post(endpoint, logBatch('agent-1', 'api_request', [], 'side_question'), token);
    await post(endpoint, logBatch('agent-1', 'api_error', [{ key: 'error', value: { stringValue: 'Overloaded' } }]), token);
  }
  const [d] = breaker.tick([{ agentId: 'agent-1', sample: null, progressing: true }], 1_000_000);
  assert.equal(d.state.level, 'steering', d.state.reason);
  assert.match(d.state.reason, /error storm: 5/);
});

test('an api_request named only in the body still reports a success', async (t) => {
  // The collector falls back to the body when event.name is missing, and the
  // body carries the claude_code. prefix.
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const successes = [];
  const errors = [];
  telemetry.onApiSuccess((id) => successes.push(id));
  telemetry.onApiError((id) => errors.push(id));
  const batch = {
    resourceLogs: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: 'agent-1' } }] },
      scopeLogs: [{
        logRecords: [{
          body: { stringValue: 'claude_code.api_request' },
          attributes: [{ key: 'session.id', value: { stringValue: 's1' } }]
        }]
      }]
    }]
  };
  assert.equal(await post(endpoint, batch, token), 200);
  assert.deepEqual(successes, ['agent-1']);
  assert.deepEqual(errors, []);
});

test('main subscribes the breaker to api_request successes', () => {
  // The scenarios above copy the wiring; index.ts needs Electron, so pin the source.
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(main, /telemetry\.onApiSuccess\(\(agentId, querySource\) => breaker\.recordApiSuccess\(agentId, querySource\)\);/);
  assert.match(main, /breaker\.recordError\(agentId, querySource, statusCode\)/);
});

test('an api_error passes on its HTTP status, and only a real one', async (t) => {
  // Value: protects=an error storm report names the statuses (overloaded, server error, bad request) that made it; fails_when=status_code is dropped by the attribute allowlist, or a non status value reaches the breaker; why_new=issue 661; seam=none
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const got = [];
  telemetry.onApiError((id, source, status) => got.push(status));
  await post(endpoint, logBatch('agent-1', 'api_error', [{ key: 'status_code', value: { intValue: 529 } }]), token);
  await post(endpoint, logBatch('agent-1', 'api_error', [{ key: 'status_code', value: { stringValue: '500' } }]), token);
  await post(endpoint, logBatch('agent-1', 'api_error', [{ key: 'status_code', value: { stringValue: 'overloaded' } }]), token);
  await post(endpoint, logBatch('agent-1', 'api_error'), token);
  assert.deepEqual(got, [529, 500, undefined, undefined]);
});
