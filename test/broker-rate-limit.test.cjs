'use strict';

// A connected app that rate limits is not hammered (TODOS: "Third-party
// rate-limit backoff in the broker"): after a 429, a 503 with Retry-After, or a
// 403 that says it is a rate limit (GitHub), the broker holds calls to that app
// until its time is up, and answers at once when the wait is long. Runs the
// real broker in front of a local server.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { backoffMs, ConnectionThrottle, DEFAULT_BACKOFF_MS, BACKOFF_CAP_MS } = loadTs('src/main/brokerThrottle.ts');

const NOW = Date.UTC(2026, 9, 14, 9, 0, 0);
const h = (o) => new Headers(o);

test('the wait comes from Retry-After, then the reset headers, within sane bounds', () => {
  assert.equal(backoffMs(429, h({ 'retry-after': '7' }), NOW), 7000);
  assert.equal(backoffMs(429, h({ 'retry-after': new Date(NOW + 90_000).toUTCString() }), NOW), 90_000);
  assert.equal(backoffMs(429, h({ 'ratelimit-reset': '12' }), NOW), 12_000);
  assert.equal(backoffMs(429, h({ 'x-ratelimit-reset': String(NOW / 1000 + 45) }), NOW), 45_000, 'a Unix time');
  assert.equal(backoffMs(429, h({}), NOW), DEFAULT_BACKOFF_MS, 'a 429 that names no time');
  assert.equal(backoffMs(503, h({ 'retry-after': '5' }), NOW), 5000);
  assert.equal(backoffMs(503, h({}), NOW), undefined, 'an outage, not a limit');
  assert.equal(backoffMs(200, h({ 'retry-after': '5' }), NOW), undefined);
  assert.equal(backoffMs(429, h({ 'retry-after': '86400' }), NOW), BACKOFF_CAP_MS);
  assert.equal(backoffMs(429, h({ 'retry-after': '0' }), NOW), 1000);
});

test('a 403 that is a rate limit waits like a 429; a 403 that is a refusal does not', () => {
  // GitHub's primary limit: 403, nothing left, reset as a Unix time.
  const primary = { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 600) };
  assert.equal(backoffMs(403, h(primary), NOW), 600_000);
  // GitHub's secondary limit: 403 with Retry-After.
  assert.equal(backoffMs(403, h({ 'retry-after': '60', 'x-ratelimit-remaining': '4321' }), NOW), 60_000);
  // Nothing left but no reset named: the default wait.
  assert.equal(backoffMs(403, h({ 'ratelimit-remaining': '0' }), NOW), DEFAULT_BACKOFF_MS);
  // A missing scope or a private repo: answered as it is, no wait.
  assert.equal(backoffMs(403, h({}), NOW), undefined);
  assert.equal(backoffMs(403, h({ 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(NOW / 1000 + 600) }), NOW), undefined);
});

test('each app has its own wait, and a later limit never shortens it', () => {
  let now = NOW;
  const th = new ConnectionThrottle(() => now);
  th.note('books', 429, h({ 'retry-after': '60' }));
  th.note('books', 429, h({ 'retry-after': '5' }));
  assert.equal(th.waitFor('books'), 60_000);
  assert.equal(th.waitFor('crm'), 0);
  now += 60_000;
  assert.equal(th.waitFor('books'), 0);
});

async function office(t, answers) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url, at: Date.now() });
    const [status, headers] = answers(seen.length);
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify({ n: seen.length }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const record = (id) => ({ id, label: id === 'books' ? 'Books' : 'CRM', kind: 'custom-rest', baseUrl: base, authType: 'none', enabled: true });
  const b = new IntegrationBroker({ getRecord: (id) => (id === 'books' || id === 'crm' ? record(id) : undefined), getSecret: () => undefined });
  await b.start();
  t.after(() => b.stop());
  const token = b.grant('pty-pam', ['books', 'crm'], 'pam');
  const call = (id, p) => fetch(`${b.url()}/i/${id}/${p}`, { headers: { authorization: `Bearer ${token}` } });
  return { seen, call };
}

test('a short wait is held in the broker, then the call goes through', async (t) => {
  const app = await office(t, (n) => (n === 1 ? [429, { 'retry-after': '1' }] : [200, {}]));
  const first = await app.call('books', 'invoices');
  assert.equal(first.status, 429, 'the app\'s own answer reaches the agent');
  assert.equal(first.headers.get('retry-after'), '1');
  const t0 = Date.now();
  const second = await app.call('books', 'invoices');
  assert.equal(second.status, 200);
  assert.ok(Date.now() - t0 >= 800, 'held until the app\'s time was up');
  assert.equal(app.seen.length, 2);
  assert.ok(app.seen[1].at - app.seen[0].at >= 800, 'the app was not called again early');
});

test('a long wait is answered at once, without calling the app, and other apps are not held', async (t) => {
  const app = await office(t, (n) => (n === 1 ? [429, { 'retry-after': '120' }] : [200, {}]));
  await app.call('books', 'invoices');
  const t0 = Date.now();
  const held = await app.call('books', 'invoices');
  assert.ok(Date.now() - t0 < 1000, 'answered now');
  assert.equal(held.status, 429);
  const retry = Number(held.headers.get('retry-after'));
  assert.ok(retry > 100 && retry <= 120, `retry-after ${retry}`);
  assert.deepEqual(await held.json(), { error: `Books asked the app to slow down. Try again in ${retry} seconds.`, code: 'rate_limited' });
  assert.equal(app.seen.length, 1, 'the app saw one call');
  assert.equal((await app.call('crm', 'contacts')).status, 200, 'another app is called as normal');
});

test('GitHub\'s 403 for an exhausted limit holds the next call; a 403 refusal does not', async (t) => {
  const reset = String(Math.floor(Date.now() / 1000) + 300);
  const app = await office(t, (n) => (n === 1
    ? [403, { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }]
    : [403, {}]));
  const first = await app.call('books', 'repos/acme/shop/issues');
  assert.equal(first.status, 403, 'the app\'s own answer reaches the agent');
  const held = await app.call('books', 'repos/acme/shop/issues');
  assert.equal(held.status, 429, 'answered by the broker until the reset');
  const retry = Number(held.headers.get('retry-after'));
  assert.ok(retry > 250 && retry <= 300, `retry-after ${retry}`);
  assert.equal(app.seen.length, 1, 'GitHub saw one call');

  // A plain 403 (a missing scope) is passed back, and the next call still goes out.
  assert.equal((await app.call('crm', 'private')).status, 403);
  assert.equal((await app.call('crm', 'private')).status, 403);
  assert.equal(app.seen.length, 3, 'both calls reached the app');
});
