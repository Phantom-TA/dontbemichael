'use strict';

/**
 * md-mail MCP server (eng review E1, T5): the real script, spawned as a child
 * process, talking to a real IntegrationBroker whose mail handler is a stub.
 * Proves the token rides every call, errors come back as tool errors, and a bad
 * line gets a JSON-RPC error instead of killing the server (F-7).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const SCRIPT = path.resolve(__dirname, '..', 'resources', 'md-mail-mcp.cjs');

function rpc(child) {
  let buf = '';
  const waiting = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); }
    }
  });
  let next = 1;
  return {
    send(method, params) {
      const id = next++;
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    },
    raw(line, id = null) {
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(line + '\n'); });
    }
  };
}

test('md-mail relays tool calls to the broker with the agent token', { timeout: 15_000 }, async (t) => {
  const calls = [];
  const broker = new IntegrationBroker({
    getRecord: () => undefined,
    getSecret: () => undefined,
    mail: async (agentId, op, body) => {
      calls.push({ agentId, op, body });
      if (op === 'send') return { status: 403, body: { error: 'You are Draft only: save the reply as a draft instead.' } };
      return { status: 200, body: { mailboxes: [{ mailbox: 'sales', address: 'sales@x.com' }], sending: 'draft only' } };
    }
  });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty-dwight', [], 'dwight');

  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: broker.url(), MD_BROKER_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const c = rpc(child);

  const init = await c.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'md-mail');
  const list = await c.send('tools/list', {});
  assert.deepEqual(list.result.tools.map((x) => x.name), ['list_mailboxes', 'search', 'read', 'save_attachment', 'archive', 'mark_read', 'mark_junk', 'draft', 'propose', 'send']);

  const ok = await c.send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(ok.result.isError, false);
  assert.match(ok.result.content[0].text, /sales@x.com/);
  assert.equal(calls[0].agentId, 'dwight', 'the broker resolved the token to the agent');

  const refused = await c.send('tools/call', { name: 'send', arguments: { mailbox: 'sales', to: 'a@b.com', subject: 's', body: 'b' } });
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /Draft only/);

  const unknown = await c.send('tools/call', { name: 'delete_everything', arguments: {} });
  assert.equal(unknown.error.code, -32602);

  const bad = await c.raw('{not json');
  assert.equal(bad.error.code, -32700);
  const still = await c.send('tools/list', {});
  assert.ok(still.result.tools.length, 'still answering after a bad line');
});

test('without a broker token every call is a plain tool error, not a crash', { timeout: 15_000 }, async (t) => {
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: '', MD_BROKER_TOKEN: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const c = rpc(child);
  const r = await c.send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /not connected/);
});

test('a token the broker does not know is refused before mail runs', { timeout: 15_000 }, async (t) => {
  let ran = false;
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined, mail: async () => { ran = true; return { status: 200, body: {} }; } });
  await broker.start();
  t.after(() => broker.stop());
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: broker.url(), MD_BROKER_TOKEN: 'forged' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const r = await rpc(child).send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(r.result.isError, true);
  assert.equal(ran, false);
});
