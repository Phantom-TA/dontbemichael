'use strict';

/**
 * The email tab's frame (docs/designs/original-email-view.md, R2, DD2): the
 * page it shows can't run, navigate or reach the network, pictures from the
 * web stay blank until the owner shows them, and pictures inside the email show.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { buildEmailFrame, remotePictureUrls, fetchableUrl, frameNavigationAllowed, PICTURES_MAX } = loadTs('src/shared/emailFrame.ts');

const frame = (html, pictures = null, inline = {}) => buildEmailFrame({ html, text: '', inline, pictures });

test('the CSP comes first and lets pictures in only as data', () => {
  const doc = frame('<html><head><title>x</title></head><body>Hi</body></html>');
  assert.ok(doc.startsWith('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy"'), 'before any of the email');
  assert.match(doc, /default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:/);
  assert.match(doc, /<base target="_blank">/);
  const shown = frame('<img src="https://t.example/p.png">', { 'https://t.example/p.png': 'data:image/png;base64,AAAA' });
  assert.match(shown, /img-src data:;/, 'showing pictures never widens the CSP');
});

test('tags that move the frame are taken out', () => {
  const doc = frame('<meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><p>x</p>');
  assert.ok(!/refresh/i.test(doc));
  assert.ok(!/evil\.example/.test(doc));
});

test('pictures from the web are blank until shown, then their data copies', () => {
  const html = '<img src="https://t.example/a.png?x=1&amp;y=2"><td background=\'http://t.example/bg.gif\'><div style="background:url(//t.example/c.jpg)">';
  const urls = remotePictureUrls(html);
  assert.deepEqual(urls, ['https://t.example/a.png?x=1&amp;y=2', 'http://t.example/bg.gif', '//t.example/c.jpg']);
  assert.equal(fetchableUrl(urls[0]), 'https://t.example/a.png?x=1&y=2');
  assert.equal(fetchableUrl(urls[2]), 'https://t.example/c.jpg');
  const hidden = frame(html);
  assert.ok(!/t\.example/.test(hidden), 'no web address left to load');
  const shown = frame(html, { [urls[0]]: 'data:image/png;base64,AA', [urls[2]]: 'data:image/jpeg;base64,BB' });
  assert.match(shown, /src="data:image\/png;base64,AA"/);
  assert.match(shown, /url\("data:image\/jpeg;base64,BB"\)/);
  assert.ok(!/t\.example/.test(shown), 'one that failed stays blank');
});

test('pictures carried inside the email show from their content ids', () => {
  const doc = frame('<img src="cid:logo@x"><img src="cid:gone@x">', null, { 'logo@x': 'data:image/png;base64,LL' });
  assert.match(doc, /src="data:image\/png;base64,LL"/);
  assert.ok(!/cid:/.test(doc));
});

test('at most 40 pictures are asked for', () => {
  const html = Array.from({ length: 60 }, (_, i) => `<img src="https://t.example/${i}.png">`).join('');
  assert.equal(remotePictureUrls(html).length, PICTURES_MAX);
  assert.equal(PICTURES_MAX, 40);
});

test('a text only email is shown as text, never as markup', () => {
  const doc = buildEmailFrame({ html: null, text: 'Hi <script>alert(1)</script>', inline: {}, pictures: null });
  assert.match(doc, /<pre>Hi &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/pre>/);
});

test('a frame only ever shows its own srcdoc', () => {
  assert.equal(frameNavigationAllowed('about:srcdoc', false), true);
  assert.equal(frameNavigationAllowed('about:blank', false), true);
  for (const u of ['https://evil.example/', 'http://x/', 'file:///etc/passwd', 'data:text/html,hi', 'javascript:alert(1)']) {
    assert.equal(frameNavigationAllowed(u, false), false, u);
  }
  assert.equal(frameNavigationAllowed('https://x/', true), true, 'the window itself is will-navigate\'s');
});

test('the window refuses frame navigation, keeps its sandbox, and the tab frame has no scripts', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const main = read('src/main/index.ts');
  assert.match(main, /on\('will-frame-navigate', \(e\) => \{\s*if \(!frameNavigationAllowed\(e\.url, e\.isMainFrame\)\) e\.preventDefault\(\);/);
  assert.match(main, /sandbox: true/);
  assert.ok(!/nodeIntegrationInSubFrames:\s*true/.test(main), 'preload never runs in a frame');
  const tab = read('src/renderer/src/components/EmailTabView.tsx');
  assert.match(tab, /sandbox="allow-popups"/);
  assert.ok(!/allow-scripts|allow-same-origin|allow-popups-to-escape-sandbox|allow-forms/.test(tab));
});
