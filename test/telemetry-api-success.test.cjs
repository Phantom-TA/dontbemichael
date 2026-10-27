'use strict';

// The breaker's error storm trip counts api_error log records. Claude Code logs
// a single api_error only after it gives up on a request (the retries in
// between are not logged), and its monitoring docs tell a recovered session
// from a stalled one by a later api_request. A request re-issued after a
// streaming failure starts `attempt` again at 1, so one turn can log several
// api_errors and then succeed. The collector reports that api_request so the
// breaker can clear the count (breaker.clearErrors); without it an agent that
// recovered, answered in text and went idle was walked up to a stop.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector, TELEMETRY_TOKEN_HEADER } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');

/** One OTLP log record as Claude Code exports it: bare event.name, prefixed body. */
function logBatch(agentId, name, extra = []) {
  return {
    resourceLogs: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
      scopeLogs: [{
        logRecords: [{
          body: { stringValue: `claude_code.${name}` },
          attributes: [
            { key: 'event.name', value: { stringValue: name } },
            { key: 'session.id', value: { stringValue: 's1' } },
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
  telemetry.onApiSuccess((id) => successes.push(id));
  telemetry.onApiError((id) => errors.push(id));
  assert.equal(await post(endpoint, logBatch('agent-1', 'api_error'), token), 200);
  assert.deepEqual(successes, []);
  assert.deepEqual(errors, ['agent-1']);
  assert.equal(await post(endpoint, logBatch('agent-1', 'api_request'), token), 200);
  assert.deepEqual(successes, ['agent-1']);
  assert.deepEqual(errors, ['agent-1']);
});

test('a turn that logs several api_errors and then succeeds leaves an idle agent healthy', async (t) => {
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  const breaker = new CircuitBreaker(() => ({ enabled: true, hardStop: true, errorStormLimit: 5 }));
  // The same wiring as src/main/index.ts.
  telemetry.onApiError((id) => breaker.recordError(id));
  telemetry.onApiSuccess((id) => breaker.clearErrors(id));
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
  assert.match(main, /telemetry\.onApiSuccess\(\(agentId\) => breaker\.clearErrors\(agentId\)\);/);
});
