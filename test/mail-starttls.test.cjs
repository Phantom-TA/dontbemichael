'use strict';

/**
 * A mail server that isn't encrypted from the first byte (`secure: false`,
 * STARTTLS in MailServer) must switch to TLS before the login. Both libraries
 * only try STARTTLS when the server offers it, so without the options in
 * mail.ts a server that doesn't offer it, or someone on the network who removes
 * the offer, gets the password in the clear (review of PR 574, 2026-10-25).
 *
 * Real ImapFlow and nodemailer clients talk to fake servers on this machine
 * that never offer STARTTLS. A control run without the option shows the fake
 * server would have received the login, so each check can fail.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const loadTs = require('./load-ts.cjs');

const { imapOptions, smtpOptions, classifyMailError } = loadTs('src/main/mail.ts');

const PASS = 'app-password-123';

/** A line based server on a free local port; `reply` answers each line. */
async function fakeServer(greeting, reply) {
  const lines = [];
  const sockets = new Set();
  const srv = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    let buf = '';
    sock.write(greeting);
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        const out = reply(line);
        if (out) sock.write(out);
      }
    });
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const close = () => { for (const s of sockets) s.destroy(); return new Promise((resolve) => srv.close(resolve)); };
  return { port: srv.address().port, lines, close };
}

const sawPassword = (lines) => lines.some((l) => l.includes(PASS) || l.includes(Buffer.from(`\0me@x.test\0${PASS}`).toString('base64')));

function smtpServer() {
  let inData = false;
  return fakeServer('220 fake ESMTP\r\n', (line) => {
    if (inData) { if (line === '.') { inData = false; return '250 queued\r\n'; } return ''; }
    const verb = line.split(' ')[0].toUpperCase();
    if (verb === 'EHLO') return '250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n';
    if (verb === 'STARTTLS') return '502 not supported\r\n';
    if (verb === 'AUTH') return '235 ok\r\n';
    if (verb === 'DATA') { inData = true; return '354 go\r\n'; }
    if (verb === 'QUIT') return '221 bye\r\n';
    return '250 ok\r\n';
  });
}

function imapServer() {
  let pending = null;
  return fakeServer('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] ready\r\n', (line) => {
    // The base64 answer to an AUTHENTICATE continuation has no tag of its own.
    if (pending) { const tag = pending; pending = null; return `${tag} OK in\r\n`; }
    const [tag, cmd = ''] = line.split(' ');
    const c = cmd.toUpperCase();
    if (c === 'CAPABILITY') return `* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK done\r\n`;
    if (c === 'STARTTLS') return `${tag} BAD not supported\r\n`;
    if (c === 'AUTHENTICATE') { if (line.split(' ').length > 3) return `${tag} OK in\r\n`; pending = tag; return '+ \r\n'; }
    if (c === 'LOGOUT') return `* BYE\r\n${tag} OK bye\r\n`;
    return `${tag} OK done\r\n`;
  });
}

test('an outgoing server without encryption from the start never gets the password before STARTTLS', async (t) => {
  // Value: protects=the app password on a STARTTLS (587) server; fails_when=requireTLS is dropped and nodemailer logs in on a server that never offered STARTTLS; why_new=PR 574 review found secure false meant "STARTTLS if offered"; seam=a fake SMTP server on this machine; no_claim=a real TLS upgrade (the fake server refuses STARTTLS)
  const srv = await smtpServer();
  t.after(srv.close);
  const server = { host: '127.0.0.1', port: srv.port, secure: false };
  const send = (opts) => nodemailer.createTransport(opts).sendMail({ from: 'me@x.test', to: 'you@x.test', text: 'hi' });

  const refused = await send(smtpOptions(server, 'me@x.test', PASS)).then(() => null, (e) => e);
  assert.ok(refused, 'the send stops when STARTTLS is not possible');
  assert.equal(classifyMailError(refused).kind, 'unsupported', 'the owner reads why, in plain words, not the library\'s text');
  assert.ok(srv.lines.some((l) => /^STARTTLS/i.test(l)), 'STARTTLS was asked for although the server never offered it');
  assert.ok(!srv.lines.some((l) => /^AUTH/i.test(l)) && !sawPassword(srv.lines), 'no login reached the server');

  // Control: without the option the same server gets the login in the clear.
  srv.lines.length = 0;
  await send({ ...smtpOptions(server, 'me@x.test', PASS), requireTLS: false });
  assert.ok(srv.lines.some((l) => /^AUTH/i.test(l)) && sawPassword(srv.lines), 'the fake server takes the password in the clear when nothing requires TLS');

  assert.equal(smtpOptions({ ...server, secure: true }, 'me@x.test', PASS).requireTLS, false, 'TLS from the first byte needs no STARTTLS');
});

test('an incoming server without encryption from the start never gets the password before STARTTLS', async (t) => {
  // Value: protects=the app password on a STARTTLS (143) IMAP server; fails_when=doSTARTTLS is dropped and ImapFlow logs in on a server that never offered STARTTLS, or doSTARTTLS is set next to secure (ImapFlow refuses that pair); why_new=PR 574 review; seam=a fake IMAP server on this machine; no_claim=a real TLS upgrade
  const srv = await imapServer();
  t.after(srv.close);
  const server = { host: '127.0.0.1', port: srv.port, secure: false };
  const login = async (opts) => {
    const c = new ImapFlow(opts);
    c.on('error', () => {});
    try { await c.connect(); await c.logout(); } finally { c.close(); }
  };

  const refused = await login(imapOptions(server, 'me@x.test', PASS)).then(() => null, (e) => e);
  assert.ok(refused, 'the login stops when STARTTLS is not possible');
  assert.equal(classifyMailError(refused).kind, 'unsupported', 'the owner reads why, in plain words, not the library\'s text');
  assert.match(classifyMailError(refused).message, /doesn't offer encryption on this port/);
  // imapflow marks every failed upgrade tlsFailed; nodemailer calls them all ETLS. A certificate or a slow handshake is not "no encryption".
  for (const e of [Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT', tlsFailed: true }), Object.assign(new Error('TLS upgrade timed out'), { code: 'UPGRADE_TIMEOUT', tlsFailed: true }), Object.assign(new Error('Error initiating TLS - self signed certificate'), { code: 'ETLS' })]) {
    assert.notEqual(classifyMailError(e).kind, 'unsupported', e.message);
  }
  assert.ok(!srv.lines.some((l) => / (LOGIN|AUTHENTICATE)\b/i.test(l)) && !sawPassword(srv.lines), 'no login reached the server');

  // Control: without the option the same server gets the login in the clear.
  srv.lines.length = 0;
  const { doSTARTTLS: _required, ...opportunistic } = imapOptions(server, 'me@x.test', PASS);
  await login(opportunistic);
  assert.ok(srv.lines.some((l) => / (LOGIN|AUTHENTICATE)\b/i.test(l)) && sawPassword(srv.lines), 'the fake server takes the password in the clear when nothing requires TLS');

  assert.equal('doSTARTTLS' in imapOptions({ ...server, secure: true }, 'me@x.test', PASS), false, 'TLS from the first byte: ImapFlow refuses doSTARTTLS with secure');
});
