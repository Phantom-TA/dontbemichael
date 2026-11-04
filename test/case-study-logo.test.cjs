'use strict';

// The case study's logo read (docs/designs/case-study.md, D3, eng A3): only
// the public internet, only the business's own site for the page, the header's
// logo image first, SVG only through the caller's drawSvg, the site's theme
// colour for a logo with none, and every failure a reason rather than a throw.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const L = loadTs('src/main/siteLogo.ts');

function png(w, h) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const html = (head) => Buffer.from(`<!doctype html><html><head>${head}</head><body>x</body></html>`);

/** A fake web: a map of URL to response, and a record of what was asked. */
function web(pages) {
  const asked = [];
  const get = async (url) => {
    asked.push(url.href);
    const p = pages[url.href];
    if (!p) return { status: 404, headers: {}, body: Buffer.alloc(0) };
    if (p.redirect) return { status: 301, headers: { location: p.redirect }, body: Buffer.alloc(0) };
    if (p.error) throw p.error;
    return { status: 200, headers: {}, body: p.body };
  };
  return { get, asked };
}
const decode = () => ({ png: Buffer.from('PNG'), colour: '#8C5A2B' });

test('only public addresses pass, mapped and NAT64 forms included', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.5', '240.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', 'not an ip']) {
    assert.equal(L.isPublicAddress(ip), false, ip);
  }
  for (const ip of ['93.184.216.34', '2606:4700::1111', '::ffff:93.184.216.34']) assert.equal(L.isPublicAddress(ip), true, ip);
  // Forms that can wrap a private IPv4 address (ship review).
  for (const ip of ['::7f00:1', '::a00:1', '2002:7f00:1::1', '2002:c0a8:101::1', '64:ff9b:1::a00:1']) assert.equal(L.isPublicAddress(ip), false, ip);
});

test('the socket lookup refuses a name with any private address', async () => {
  const fake = (addrs) => (host, opts, cb) => cb(null, addrs);
  const ask = (lookup) => new Promise((resolve) => lookup('x.example', {}, (err, addr) => resolve(err ? err.code : addr)));
  assert.equal(await ask(L.guardedLookup(fake([{ address: '93.184.216.34', family: 4 }]))), '93.184.216.34');
  assert.equal(await ask(L.guardedLookup(fake([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]))), 'EPRIVATE');
  assert.equal(await ask(L.guardedLookup(fake([]))), 'EPRIVATE');
});

test('a stored site becomes https; www and the bare domain are one site', () => {
  assert.equal(L.siteUrl('http://bakery.example').href, 'https://bakery.example/');
  assert.equal(L.siteUrl('bakery.example/about').href, 'https://bakery.example/about');
  assert.equal(L.siteUrl('not a site'), null);
  assert.equal(L.siteUrl(''), null);
  assert.equal(L.siteOf('www.bakery.example'), L.siteOf('bakery.example'));
  assert.equal(L.siteOf('shop.bakery.co.uk'), 'bakery.co.uk');
});

test('the header logo first, then icons best first, SVG included, relative links resolved', () => {
  const urls = L.iconUrls(`<head><link rel="icon" href="/a.svg" type="image/svg+xml"><link rel="icon" sizes="32x32" href="/i32.png"><link rel="icon" sizes="192x192" href="/i192.png"><meta property="og:image" content="https://cdn.example/og.jpg"><link rel="apple-touch-icon" href="touch.png"></head><body><img src="/hero.jpg" alt="Fresh bread"><img class="site-header__logo" src="/brand/logo_rect.svg" alt="Harbor Bakery"><link rel="icon" href="/late.png">`, new URL('https://bakery.example/home/'));
  assert.deepEqual(urls.map((u) => u.href), ['https://bakery.example/brand/logo_rect.svg', 'https://bakery.example/home/touch.png', 'https://bakery.example/i192.png', 'https://bakery.example/i32.png', 'https://bakery.example/a.svg', 'https://cdn.example/og.jpg']);
});

test("the site's theme colour is read from its head", () => {
  assert.equal(L.themeColour('<head><meta name="theme-color" content="#b08d57"></head>'), '#B08D57');
  assert.equal(L.themeColour('<head><meta name="theme-color" content="#abc"></head>'), '#AABBCC');
  assert.equal(L.themeColour('<head><meta name="theme-color" content="rebeccapurple"></head>'), null);
  assert.equal(L.themeColour('<head></head><body><meta name="theme-color" content="#123456">'), null, 'the head only');
});

