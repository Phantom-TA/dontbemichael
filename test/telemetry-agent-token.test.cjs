'use strict';

// The telemetry collector (src/main/telemetry.ts) feeds the cost cap, so usage
// must come from the agent it is counted for. Each agent's exporter sends its
// own token (hive.ts sets OTEL_EXPORTER_OTLP_HEADERS); a batch without one is
// refused, and a batch only ever counts for the agent whose token sent it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector, TELEMETRY_TOKEN_HEADER } = loadTs('src/main/telemetry.ts');

function outputBatch(agentId, sessionId, output) {
  return {
    resourceMetrics: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
      scopeMetrics: [{
        metrics: [{
          name: 'claude_code.token.usage',
          sum: {
            dataPoints: [{
              asInt: String(output),
              attributes: [
                { key: 'session.id', value: { stringValue: sessionId } },
                { key: 'type', value: { stringValue: 'output' } }
              ]
            }]
          }
        }]
      }]
    }]
  };
}

async function post(endpoint, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token !== undefined) headers[TELEMETRY_TOKEN_HEADER] = token;
  const response = await fetch(`${endpoint}/v1/metrics`, { method: 'POST', headers, body: JSON.stringify(body) });
  await response.text();
  return response.status;
}

async function started(t) {
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0 });
  await telemetry.start();
  t.after(() => telemetry.stop());
  return { telemetry, endpoint: telemetry.endpoint() };
}

test('a batch without a token, or with an unknown one, is refused and not counted', async (t) => {
  const { telemetry, endpoint } = await started(t);
  telemetry.tokenFor('agent-1');
  assert.equal(await post(endpoint, outputBatch('agent-1', 's1', 900)), 401);
  assert.equal(await post(endpoint, outputBatch('agent-1', 's1', 900), 'not-a-token'), 401);
  assert.equal(telemetry.getAgentUsage('agent-1'), null);
});

test("an agent's token cannot report usage for another agent", async (t) => {
  const { telemetry, endpoint } = await started(t);
  const pete = telemetry.tokenFor('pete');
  telemetry.tokenFor('agent-2');
  assert.equal(await post(endpoint, outputBatch('agent-2', 's2', 5000), pete), 200);
  assert.equal(telemetry.getAgentUsage('agent-2'), null);
});

test("an agent cannot add to another agent's session by reusing its id", async (t) => {
  const { telemetry, endpoint } = await started(t);
  const one = telemetry.tokenFor('agent-1');
  const two = telemetry.tokenFor('agent-2');
  await post(endpoint, outputBatch('agent-1', 'shared', 100), one);
  await post(endpoint, outputBatch('agent-2', 'shared', 5000), two);
  assert.equal(telemetry.getAgentUsage('agent-1').output, 100);
  assert.equal(telemetry.getAgentUsage('agent-2'), null);
});

test('a negative value cannot lower what an agent has spent', async (t) => {
  const { telemetry, endpoint } = await started(t);
  const token = telemetry.tokenFor('agent-1');
  await post(endpoint, outputBatch('agent-1', 's1', 900), token);
  await post(endpoint, outputBatch('agent-1', 's1', -800), token);
  assert.equal(telemetry.getAgentUsage('agent-1').output, 900);
});

test('each agent keeps one token for the life of the collector', () => {
  const telemetry = new TelemetryCollector();
  assert.equal(telemetry.tokenFor('agent-1'), telemetry.tokenFor('agent-1'));
  assert.notEqual(telemetry.tokenFor('agent-1'), telemetry.tokenFor('agent-2'));
});

test("spawned agents' exporters send their token", () => {
  const hive = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hive.ts'), 'utf8');
  assert.match(hive, /env\.OTEL_EXPORTER_OTLP_HEADERS = `\$\{TELEMETRY_TOKEN_HEADER\}=\$\{this\._otelToken\(meta\.id\)\}`/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  assert.match(index, /hive\.setOtelEndpoint\(r\.endpoint, \(agentId\) => telemetry\.tokenFor\(agentId\)\)/);
});

// Read OTEL_RESOURCE_ATTRIBUTES the way the engine documents it: a value holding
// a space, comma, semicolon, quote or backslash drops every key, with no error;
// otherwise each value is percent decoded.
function engineResource(env) {
  const pairs = env.split(',').map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]);
  if (pairs.some(([k, v]) => !k || !/^[\x21-\x7e]*$/.test(v) || /["\\;]/.test(v))) return [];
  return pairs.map(([k, v]) => ({ key: k, value: { stringValue: decodeURIComponent(v) } }));
}

test('a member whose name has a space or a comma still counts', async (t) => {
  // Value: protects=Pulse and the cost ledger for a member named "Jim 2" or "Sales, East"; fails_when=the raw name goes into OTEL_RESOURCE_ATTRIBUTES and the exporter drops agent.id; why_new=bug fix; seam=the engine's documented reading of the variable; no_claim=the engine itself
  // The line hive.ts spawns the engine with, run as it is written.
  const hive = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hive.ts'), 'utf8');
  const line = hive.match(/env\.OTEL_RESOURCE_ATTRIBUTES = (`[^`\n]+`);/);
  assert.ok(line, 'hive.ts sets OTEL_RESOURCE_ATTRIBUTES');
  const resourceEnv = new Function('meta', `return ${line[1]};`);
  const { telemetry, endpoint } = await started(t);
  for (const [id, name] of [['agent-jim2', 'Jim 2'], ['agent-east', 'Sales, East'], ['agent-zoe', 'Zoë "Ops"; back\\office']]) {
    const env = resourceEnv({ id, name });
    const resource = engineResource(env);
    assert.deepEqual(resource.map((a) => [a.key, a.value.stringValue]), [['agent.id', id], ['agent.name', name]], env);
    const batch = outputBatch(id, `s-${id}`, 700);
    batch.resourceMetrics[0].resource.attributes = resource;
    assert.equal(await post(endpoint, batch, telemetry.tokenFor(id)), 200);
    assert.equal(telemetry.getAgentUsage(id)?.output, 700, `${name} is counted`);
  }
});
