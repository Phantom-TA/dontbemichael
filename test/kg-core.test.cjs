'use strict';
/**
 * Knowledge Graph core + agent-CLI tests. Self-contained, no test framework —
 * run with `node test/kg-core.test.cjs` (mirrors test/slack.test.cjs).
 * Exercises: tokenize/chunk/score, the ingest→store→search round-trip for the
 * two v1 modalities (text + image), list/get/remove, and the real `kg.cjs` CLI
 * an agent invokes (proving the out-of-process retrieval path end to end).
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const kg = require('../src/main/kg-core.cjs');
const CLI = path.join(__dirname, '..', 'resources', 'kg.cjs');

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.log(`  ✗ ${name}\n     ${err && err.message}`); }
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kg-test-'));
}
function writeFixture(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

(async () => {
  console.log('knowledge-graph core tests');

  // ─── tokenize ───────────────────────────────────────────────────────────
  test('tokenize lowercases, splits on non-alphanumerics, drops stop-words and 1-char tokens', () => {
    const toks = kg.tokenize('The Refund-Policy is X, valid for 30 days!');
    assert.ok(toks.includes('refund'), 'has refund');
    assert.ok(toks.includes('policy'), 'has policy');
    assert.ok(toks.includes('30'), 'keeps numbers');
    assert.ok(!toks.includes('the'), 'drops stop-word "the"');
    assert.ok(!toks.includes('is'), 'drops stop-word "is"');
    assert.ok(!toks.includes('x'), 'drops 1-char token');
  });

  test('tokenize keeps words in any script, with their marks, and pairs Chinese and Japanese characters', () => {
    // Value: protects=a document in Arabic, Hindi, Chinese or an accented language is searchable by its words; fails_when=tokenize keeps only a-z and 0-9; why_new=those documents had no tokens, so keyword search never found them; seam=none
    assert.deepStrictEqual(kg.tokenize('سياسة الاسترداد'), ['سياسة', 'الاسترداد'], 'Arabic words');
    assert.deepStrictEqual(kg.tokenize('वापसी नीति'), ['वापसी', 'नीति'], 'Hindi words keep their vowel signs');
    assert.deepStrictEqual(kg.tokenize('Rückgabe réception'), ['rückgabe', 'réception'], 'accented letters stay in the word');
    assert.deepStrictEqual(kg.tokenize('Re\u0301ception'), ['r\u00e9ception'], 'a decomposed accent matches the composed one');
    assert.deepStrictEqual(kg.tokenize('退款政策'), ['退', '款', '政', '策', '退款', '款政', '政策'], 'a Chinese run becomes its characters and character pairs');
    assert.deepStrictEqual(kg.tokenize('税'), ['税'], 'a lone Chinese character is a token');
    assert.deepStrictEqual(kg.tokenize('SKU42の在庫'), ['sku42', 'の', '在', '庫', 'の在', '在庫'], 'Latin and Japanese in one word split apart');
    assert.deepStrictEqual(kg.tokenize('コーヒー'), ['コ', 'ー', 'ヒ', 'ー', 'コー', 'ーヒ', 'ヒー'], 'the Japanese long vowel mark stays in its word');
    assert.deepStrictEqual(kg.tokenize('It\u2019s the refund policy'), kg.tokenize("It's the refund policy"), 'a curly quote changes no English token');
  });

  test('search finds documents written in Arabic, Hindi, Chinese and German by their own words', () => {
    // Value: protects=company knowledge in the owner's language is found by keyword search; fails_when=non Latin text indexes no tokens; why_new=search returned nothing for these documents; seam=a temp store
    const root = tmpRoot();
    const docs = {
      ar: ['سياسة الاسترداد: يمكن للعملاء استرداد أموالهم خلال ثلاثين يوما.', 'الاسترداد'],
      hi: ['वापसी नीति: ग्राहक तीस दिनों के भीतर पैसे वापस पा सकते हैं।', 'वापसी नीति'],
      zh: ['退款政策：客户可在三十天内退款。', '退款'],
      de: ['Rückgabe innerhalb von dreißig Tagen möglich.', 'Rückgabe'],
    };
    const ids = {};
    for (const [lang, [text]] of Object.entries(docs)) ids[lang] = kg.ingest(root, { text, title: `policy ${lang}` }).docId;
    for (const [lang, [, query]] of Object.entries(docs)) {
      const hits = kg.search(root, query);
      assert.strictEqual(hits.length, 1, `${lang}: exactly its own document`);
      assert.strictEqual(hits[0].docId, ids[lang], `${lang}: the right document`);
    }
    const tax = kg.ingest(root, { text: '消费税的申报流程说明', title: 'tax' }).docId;
    assert.deepStrictEqual(kg.search(root, '税').map((h) => h.docId), [tax], 'one Chinese character finds the word it is part of');
  });

  // ─── detectModality ─────────────────────────────────────────────────────
  test('detectModality buckets by extension', () => {
    assert.strictEqual(kg.detectModality('a/b/notes.md'), 'text');
    assert.strictEqual(kg.detectModality('logo.PNG'), 'image');
    assert.strictEqual(kg.detectModality('report.pdf'), 'pdf');
    assert.strictEqual(kg.detectModality('data.csv'), 'sheet');
    assert.strictEqual(kg.detectModality('main.ts'), 'code');
    assert.strictEqual(kg.detectModality('weird.xyz'), 'text'); // unknown → text
  });

  // ─── chunkText ──────────────────────────────────────────────────────────
  test('chunkText returns one chunk for short text and multiple for long text', () => {
    assert.deepStrictEqual(kg.chunkText(''), []);
    assert.deepStrictEqual(kg.chunkText('short note'), ['short note']);
    const long = ('paragraph alpha. '.repeat(120) + '\n\n').repeat(6); // ~12k chars
    const chunks = kg.chunkText(long, { size: 1000, overlap: 100 });
    assert.ok(chunks.length > 5, `expected several chunks, got ${chunks.length}`);
    for (const c of chunks) assert.ok(c.length <= 1500, `chunk under cap: ${c.length}`);
  });

  test('chunkText always terminates and covers the text (deterministic)', () => {
    const text = 'word '.repeat(5000);
    const a = kg.chunkText(text, { size: 800, overlap: 120 });
    const b = kg.chunkText(text, { size: 800, overlap: 120 });
    assert.deepStrictEqual(a, b, 'deterministic');
    assert.ok(a.join(' ').includes('word'), 'covers content');
  });

  // ─── scoreChunk ─────────────────────────────────────────────────────────
  test('scoreChunk: 0 when no term matches, higher for title + phrase matches', () => {
    const terms = kg.tokenize('refund policy');
    const none = kg.scoreChunk({ title: 'Holidays', text: 'office closed friday' }, terms, 'refund policy');
    assert.strictEqual(none, 0);
    const body = kg.scoreChunk({ title: 'Holidays', text: 'our refund policy is generous' }, terms, 'refund policy');
    const titled = kg.scoreChunk({ title: 'Refund Policy', text: 'our refund policy is generous' }, terms, 'refund policy');
    assert.ok(body > 0, 'body match scores');
    assert.ok(titled > body, 'title match boosts above body-only');
  });

  test('scoreChunk: title matching does not match partial words', () => {
    const terms = kg.tokenize('art');

    const partial = kg.scoreChunk(
      { title: 'Article Guide', text: 'art is discussed here' },
      terms,
      'art'
    );

    const exact = kg.scoreChunk(
      { title: 'Art Guide', text: 'art is discussed here' },
      terms,
      'art'
    );

    assert.ok(exact > partial, 'whole-word title match should receive a boost');
  });

  // ─── stem ───────────────────────────────────────────────────────────────
  test('stem: a plural or a tense gives the same key as its word', () => {
    const families = [
      ['refund', 'refunds', 'refunded', 'refunding'],
      ['ship', 'ships', 'shipped', 'shipping'],
      ['price', 'prices', 'priced', 'pricing'],
      ['invoice', 'invoices', 'invoiced', 'invoicing'],
      ['bill', 'bills', 'billed', 'billing'],
      ['order', 'orders', 'ordered', 'ordering'],
      ['book', 'books', 'booked', 'booking'],
      ['policy', 'policies'],
      ['study', 'studies', 'studied'],
      ['class', 'classes'],
      ['lens', 'lenses'],
      ['business', 'businesses']
    ];
    for (const words of families) {
      assert.strictEqual(new Set(words.map(kg.stem)).size, 1, `${words.join(', ')} → ${words.map(kg.stem).join(', ')}`);
    }
  });

  test('stem: short words, other endings, numbers and other scripts stay apart', () => {
    for (const w of ['status', 'analysis', 'speed', 'string', 'thing', 'art', 'sku42', 'réception', 'الاسترداد', '退款']) {
      assert.strictEqual(kg.stem(w), w, `${w} is left as it is`);
    }
    assert.notStrictEqual(kg.stem('article'), kg.stem('art'), 'a longer word is not cut down to a shorter one');
    for (const w of ['refunds', 'shipping', 'lenses', 'priced', 'studies', 'businesses', 'addresses']) {
      assert.strictEqual(kg.stem(kg.stem(w)), kg.stem(w), `stemming ${w} again changes nothing`);
    }
  });

  test('stem: a word is never cut into a different short word', () => {
    // Review of #684: a stem under 4 letters is another real word, and a few longer words fold into one.
    const apart = [
      ['time', 'tim'], ['times', 'tim'], ['timing', 'tim'], ['care', 'car'], ['caring', 'car'],
      ['rate', 'rat'], ['rating', 'rat'], ['site', 'sit'], ['sitting', 'sit'], ['code', 'cod'], ['coding', 'cod'],
      ['same', 'sam'], ['done', 'don'], ['made', 'mad'], ['news', 'new'], ['goods', 'good'], ['means', 'mean'],
      ['evening', 'even'], ['united', 'unit'], ['notes', 'not'], ['note', 'not']
    ];
    for (const [a, b] of apart) assert.notStrictEqual(kg.stem(a), kg.stem(b), `${a} must not meet ${b}`);
  });

  test('stem: numbers, other scripts and very long tokens come back as they are', () => {
    for (const w of ['12345', 'sku42', 'réception']) assert.strictEqual(kg.stem(w), w);
    const long = 'bed'.repeat(20) + 'ed';
    assert.strictEqual(kg.stem(long), long, 'a token past 32 letters is not stemmed');
  });

  test('scoreChunk: a plural in the title gets the title boost for its word', () => {
    const terms = kg.tokenize('refund');
    const plural = kg.scoreChunk({ title: 'Refunds', text: 'ask for a refund within thirty days' }, terms, 'refund');
    const other = kg.scoreChunk({ title: 'Returns', text: 'ask for a refund within thirty days' }, terms, 'refund');
    assert.ok(plural > other, 'Refunds in the title counts for refund');
  });

  test('makeSnippet: centres on the whole word that matched, not a word that contains its stem', () => {
    // Enough words in between that the first snippet's worth of text cannot hold both.
    const filler = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
    const text = `Apricot jam is on the shelf. ${filler(80, 'pad')} Our pricing changed in March.`;
    const snip = kg.makeSnippet(text, ['pric']);
    assert.ok(snip.includes('pricing changed'), 'the snippet shows the match');
    assert.ok(!snip.includes('Apricot'), 'not the word that holds the stem');
    const another = `We cannot ship another box today. ${filler(80, 'pad')} The notes are in the drawer.`;
    assert.ok(kg.makeSnippet(another, [kg.stem('notes')]).includes('notes are'), 'notes, not another or cannot');
    const ship = `Our relationship with the courier is good. ${filler(80, 'pad')} We ship on Mondays.`;
    assert.ok(kg.makeSnippet(ship, [kg.stem('shipping')]).includes('ship on Mondays'), 'ship, not relationship');
  });

  // ─── ingest → search round-trip: TEXT modality ──────────────────────────
  test('ingest a markdown doc, then search finds it with a snippet', () => {
    const root = tmpRoot();
    const src = writeFixture(root, 'refund-policy.md',
      '# Refund Policy 2026\n\nCustomers may request a full refund within 30 days of purchase. '
      + 'Refunds for enterprise plans require manager approval.\n');
    const { docId, chunkCount, meta } = kg.ingest(root, { srcPath: src, tags: ['policy', 'support'] });
    assert.ok(docId, 'returns a docId');
    assert.ok(chunkCount >= 1, 'at least one chunk');
    assert.strictEqual(meta.modality, 'text');
    assert.strictEqual(meta.title, 'Refund Policy 2026', 'title derived from heading');
    // store layout exists
    assert.ok(fs.existsSync(path.join(root, 'index.jsonl')), 'index.jsonl written');
    assert.ok(fs.existsSync(path.join(root, 'docs', docId, 'text.md')), 'text.md written');
    assert.ok(fs.existsSync(path.join(root, 'docs', docId, 'meta.json')), 'meta.json written');
    assert.ok(fs.existsSync(path.join(root, 'docs', docId, 'original.md')), 'original copied');

    const hits = kg.search(root, 'refund within 30 days');
    assert.ok(hits.length >= 1, 'finds the doc');
    assert.strictEqual(hits[0].docId, docId);
    assert.ok(/refund/i.test(hits[0].snippet), 'snippet contains the match');
  });

  // ─── ingest → search round-trip: IMAGE modality (metadata-level) ────────
  test('ingest an image by metadata (no OCR) and find it by caption/tags', () => {
    const root = tmpRoot();
    // a tiny fake binary file standing in for an image artifact
    const img = path.join(root, 'org-chart.png');
    fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const { docId, meta } = kg.ingest(root, {
      srcPath: img, title: 'Company Org Chart',
      caption: 'Engineering reports to the CTO; Sales reports to the CRO.',
      tags: ['orgchart', 'leadership']
    });
    assert.strictEqual(meta.modality, 'image');
    assert.strictEqual(meta.extractor, 'image-meta@1');
    assert.ok(fs.existsSync(path.join(root, 'docs', docId, 'original.png')), 'binary retained for future OCR');

    const byCaption = kg.search(root, 'who does engineering report to');
    assert.ok(byCaption.some((h) => h.docId === docId), 'found via caption text');
    const byTag = kg.search(root, 'orgchart leadership');
    assert.ok(byTag.some((h) => h.docId === docId), 'found via tags');
  });

  // ─── list / getDoc / removeDoc ──────────────────────────────────────────
  test('list, get, and remove manage the corpus and prune the index', () => {
    const root = tmpRoot();
    const a = kg.ingest(root, { text: 'Alpha document about onboarding new hires.', title: 'Onboarding' });
    const b = kg.ingest(root, { text: 'Beta document about the deployment runbook.', title: 'Runbook' });

    const docs = kg.list(root);
    assert.strictEqual(docs.length, 2, 'two docs listed');

    const got = kg.getDoc(root, a.docId);
    assert.ok(got && /onboarding/i.test(got.text), 'getDoc returns full text');
    assert.strictEqual(kg.getDoc(root, 'nope'), null, 'unknown id → null');

    assert.strictEqual(kg.removeDoc(root, a.docId), true);
    assert.strictEqual(kg.list(root).length, 1, 'one doc after remove');
    assert.strictEqual(kg.search(root, 'onboarding').length, 0, 'removed doc no longer searchable');
    assert.ok(kg.search(root, 'deployment runbook').some((h) => h.docId === b.docId), 'other doc intact');

    const s = kg.stats(root);
    assert.strictEqual(s.docCount, 1);
  });

  test('search returns [] for empty query or empty store', () => {
    const root = tmpRoot();
    assert.deepStrictEqual(kg.search(root, 'anything'), [], 'empty store');
    kg.ingest(root, { text: 'hello world', title: 'Greeting' });
    assert.deepStrictEqual(kg.search(root, '   '), [], 'blank query');
  });

  // ─── search: repeated words and overlapping chunks ──────────────────────
  // chunkText carries DEFAULT_CHUNK_OVERLAP chars into the next chunk, so a passage near a
  // chunk edge sits in two chunks. These layouts are built from the chunker itself and
  // checked, so a change to the chunk size fails here rather than quietly testing nothing.
  const filler = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
  const padTo = (len) => { let pad = ''; for (let i = 0; pad.length < len; i++) pad += `w${i} `; return pad; };

  test('search: a word typed more than once scores as it does typed once', () => {
    const root = tmpRoot();
    kg.ingest(root, { title: 'Shipping', text: 'We ship in three days. Shipping is free over fifty dollars.' });
    // The exact phrase bonus is about the phrase as typed, so these queries are not phrases in the text.
    const once = kg.search(root, 'free shipping')[0].score;
    assert.strictEqual(kg.search(root, 'free shipping shipping free')[0].score, once);
    assert.strictEqual(kg.search(root, 'free free free shipping')[0].score, once);
  });

  test('search: a plural or a tense finds the word it comes from', () => {
    const root = tmpRoot();
    const refund = kg.ingest(root, { title: 'Returns', text: 'A customer can ask for a refund within thirty days.' });
    const ship = kg.ingest(root, { title: 'Delivery', text: 'We ship every weekday from the Leeds warehouse.' });
    // The match sits past the first snippet's worth of text, so the snippet has to find it.
    const policy = kg.ingest(root, { title: 'Handbook', text: `${filler(60, 'intro')} Read the staff policies before the first shift.` });
    assert.strictEqual(kg.search(root, 'refunds')[0]?.docId, refund.docId, 'refunds finds refund');
    assert.strictEqual(kg.search(root, 'shipping')[0]?.docId, ship.docId, 'shipping finds ship');
    const hits = kg.search(root, 'policy');
    assert.strictEqual(hits[0]?.docId, policy.docId, 'policy finds policies');
    assert.ok(hits[0].snippet.includes('policies'), 'the snippet shows the word that matched');
  });

  test('search: a word typed in two forms scores as it does typed once', () => {
    const root = tmpRoot();
    kg.ingest(root, { title: 'Orders', text: 'A late order gets a refund and a note from the owner.' });
    const once = kg.search(root, 'late refunds')[0].score;
    assert.strictEqual(kg.search(root, 'late refund refunds')[0].score, once);
  });

  test('search: a passage inside the overlap of two chunks comes back once', () => {
    const sentence = 'The quarterly zebrafish audit happens in March.';
    let inTwoChunks = 0;
    for (let at = 900; at <= 1190; at += 10) {
      const text = `${padTo(at)}${sentence} ${filler(500, 'z')}`;
      const held = kg.chunkText(text).filter((c) => c.includes(sentence)).length;
      if (held < 2) continue;
      inTwoChunks++;
      const root = tmpRoot();
      kg.ingest(root, { title: 'Audit', text });
      const hits = kg.search(root, 'zebrafish audit');
      assert.strictEqual(hits.length, 1, `sentence at ${at}, held by ${held} chunks: one result, not ${hits.length}`);
    }
    assert.ok(inTwoChunks > 0, 'the sweep put the sentence in the overlap of two chunks');
  });

  test('search: a skipped duplicate frees its slot for the next result', () => {
    const sentence = 'The quarterly zebrafish audit happens in March.';
    const root = tmpRoot();
    const text = `${padTo(1100)}${sentence} ${filler(500, 'z')}`;
    assert.ok(kg.chunkText(text).filter((c) => c.includes(sentence)).length > 1, 'layout puts the sentence in two chunks');
    kg.ingest(root, { title: 'Audit', text });
    kg.ingest(root, { title: 'Other', text: 'A zebrafish audit checklist for the lab.' });
    const hits = kg.search(root, 'zebrafish audit', { limit: 2 });
    assert.strictEqual(hits.length, 2, 'two results asked for, two different passages returned');
    assert.strictEqual(new Set(hits.map((h) => h.docId)).size, 2);
  });

  test('search: neighbouring chunks that each match in their own text both come back', () => {
    const root = tmpRoot();
    const text = `zebrafish ${padTo(1300)}zebrafish ${filler(400, 'q')}`;
    const chunks = kg.chunkText(text);
    assert.ok(chunks[0].includes('zebrafish') && chunks[1].includes('zebrafish'), 'layout: the word is in chunks 0 and 1');
    kg.ingest(root, { title: 'Lab', text });
    const idx = kg.search(root, 'zebrafish').map((h) => h.chunkIdx).sort();
    assert.deepStrictEqual(idx.slice(0, 2), [0, 1]);
  });

  test('search: a chunk that holds the only place two query words meet is kept', () => {
    // Chunks 0 and 2 each match one word many times; chunk 1 holds the first word in its overlap
    // with chunk 0 and the second in its overlap with chunk 2, so it ranks last. Neither
    // neighbour alone has both words, so chunk 1 must not be dropped.
    const text = `${'foo '.repeat(100)}${padTo(700)}foo ${padTo(1000)}bar ${padTo(150)}${'bar '.repeat(100)}`;
    const chunks = kg.chunkText(text);
    assert.ok(chunks.length >= 3, `layout: three chunks, got ${chunks.length}`);
    assert.ok(/foo/.test(chunks[0]) && !/bar/.test(chunks[0]), 'layout: chunk 0 has foo only');
    assert.ok(/foo/.test(chunks[1]) && /bar/.test(chunks[1]), 'layout: chunk 1 has both');
    assert.ok(/bar/.test(chunks[2]) && !/foo/.test(chunks[2]), 'layout: chunk 2 has bar only');
    const root = tmpRoot();
    kg.ingest(root, { title: 'Words', text });
    const hits = kg.search(root, 'foo bar');
    assert.strictEqual(hits[hits.length - 1].chunkIdx, 1, 'chunk 1 ranks last');
    assert.deepStrictEqual(hits.map((h) => h.chunkIdx).sort(), [0, 1, 2]);
  });

  test('search: a word the shared edge cuts through is still found in the chunk that holds it whole', () => {
    // The next chunk can start partway into a word, so it holds only the end of "zebrafish".
    // The chunk with the whole word must stay in the results even though its neighbour, which
    // ranks higher on another word, shares the text around it.
    let cut = null;
    for (let at = 1000; at <= 1190 && !cut; at++) {
      const text = `${padTo(at)}zebrafish ${filler(40, 'x')} ${'audit '.repeat(6)}${filler(300, 'z')}`;
      const next = kg.chunkText(text)[1];
      if (/^[a-z]{1,8}fish /.test(next) && !next.startsWith('zebrafish')) cut = text;
    }
    assert.ok(cut, 'layout: found a position where chunk 1 starts partway into the word');
    const root = tmpRoot();
    kg.ingest(root, { title: 'Lab', text: cut });
    const hits = kg.search(root, 'zebrafish audit');
    assert.deepStrictEqual(hits.map((h) => h.chunkIdx).sort().slice(0, 2), [0, 1]);
    assert.strictEqual(hits[0].chunkIdx, 1, 'the chunk matching audit ranks first');
  });

  // ─── the real agent CLI (out-of-process retrieval path) ─────────────────
  console.log('knowledge-graph agent CLI (kg.cjs) tests');

  test('agent runs `kg search` against KG_ROOT and gets ranked, attributed results', () => {
    const root = tmpRoot();
    kg.ingest(root, {
      srcPath: writeFixture(root, 'pto.md',
        '# PTO Policy\n\nFull-time employees accrue 20 days of paid time off per year. '
        + 'Unused PTO rolls over up to 5 days.\n'),
      tags: ['hr', 'pto']
    });
    const res = spawnSync(process.execPath, [CLI, 'search', 'how much paid time off'],
      { encoding: 'utf8', env: { ...process.env, KG_ROOT: root } });
    assert.strictEqual(res.status, 0, `exit 0 (stderr: ${res.stderr})`);
    assert.ok(/PTO Policy/.test(res.stdout), 'CLI surfaces the title');
    assert.ok(/20 days/.test(res.stdout), 'CLI surfaces the matching passage');
    assert.ok(/id:/.test(res.stdout), 'CLI surfaces a doc id for `kg get`');
  });

  test('agent `kg search --json` is machine-parseable', () => {
    const root = tmpRoot();
    kg.ingest(root, { text: 'The wifi password is hunter2 for the guest network.', title: 'Wifi' });
    const res = spawnSync(process.execPath, [CLI, 'search', 'guest wifi password', '--json'],
      { encoding: 'utf8', env: { ...process.env, KG_ROOT: root } });
    assert.strictEqual(res.status, 0, `exit 0 (stderr: ${res.stderr})`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed) && parsed.length >= 1, 'JSON array of hits');
    assert.strictEqual(parsed[0].title, 'Wifi');
  });

  test('agent CLI degrades gracefully when KG_ROOT is unset (flag off)', () => {
    const env = { ...process.env };
    delete env.KG_ROOT;
    const res = spawnSync(process.execPath, [CLI, 'search', 'anything'], { encoding: 'utf8', env });
    assert.strictEqual(res.status, 0, 'exits 0 (non-fatal) when KG is off');
    assert.ok(/not configured|off|unavailable/i.test(res.stderr + res.stdout), 'explains it is off');
  });

  // ─── summary ────────────────────────────────────────────────────────────
  if (failures > 0) {
    console.log(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll knowledge-graph tests passed');
})();
