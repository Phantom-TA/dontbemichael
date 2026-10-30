'use strict';

/**
 * The Slack server binds its port, then opens a tunnel. When the tunnel failed
 * the port stayed bound, but the caller drops the instance on any ok:false, so
 * nothing could close it and the next try could not bind the port. A tunnel
 * failure now closes the server again.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const { createHmac } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

const { SlackWebhookServer, SlackReplyServer } = loadTs('src/main/slack.ts');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

test('a tunnel failure frees the port, so the next start can bind it again', async () => {
  const port = await freePort();
  const make = () => {
    const server = new SlackWebhookServer({ port, signingSecret: 'secret', onMessage() {} });
    server.openTunnel = async () => { throw new Error('offline'); };
    return server;
  };
  const first = await make().start();
  assert.equal(first.ok, false);
  assert.match(first.error, /^tunnel unavailable: offline/);
  const second = await make().start();
  assert.match(second.error, /^tunnel unavailable/, 'the port was free for the second server');
});

/**
 * Stop must also cut off a connection that is already open. `server.close()`
 * only refuses new ones; a kept-alive socket that is busy at stop time stays
 * open, and before the fix the stopped instance kept acting on every request it
 * carried. Each case sends half a body, stops the server once the request has
 * arrived, then sends the rest, and then tries again on the same agent.
 */
function keepAliveCaller(t, port) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => agent.destroy());
  return (path, headers, body, beforeEnd) => new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST', agent,
      headers: { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', (e) => resolve(e.code));
    if (!beforeEnd) { req.end(body); return; }
    const half = Math.floor(body.length / 2);
    req.write(body.slice(0, half));
    beforeEnd().then(() => req.end(body.slice(half)));
  });
}

test('a stopped Slack event server does not act on a request still open on a kept-alive connection', async (t) => {
  // Value: protects=stopping Slack really stops taking messages under the old signing secret; fails_when=stop() only closes the listener and the open keep-alive socket keeps reaching onMessage; why_new=a busy socket outlived server.close(); seam=none
  const SECRET = 'signing-secret';
  const messages = [];
  const server = new SlackWebhookServer({ port: 0, signingSecret: SECRET, onMessage: (m) => { messages.push(m); } });
  await server.listen(); // the bind alone: start() would open a real tunnel
  const bound = server.server;
  t.after(() => { bound.close(); bound.closeAllConnections?.(); });
  const send = keepAliveCaller(t, bound.address().port);
  const signed = (event) => {
    const body = JSON.stringify({ type: 'event_callback', authorizations: [{ user_id: 'UBOT' }], event });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
    return { headers: { 'x-slack-signature': sig, 'x-slack-request-timestamp': ts }, body };
  };

  const one = signed({ type: 'app_mention', channel: 'C1', text: '<@UBOT> in flight at stop', ts: '1.1' });
  const first = await send('/', one.headers, one.body, async () => {
    await new Promise((resolve) => bound.once('request', resolve));
    server.stop();
  });
  assert.equal(first, 503, 'a body that finished after stop is refused, not delivered');
  const two = signed({ type: 'app_mention', channel: 'C1', text: '<@UBOT> after stop', ts: '1.2' });
  assert.notEqual(await send('/', two.headers, two.body), 200);
  assert.equal(messages.length, 0, 'nothing reached onMessage after stop');
});

test('a stopped Slack reply endpoint does not act on a request still open on a kept-alive connection', async (t) => {
  // Value: protects=the loopback reply endpoint stops posting with the bot token once stopped; fails_when=stop() only closes the listener and the open keep-alive socket still reads the bot token; why_new=same shape as the event server; seam=none
  let tokenReads = 0;
  const server = new SlackReplyServer({ token: 'reply-token', getBotToken: () => { tokenReads++; return undefined; } });
  const started = await server.start(0);
  const bound = server.server;
  t.after(() => { bound.close(); bound.closeAllConnections?.(); });
  const send = keepAliveCaller(t, started.port);
  const body = JSON.stringify({ channel: 'C1', thread_ts: '1.1', text: 'done' });

  const first = await send('/reply', { 'x-md-reply-token': 'reply-token' }, body, async () => {
    await new Promise((resolve) => bound.once('request', resolve));
    server.stop();
  });
  assert.equal(first, 503);
  assert.notEqual(await send('/reply', { 'x-md-reply-token': 'reply-token' }, body), 200);
  assert.equal(tokenReads, 0, 'the stopped endpoint never went on to read the bot token');
});
