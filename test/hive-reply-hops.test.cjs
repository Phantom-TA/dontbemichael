'use strict';

/**
 * The loop guard counts replies (HIVE.md section 4). PROTOCOL.md tells agents
 * the app fills in `hops`, so they leave it out, and the router used to copy
 * whatever the file said: every message carried 0 and the hop cap could never
 * stop two agents replying to each other. The router now sets it: one more
 * than the message named in `in_reply_to`, 0 for a new message, and 0 for
 * Michael's answers to the owner, whose conversation must never be dropped.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { replyHops } = loadTs('src/shared/handoffRule.ts');

const HOP_CAP = 12;

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-reply-hops-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam-1', name: 'Pam', provider: 'claude', cwd: home });
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home });
  let n = 0;
  /** Drop a message in an agent's outbox and route it, as the router's tick does. */
  const post = (from, msg) => {
    fs.writeFileSync(path.join(home, 'hive', 'agents', from, 'outbox', `m${n++}.json`), JSON.stringify(msg));
    hive.routeOnce();
  };
  const received = (to, subject) => hive.inbox(to).find((m) => m.subject === subject);
  const hopDrops = () => hive.logTail(1000).filter((e) => e.kind === 'drop' && e.reason === 'hop-cap');
  return { hive, post, received, hopDrops };
}

test('replyHops: a reply is one more than what it answers, a new message or an answer to the owner is 0', () => {
  assert.equal(replyHops(null, undefined, false), 0);
  assert.equal(replyHops('', 4, false), 0);
  assert.equal(replyHops(7, 4, false), 0, 'an in_reply_to that is not an id starts a new chain');
  assert.equal(replyHops('m1', 4, false), 5);
  assert.equal(replyHops('m1', undefined, false), 1, 'a message from an earlier run counts as 0');
  assert.equal(replyHops('m1', 40, true), 0, "Michael's answers to the owner are never counted");
});

test('the hop count an agent writes is ignored', async (t) => {
  const { post, received, hopDrops } = await floor(t);
  post('pam-1', { to: 'jim-1', act: 'query', subject: 'where is the invoice', body: '?', hops: 99 });
  const got = received('jim-1', 'where is the invoice');
  assert.ok(got, 'a new message with a made up count is still delivered');
  assert.equal(got.hops, 0);
  assert.equal(hopDrops().length, 0);
});

test('a reply carries one more hop than the message it answers', async (t) => {
  const { post, received } = await floor(t);
  post('god-1', { to: 'pam-1', act: 'request', subject: 'Send the April invoices', body: 'today' });
  const asked = received('pam-1', 'Send the April invoices');
  assert.equal(asked.hops, 0);
  post('pam-1', { to: 'god-1', act: 'done', subject: 'April invoices sent', body: 'sent', in_reply_to: asked.id, hops: 0 });
  assert.equal(received('god-1', 'April invoices sent').hops, 1);
});

test('two agents replying to each other are stopped at the cap, and Michael is told', async (t) => {
  const { post, received, hopDrops } = await floor(t);
  let prev = null;
  for (let i = 0; i <= HOP_CAP + 1; i++) {
    const [from, to] = i % 2 ? ['jim-1', 'pam-1'] : ['pam-1', 'jim-1'];
    const subject = `still checking ${i}`;
    post(from, { to, act: 'query', subject, body: 'can you check again?', ...(prev ? { in_reply_to: prev.id } : {}) });
    const got = received(to, subject);
    if (i <= HOP_CAP) {
      assert.ok(got, `turn ${i} is delivered`);
      assert.equal(got.hops, i);
      prev = got;
    } else {
      assert.equal(got, undefined, 'the reply past the cap is not delivered');
    }
  }
  assert.equal(hopDrops().length, 1);
  assert.ok(
    received('god-1', `Dropped a message going in circles: still checking ${HOP_CAP + 1}`),
    'Michael hears about the drop'
  );
});

test("Michael's answer to the owner is never dropped, however long the thread behind it", async (t) => {
  const { hive, post, received, hopDrops } = await floor(t);
  let prev = null;
  for (let i = 0; i <= HOP_CAP; i++) {
    const [from, to] = i % 2 ? ['pam-1', 'god-1'] : ['god-1', 'pam-1'];
    const subject = `refund detail ${i}`;
    post(from, { to, act: 'query', subject, body: 'one more detail', ...(prev ? { in_reply_to: prev.id } : {}) });
    prev = received(to === 'god-1' ? 'god-1' : 'pam-1', subject);
    assert.equal(prev.hops, i);
  }
  post('god-1', { to: 'human', act: 'inform', subject: 'Refund for Northwind Cafe', body: 'Done.', in_reply_to: prev.id });
  assert.equal(hopDrops().length, 0);
  const toOwner = hive.logTail(1000).filter((e) => e.kind === 'message' && e.subject === 'Refund for Northwind Cafe');
  assert.equal(toOwner.length, 1, 'the answer is routed to the owner');
});
