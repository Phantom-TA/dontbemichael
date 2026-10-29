'use strict';

/**
 * Show pictures (docs/designs/original-email-view.md, R2, R6): main fetches an
 * email's web pictures, and never from this Mac or the local network, however
 * the address gets there (a name, a redirect, DNS), only real pictures, within
 * the limits. A local HTTP server stands in for the web; the test allows its
 * one address and nothing else.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const { isGlobalAddress, pictureType, fetchPicture, fetchPictures, guardedLookup, PICTURE_REDIRECTS } = loadTs('src/main/emailPictures.ts');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

async function server(t, handler) {
  const seen = [];
  const s = http.createServer((req, res) => { seen.push(req); handler(req, res); });
  const port = await new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve(s.address().port)));
  t.after(() => s.close());
  return { base: `http://127.0.0.1:${port}`, port, seen };
}
const onlyLocal = (ip) => ip === '127.0.0.1';
const budget = () => ({ bytes: 15 * 1024 * 1024, until: Date.now() + 15_000 });

test('only addresses on the open internet count as global', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'not an ip']) {
    assert.equal(isGlobalAddress(ip), false, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isGlobalAddress(ip), true, ip);
});

test('a picture is judged by its first bytes, never its claimed type', () => {
  assert.equal(pictureType(PNG), 'image/png');
  assert.equal(pictureType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(pictureType(Buffer.from('GIF89a......')), 'image/gif');
  assert.equal(pictureType(SVG), null, 'no SVG');
  assert.equal(pictureType(Buffer.from('<html>')), null);
});

test('a picture comes back as data, with no cookie or referrer sent', async (t) => {
  const { base, seen } = await server(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG); });
  const data = await fetchPicture(`${base}/logo.png`, budget(), { allowed: onlyLocal });
  assert.equal(data, `data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(seen[0].headers.cookie, undefined);
  assert.equal(seen[0].headers.referer, undefined);
});

test('a body that is not a picture is refused, whatever its header says', async (t) => {
  const { base } = await server(t, (req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(req.url === '/svg' ? SVG : '<html>hi</html>'); });
  assert.equal(await fetchPicture(`${base}/html`, budget(), { allowed: onlyLocal }), null);
  assert.equal(await fetchPicture(`${base}/svg`, budget(), { allowed: onlyLocal }), null);
});

test('this Mac and the local network are never reached in the app', async (t) => {
  const { base, seen } = await server(t, (_req, res) => { res.writeHead(200); res.end(PNG); });
  assert.equal(await fetchPicture(`${base}/x.png`, budget()), null, 'an address on this Mac');
  // A name that resolves to a private address, through the guarded lookup.
  const local = (_host, _opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  assert.equal(await fetchPicture(`http://pictures.example:${new URL(base).port}/x.png`, budget(), { dnsLookup: local }), null, 'a name that points here');
  assert.equal(seen.length, 0, 'nothing reached the server');
});

test('a redirect to a private address is refused, at each hop', async (t) => {
  const { base, port, seen } = await server(t, (req, res) => {
    if (req.url === '/to-literal') { res.writeHead(302, { Location: `http://127.0.0.2:${port}/x.png` }); res.end(); return; }
    if (req.url === '/to-name') { res.writeHead(302, { Location: `http://inside.example:${port}/x.png` }); res.end(); return; }
    res.writeHead(200); res.end(PNG);
  });
  assert.equal(await fetchPicture(`${base}/to-literal`, budget(), { allowed: onlyLocal }), null);
  const inside = (_host, _opts, cb) => cb(null, [{ address: '10.0.0.5', family: 4 }]);
  assert.equal(await fetchPicture(`${base}/to-name`, budget(), { allowed: onlyLocal, dnsLookup: inside }), null);
  assert.deepEqual(seen.map((r) => r.url), ['/to-literal', '/to-name'], 'only the first hops were fetched');
});

test('a lookup with any private answer is refused (DNS rebinding)', async () => {
  const mixed = (_host, _opts, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  const err = await new Promise((resolve) => guardedLookup(mixed)('x.example', {}, (e) => resolve(e)));
  assert.equal(err?.code, 'EPRIVATE');
});

test('redirects stop after three', async (t) => {
  const { base, seen } = await server(t, (req, res) => { res.writeHead(302, { Location: `/r${seen.length}` }); res.end(); });
  assert.equal(await fetchPicture(`${base}/start`, budget(), { allowed: onlyLocal }), null);
  assert.equal(seen.length, PICTURE_REDIRECTS + 1);
});

test('one email fetches at most four at a time and keys pictures by the address it wrote', async (t) => {
  let now = 0;
  let most = 0;
  const { base } = await server(t, (_req, res) => {
    now++; most = Math.max(most, now);
    setTimeout(() => { now--; res.writeHead(200); res.end(PNG); }, 20);
  });
  const urls = Array.from({ length: 10 }, (_, i) => ({ raw: `${base}/${i}.png?a=1&amp;b=2`, url: `${base}/${i}.png?a=1&b=2` }));
  const { pictures, failed } = await fetchPictures(urls, { allowed: onlyLocal });
  assert.equal(Object.keys(pictures).length, 10);
  assert.equal(failed, 0);
  assert.ok(pictures[urls[3].raw].startsWith('data:image/png;base64,'));
  assert.ok(most <= 4, `at most four at once (saw ${most})`);
});

test('a picture over 5 MB is dropped', async (t) => {
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const { base } = await server(t, (_req, res) => { res.writeHead(200); res.end(big); });
  assert.equal(await fetchPicture(`${base}/big.png`, budget(), { allowed: onlyLocal }), null);
});