test('an SVG logo is drawn by the caller; a logo with no colour takes the theme colour', async () => {
  const site = web({
    'https://bakery.example/': { body: Buffer.from('<html><head><meta name="theme-color" content="#B08D57"></head><body><img class="logo" src="/logo.svg"></body></html>') },
    'https://bakery.example/logo.svg': { body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="95"></svg>') }
  });
  const drawn = [];
  const r = await L.readSiteLogo('bakery.example', { decode: () => ({ png: Buffer.from('PNG'), colour: null }), drawSvg: async (b) => { drawn.push(b.toString()); return png(300, 95); }, get: site.get });
  assert.deepEqual(r, { ok: true, png: Buffer.from('PNG'), colour: '#B08D57' });
  assert.equal(drawn.length, 1);
  const failed = await L.readSiteLogo('bakery.example', { decode, drawSvg: async () => null, get: site.get });
  assert.deepEqual(failed, { ok: false, reason: 'svg' }, 'an SVG that will not draw is a reason');
});

test('the image kind comes from its bytes, and its size from the header', () => {
  assert.equal(L.imageKind(png(10, 10)), 'png');
  assert.equal(L.imageKind(Buffer.from('<?xml version="1.0"?><svg onload="x()">')), 'svg');
  assert.equal(L.imageKind(Buffer.from('GIF89a')), null);
  assert.deepEqual(L.imageSize(png(512, 256), 'png'), { w: 512, h: 256 });
});

test('the logo is found through a same site redirect and an image on another host', async () => {
  const { get, asked } = web({
    'https://bakery.example/': { redirect: 'https://www.bakery.example/' },
    'https://www.bakery.example/': { body: html('<link rel="apple-touch-icon" href="https://images.cdn.example/logo.png">') },
    'https://images.cdn.example/logo.png': { body: png(180, 180) }
  });
  const r = await L.readSiteLogo('http://bakery.example', { decode, get });
  assert.deepEqual(r, { ok: true, png: Buffer.from('PNG'), colour: '#8C5A2B' });
  assert.equal(asked[0], 'https://bakery.example/', 'http was tried over https');
});

test('every refusal is a reason: off site redirect, private host, SVG with no drawer, too big, nothing found, no site', async () => {
  const off = web({ 'https://bakery.example/': { redirect: 'https://elsewhere.example/' } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: off.get }), { ok: false, reason: 'not-found' });
  assert.deepEqual(await L.readSiteLogo('https://127.0.0.1', { decode, get: off.get }), { ok: false, reason: 'private' });
  assert.deepEqual(await L.readSiteLogo('localhost', { decode, get: off.get }), { ok: false, reason: 'no-site' }, 'a name with no dot is not a site');
  assert.deepEqual(await L.readSiteLogo('https://10.0.0.1/', { decode, get: off.get }), { ok: false, reason: 'private' });
  const toPrivate = web({ 'https://bakery.example/': { body: html('<link rel="icon" href="https://[::1]/x.png">') } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: toPrivate.get }), { ok: false, reason: 'private' });
  const svg = web({ 'https://bakery.example/': { body: html('<meta property="og:image" content="/logo">') }, 'https://bakery.example/logo': { body: Buffer.from('<svg xmlns="x"></svg>') } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: svg.get }), { ok: false, reason: 'svg' });
  const huge = web({ 'https://bakery.example/': { body: html('<link rel="icon" href="/big.png">') }, 'https://bakery.example/big.png': { body: png(9000, 9000) } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: huge.get }), { ok: false, reason: 'too-big' });
  const none = web({ 'https://bakery.example/': { body: html('<title>Bakery</title>') } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: none.get }), { ok: false, reason: 'not-found' });
  assert.deepEqual(await L.readSiteLogo(undefined, { decode, get: none.get }), { ok: false, reason: 'no-site' });
  const broken = web({ 'https://bakery.example/': { body: html('<link rel="icon" href="/x.png">') }, 'https://bakery.example/x.png': { body: png(64, 64) } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode: () => null, get: broken.get }), { ok: false, reason: 'not-image' });
});

test('a redirect loop stops after three hops', async () => {
  const loop = web({ 'https://bakery.example/': { redirect: 'https://bakery.example/a' }, 'https://bakery.example/a': { redirect: 'https://bakery.example/' } });
  assert.deepEqual(await L.readSiteLogo('bakery.example', { decode, get: loop.get }), { ok: false, reason: 'not-found' });
  assert.equal(loop.asked.length, 4);
});

test('a host that trickles its headers still ends at the total time limit (ship review)', async (t) => {
  // Value: protects=a slow or hostile site can't leave the case study on Preparing forever; fails_when=the limit only starts once headers arrive, so a host sending its headers a byte at a time is never cut off; why_new=ship review of 0.3.5; seam=a local TLS server with a throwaway certificate, and a lookup that allows it; no_claim=the public address guard (tested above)
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const tls = require('node:tls');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-tls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-days', '1', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  } catch { t.skip('openssl is not available'); return; }
  const socks = new Set();
  const server = tls.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, (sock) => {
    socks.add(sock);
    sock.write('HTTP/1.1 200 OK\r\nX-Slow: ');
    const tick = setInterval(() => { try { sock.write('a'); } catch { /* closed */ } }, 40);
    sock.on('close', () => clearInterval(tick));
    sock.on('error', () => clearInterval(tick));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  t.after(() => { if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev; for (const s of socks) s.destroy(); server.close(); });
  const { port } = server.address();
  const lookup = (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4));
  const started = Date.now();
  const outcome = await Promise.race([
    L.defaultGet(new URL(`https://localhost:${port}/`), 100000, Date.now() + 300, lookup).then(() => 'resolved', (e) => (e && e.reason) || String(e)),
    new Promise((r) => setTimeout(() => r('still waiting'), 3000))
  ]);
  assert.equal(outcome, 'timeout', 'the request ends at its limit');
  assert.ok(Date.now() - started < 1500, `it ended near the limit (${Date.now() - started} ms)`);
});
