'use strict';

/**
 * The file tab's Copy (docs/designs/copy-document.md; owner, 2026-10-26: some
 * business users can't work out how to copy an email draft or a blog post).
 * A document pastes formatted in Gmail or Docs and as clean words in a plain
 * box; a CSV as real cells; a picture as a picture; a selected part as clean as
 * the whole. The serializer runs on fake nodes: tests have no DOM.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { cleanCopy, tableCopy, tsvCell, escapeHtml, copyPicture } = loadTs('src/renderer/src/components/fileTabCopy.ts');
const { copyRich, copyImage } = loadTs('src/main/clipboardCopy.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const txt = (s) => ({ nodeType: 3, nodeName: '#text', childNodes: [], textContent: s });
const el = (name, attrs, ...kids) => {
  const childNodes = kids.map((k) => (typeof k === 'string' ? txt(k) : k));
  return {
    nodeType: 1, nodeName: name.toUpperCase(), childNodes, checked: attrs ? attrs.$checked : undefined,
    get textContent() { return childNodes.map((c) => c.textContent).join(''); },
    getAttribute: (n) => (attrs && n in attrs && !n.startsWith('$') ? attrs[n] : null)
  };
};
const frag = (...kids) => {
  const childNodes = kids.map((k) => (typeof k === 'string' ? txt(k) : k));
  return { nodeType: 11, nodeName: '#document-fragment', childNodes, get textContent() { return childNodes.map((c) => c.textContent).join(''); } };
};

// A page shaped as MarkdownPreview renders it in a file tab.
const page = () => el('div', { class: 'cth-file-tab', style: 'color: white' },
  el('div', { class: 'cth-md-preview' },
    el('h1', null, 'Spring offer'), '\n',
    el('p', null, 'Hi ', el('strong', null, 'Dana'), ',\nthanks for ', el('em', null, 'everything'), '. See ',
      el('a', { href: 'https://example.com/offer', title: 'https://example.com/offer' }, 'the offer'), ' or ',
      el('a', { href: 'https://example.com', title: 'x' }, 'https://example.com'), ' or ',
      el('a', { href: 'notes.md' }, 'our notes'), ' and ', el('code', null, 'SPRING10'),
      el('sup', null, el('a', { href: '#user-content-fn-1', id: 'user-content-fnref-1' }, '1')), '.'), '\n',
    el('ul', { class: 'contains-task-list' }, '\n',
      el('li', null, 'Lunch', '\n', el('ul', null, '\n', el('li', null, 'Soup'), '\n', el('li', null, 'Bread'), '\n')), '\n',
      el('li', { class: 'task-list-item' }, el('input', { type: 'checkbox', disabled: '', $checked: true }), ' Done'), '\n',
      el('li', { class: 'task-list-item' }, el('input', { type: 'checkbox', disabled: '', $checked: false }), ' Todo'), '\n'), '\n',
    el('ol', { start: '3' }, el('li', null, 'Third'), el('li', null, 'Fourth')),
    el('blockquote', null, '\n', el('p', null, 'Quoted ', el('br', null), 'line two'), '\n'),
    el('pre', null, el('code', { class: 'language-js' }, 'const a = 1;\n  if (a) go();\n')),
    el('div', { class: 'cth-md-table', role: 'region', 'aria-label': 'Table', tabindex: '0' },
      el('table', null,
        el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'cth-md-num', style: 'text-align:right' }, 'Price'))),
        el('tbody', null, el('tr', null, el('td', null, 'Tea'), el('td', { class: 'cth-md-num' }, '$4'))))),
    el('hr', null),
    el('p', null,
      el('span', { class: 'cth-md-img', title: 'https://cdn.example.com/x.png', 'data-alt': 'Header' }, '🖼 Header'), ' and ',
      el('img', { class: 'cth-md-image', src: 'blob:abc', alt: 'pics/a.png', 'data-alt': '' }), 'end'),
    el('section', { class: 'footnotes', 'data-footnotes': '' },
      el('h2', { class: 'sr-only', id: 'footnote-label' }, 'Footnotes'),
      el('ol', null, el('li', { id: 'user-content-fn-1' }, el('p', null, 'Valid in May. ', el('a', { href: '#user-content-fnref-1' }, '↩')))))));

test('a Markdown page copies as plain tags and clean words (A1)', () => {
  // Value: protects=Gmail gets formatting and a plain box gets words with no Markdown marks; fails_when=any rule regresses; why_new=no copy existed; seam=none; no_claim=how Gmail renders it (hand check)
  const { html, text } = cleanCopy(page());
  assert.equal(html,
    '<h1>Spring offer</h1><p>Hi <strong>Dana</strong>,\nthanks for <em>everything</em>. See <a href="https://example.com/offer">the offer</a>'
    + ' or <a href="https://example.com">https://example.com</a> or our notes and <code>SPRING10</code>[1].</p>'
    + '<ul><li>Lunch\n<ul><li>Soup</li><li>Bread</li></ul></li><li>☑  Done</li><li>☐  Todo</li></ul>'
    + '<ol start="3"><li>Third</li><li>Fourth</li></ol><blockquote><p>Quoted <br>line two</p></blockquote>'
    + '<pre><code>const a = 1;\n  if (a) go();\n</code></pre>'
    + '<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody><tr><td>Tea</td><td>$4</td></tr></tbody></table>'
    + '<hr><p>Header and end</p><ol><li><p>Valid in May. </p></li></ol>');
  assert.equal(text, [
    'Spring offer',
    'Hi Dana, thanks for everything. See the offer (https://example.com/offer) or https://example.com or our notes and SPRING10[1].',
    '• Lunch\n  • Soup\n  • Bread\n• ☑ Done\n• ☐ Todo',
    '3. Third\n4. Fourth',
    'Quoted\nline two',
    'const a = 1;\n  if (a) go();',
    'Item\tPrice\nTea\t$4',
    'Header and end',
    '1. Valid in May.'
  ].join('\n\n'));
});

test('no picture, class, style or app word ever reaches a paste (P1, E4)', () => {
  // Value: protects=no unseen web picture and no dark theme color reaches an email; fails_when=an img, class or style is written or chip words copied; why_new=P1 and E4 rules; seam=none; no_claim=none beyond protects
  const { html, text } = cleanCopy(page());
  for (const banned of ['<img', 'class=', 'style=', 'title=', 'aria-', 'blob:', 'cdn.example.com', '🖼', 'pics/a.png', 'Footnotes', '↩', 'notes.md', 'tabindex'])
    assert.ok(!html.includes(banned) && !text.includes(banned), `${banned} stays out`);
  // A picture with no alt pastes as nothing, never as its file name.
  assert.deepEqual(cleanCopy(el('p', null, el('img', { src: 'blob:x', alt: 'shot.png', 'data-alt': '' }))), { html: '<p></p>', text: '' });
});

test('agent text cannot inject markup or a harmful link (security)', () => {
  // Value: protects=pasted HTML holds only escaped words and http(s)/mailto links; fails_when=escaping or the href allowlist is dropped; why_new=new HTML sink on the clipboard; seam=none; no_claim=none beyond protects
  const { html, text } = cleanCopy(el('p', null, '<script>alert("x")</script> & ',
    el('a', { href: 'javascript:alert(1)' }, 'click'), ' ', el('a', { href: 'file:///etc/passwd' }, 'file'), ' ',
    el('a', { href: 'https://e.com/?a="b"&c' }, 'q'), el('script', null, 'evil()'), el('button', null, 'Open')));
  assert.equal(html, '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; click file <a href="https://e.com/?a=&quot;b&quot;&amp;c">q</a></p>');
  assert.equal(text, '<script>alert("x")</script> & click file q (https://e.com/?a="b"&c)');
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('a place in Settings named in the text pastes as its words, without its icon', () => {
  // Value: protects=a copied draft keeps "Connect your email" from a dbm: link; fails_when=the place chip is dropped like an app button; why_new=PlaceChip renders a button inside file tab text; seam=PlaceChip's data-copy marker; no_claim=the chip's click
  const chip = el('button', { class: 'cth-file-chip', 'data-copy': 'words', 'aria-label': 'Open Settings' },
    el('span', { 'aria-hidden': 'true' }, el('svg', null, 'gear')), el('span', { dir: 'auto' }, 'Connect your email'));
  const { html, text } = cleanCopy(el('p', null, 'Then ', chip, '.'));
  assert.equal(html, '<p>Then Connect your email.</p>');
  assert.equal(text, 'Then Connect your email.');
  assert.match(read('src/renderer/src/markdown/PlaceChip.tsx'), /data-copy="words"/);
});

test('a link reads "words (address)" only when the words are not the address', () => {
  const words = (a) => cleanCopy(el('p', null, a)).text;
  assert.equal(words(el('a', { href: 'http://www.example.com' }, 'www.example.com')), 'www.example.com', 'GFM www autolink (isBareLink)');
  assert.equal(words(el('a', { href: 'mailto:sam@example.com' }, 'sam@example.com')), 'sam@example.com', 'email autolink');
  assert.equal(words(el('a', { href: 'https://example.com/' }, 'example.com')), 'example.com', 'scheme, www and trailing slash ignored');
  assert.equal(words(el('a', { href: 'mailto:sam@example.com' }, 'Write to Sam')), 'Write to Sam (sam@example.com)');
  assert.equal(words(el('a', { href: 'https://example.com' })), 'https://example.com', 'a link with no words shows its address');
});

test('a selection copies clean: orphans get their parents back (E4)', () => {
  // Value: protects=a part pastes like the whole; fails_when=a cloned li or td loses its list or table; why_new=Range clones cut parents; seam=none; no_claim=the browser copy event (source check below)
  const items = cleanCopy(frag('\n', el('li', null, 'Soup'), '\n', el('li', null, 'Bread'), '\n'));
  assert.deepEqual(items, { html: '<ul><li>Soup</li><li>Bread</li></ul>', text: '• Soup\n• Bread' });
  const cells = cleanCopy(frag(el('td', null, 'Tea'), el('td', null, '$4')));
  assert.deepEqual(cells, { html: '<table><tr><td>Tea</td><td>$4</td></tr></table>', text: 'Tea\t$4' });
  const rows = cleanCopy(frag(el('tr', null, el('td', null, 'a')), el('tr', null, el('td', null, 'b"c'))));
  assert.deepEqual(rows, { html: '<table><tr><td>a</td></tr><tr><td>b&quot;c</td></tr></table>', text: 'a\n"b""c"' });
  // Part of one paragraph: its words, no wrapping tag.
  assert.deepEqual(cleanCopy(frag('ks for ', el('em', null, 'every'))), { html: 'ks for <em>every</em>', text: 'ks for every' });
  // A lone text node (selection inside one word).
  assert.deepEqual(cleanCopy(txt('offer')), { html: 'offer', text: 'offer' });
});

test('the CSV row count note and other skipped parts never copy (E3)', () => {
  const table = el('div', null, el('table', null, el('tbody', null, el('tr', null, el('td', null, 'x')))),
    el('p', { 'data-copy': 'skip', style: 'color: grey' }, 'Showing 1,000 of 5,000 rows'));
  assert.deepEqual(cleanCopy(table), { html: '<table><tbody><tr><td>x</td></tr></tbody></table>', text: 'x' });
});

test('a CSV copies every row as a table and tab separated rows (E3)', () => {
  // Value: protects=Sheets and Excel get real cells for every row; fails_when=rows stop at 1,000 or a cell with a tab, newline or quote splits a row; why_new=delimited.ts tests cover parsing only; seam=none; no_claim=Excel paste (hand check)
  const rows = [['Name', 'Note'], ['A & B', 'say "hi"'], ['tab', 'a\tb'], ['line', 'one\ntwo']];
  for (let i = 0; i < 1200; i++) rows.push([`r${i}`, String(i)]);
  const { html, text } = tableCopy(rows);
  assert.ok(html.startsWith('<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td>A &amp; B</td><td>say &quot;hi&quot;</td></tr>'));
  assert.ok(html.endsWith('<tr><td>r1199</td><td>1199</td></tr></tbody></table>'), 'every row, past the 1,000 the tab shows');
  const lines = text.split('\n');
  assert.equal(lines[0], 'Name\tNote');
  assert.equal(lines[1], 'A & B\t"say ""hi"""');
  assert.equal(lines[2], 'tab\t"a\tb"');
  assert.equal(text.includes('line\t"one\ntwo"'), true);
  assert.equal(lines[lines.length - 1], 'r1199\t1199');
  assert.deepEqual(tableCopy([]), { text: '' });
  assert.equal(tsvCell('plain'), 'plain');
  assert.equal(tsvCell('a"b'), '"a""b"');
});

test('a picture copies the frame shown at the click; a closed tab sends nothing (E2)', async () => {
  // Value: protects=a late picture never overwrites a newer copy and an unshown picture fails visibly; fails_when=the alive check or the shown check is dropped; why_new=new async path; seam=encode injected (production passes the canvas encoder); no_claim=real canvas encode (fake encode)
  const shown = { complete: true, naturalWidth: 10 };
  const sent = [];
  const send = async (png) => { sent.push(png); return { ok: true }; };
  assert.deepEqual(await copyPicture(null, { encode: async () => new Uint8Array([1]), isAlive: () => true, send }), { ok: false, error: 'picture not shown' });
  assert.deepEqual(await copyPicture({ complete: false, naturalWidth: 0 }, { encode: async () => new Uint8Array([1]), isAlive: () => true, send }), { ok: false, error: 'picture not shown' });
  assert.deepEqual(await copyPicture(shown, { encode: async () => null, isAlive: () => true, send }), { ok: false, error: 'picture not encoded' });

  // The draw starts at the click, before any await.
  let release;
  let encodes = 0;
  let alive = true;
  const pending = copyPicture(shown, { encode: () => { encodes++; return new Promise((r) => { release = r; }); }, isAlive: () => alive, send });
  assert.equal(encodes, 1, 'drawn synchronously at the click');
  alive = false; // the owner closes or switches the tab while the PNG encodes
  release(new Uint8Array([9]));
  assert.equal(await pending, null);
  assert.equal(sent.length, 0, 'nothing sent once the tab is gone');

  assert.deepEqual(await copyPicture(shown, { encode: async () => new Uint8Array([7]), isAlive: () => true, send }), { ok: true });
  assert.deepEqual(Array.from(sent[0]), [7]);
});

test('main writes both flavors in one call and reports every failure (T1)', () => {
  // Value: protects=main refuses bad input and a throwing clipboard shows Couldn't copy; fails_when=a throw escapes the IPC or bad input is written; why_new=no clipboard handler had a test; seam=clipboard injected (production passes Electron's); no_claim=the real OS clipboard (fake clipboard)
  const writes = [];
  const clip = { write: (d) => writes.push(d), writeImage: (i) => writes.push(i) };
  assert.deepEqual(copyRich(clip, { text: 'Hi', html: '<p>Hi</p>' }), { ok: true });
  assert.deepEqual(writes.pop(), { text: 'Hi', html: '<meta charset="utf-8"><p>Hi</p>' }, 'one write, both flavors, UTF-8 declared');
  assert.deepEqual(copyRich(clip, { text: 'plain' }), { ok: true });
  assert.deepEqual(writes.pop(), { text: 'plain' });
  for (const bad of [undefined, null, 'x', { text: 3 }, { text: 'a', html: 5 }, { text: '' }])
    assert.equal(copyRich(clip, bad).ok, false, `refused: ${JSON.stringify(bad)}`);
  assert.equal(writes.length, 0, 'nothing written for bad input');
  const broken = { write: () => { throw new Error('clipboard locked'); }, writeImage: () => { throw new Error('busy'); } };
  assert.deepEqual(copyRich(broken, { text: 'a' }), { ok: false, error: 'clipboard locked' });

  const maker = (empty) => ({ createFromBuffer: (b) => ({ isEmpty: () => empty, bytes: b }) });
  assert.deepEqual(copyImage(clip, maker(false), new Uint8Array([1, 2])), { ok: true });
  assert.ok(Buffer.isBuffer(writes.pop().bytes), 'bytes become a Buffer for nativeImage');
  assert.deepEqual(copyImage(clip, maker(true), new Uint8Array([1])), { ok: false, error: 'unreadable image' });
  assert.equal(copyImage(clip, maker(false), new Uint8Array([])).ok, false);
  assert.equal(copyImage(clip, maker(false), [1, 2]).ok, false);
  assert.deepEqual(copyImage(broken, maker(false), new Uint8Array([1])), { ok: false, error: 'busy' });
  assert.equal(writes.length, 0);
});

test('the tab wires Copy and the clean selection copy as planned', () => {
  // Value: protects=Copy shows only for a readable non-empty file and a selection outside the page or a failure keeps the native copy; fails_when=the guards or the try order change; why_new=new wiring; seam=none; no_claim=the browser copy event target (source check only)
  const view = read('src/renderer/src/components/FileTabView.tsx');
  assert.match(view, /\{read\.status === 'ok' && read\.size > 0 && \(\s*<PixelButton[^>]*onClick=\{\(\) => void copyTab\(\)\} disabled=\{copy === 'busy'\}>/);
  assert.match(view, /<div ref=\{scroller\} className="cth-file-tab" onCopy=\{copySelection\}/);
  assert.match(view, /if \(!page\.contains\(range\.startContainer\) \|\| !page\.contains\(range\.endContainer\)\) return;/);
  // setData and preventDefault only inside the try: a throw leaves the native copy.
  const handler = view.slice(view.indexOf('const copySelection'), view.indexOf('const canOpenInApp'));
  assert.ok(handler.indexOf('try {') < handler.indexOf('e.preventDefault()') && handler.indexOf('e.preventDefault()') < handler.indexOf('} catch'));
  assert.match(view, /<span className="cth-sr-only" aria-live="polite">/);
  assert.match(view, /isAlive: \(\) => mounted\.current/);
  assert.match(view, /return \(\) => \{ mounted\.current = false; clearTimeout\(copyTimer\.current\); \};/);
  assert.match(view, /<p data-copy="skip"/);
  const md = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(md, /<span className="cth-md-img" title=\{src\} data-alt=\{alt \?\? ''\}>/);
  assert.match(md, /alt=\{alt \|\| rel\}\s*data-alt=\{alt \?\? ''\}/);
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('app:copyRich', \(_evt, input: unknown\) => copyRich\(clipboard, input\)\);/);
  assert.match(main, /ipcMain\.handle\('app:copyImage', \(_evt, bytes: unknown\) => copyImage\(clipboard, nativeImage, bytes\)\);/);
  const preload = read('src/preload/index.ts');
  assert.match(preload, /ipcRenderer\.invoke\('app:copyRich', data\)/);
  assert.match(preload, /ipcRenderer\.invoke\('app:copyImage', png\)/);
});
