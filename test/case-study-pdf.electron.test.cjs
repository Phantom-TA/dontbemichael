'use strict';

// The case study's printed page (docs/designs/case-study.md, eng pass, D27):
// a typical office (5 members, ordinary text) prints on one page; a big one
// (24 members, every part at its cap) lists every member and runs onto more
// pages rather than cutting anyone; at Letter and A4 in English, Arabic and
// Chinese. Arabic mirrors, the strip runs latest day on the left, and the
// headline keeps its number between its words. Real Chromium layout, so macOS
// only (platform scoped tests).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const cs = loadTs('src/shared/caseStudy.ts');
const root = path.resolve(__dirname, '..');

function fonts() {
  const f = (family, file, weight) => ({ family, weight, base64: fs.readFileSync(path.join(root, 'src/renderer/src/assets/fonts', file)).toString('base64') });
  return [f('Sora', 'sora-latin-var.woff2', '100 800'), f('IBM Plex Mono', 'ibm-plex-mono-regular.woff2', '400'), f('IBM Plex Mono', 'ibm-plex-mono-medium.woff2', '500')];
}

const FILL = {
  en: 'Answers order questions, sorts the morning inbox and keeps the supplier invoices filed on time for the owner every week',
  ar: 'يرد على أسئلة الطلبات ويرتب البريد الصباحي ويحفظ فواتير الموردين في موعدها للمالك كل أسبوع دون تأخير أو نسيان',
  'zh-CN': '回答订单问题，整理早上的收件箱，每周按时为老板归档供应商发票，从不延误也不遗漏任何一封邮件'
};
const fill = (lang, n) => { let s = ''; while ([...s].length < n) s += FILL[lang] + ' '; return [...s].slice(0, n).join(''); };

function build(lang, paper, size) {
  const big = size === 'big';
  const c = big ? cs.CAPS[lang] : Object.fromEntries(Object.entries(cs.CAPS[lang]).map(([k, v]) => [k, Math.floor(v / 2)]));
  const members = Array.from({ length: big ? 24 : 5 }, (_, i) => ({ id: `m${i}`, name: `Member${i}`, role: 'Bookkeeping lead', jobs: [], figure: { kind: 'email', count: 12345 }, isMichael: i === 0 }));
  const days = Array.from({ length: 31 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, ms: (8 + (i % 7)) * 3_600_000, awayMs: (3 + (i % 5)) * 3_600_000 }));
  const facts = {
    lang, paper, showName: true, businessName: 'Harbor Bakery and Cafe Company', website: 'harborbakeryandcafe.example', businessType: 'Bakery', city: 'San Francisco',
    members, figures: { email: 123456, sent: 23456, task: 34567, check: 4567, routed: 9999, ranMs: 744 * 3_600_000, awayMs: 500 * 3_600_000, spendUsd: 12345 },
    days, range: { from: '2026-10-01', to: '2026-10-31', days: 31 }, appVersion: '0.3.5',
    palette: cs.heroPalette('#8C5A2B')
  };
  const edits = {
    // The longest built in headline with a long business name: the owner can't shorten it (D24).
    headline: { figure: 'away', ...cs.builtInHeadline({ lang, showName: true, businessName: 'Harbor Bakery and Cafe Company' }, 'away') },
    subtitle: fill(lang, c.subtitle), about: fill(lang, c.about), quote: fill(lang, c.quote), why: fill(lang, c.why),
    team: Object.fromEntries(members.map((m) => [m.id, fill(lang, c.teamLine)]))
  };
  return cs.pageHtml(facts, edits, { fontCss: cs.fontFaceCss(fonts()) });
}

test('a typical case study prints on one page, a big team runs onto more pages with everyone listed', { skip: process.platform === 'darwin' ? false : 'macOS only (platform scoped tests)', timeout: 120000 }, async () => {
  // Value: protects=the one page promise and Arabic layout of the published page; fails_when=a cap or a style lets the worst case run onto a second page, or RTL stops mirroring; why_new=the unit tests can't lay out; seam=none; no_claim=Windows fonts (macOS only)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'case pdf '));
  try {
    for (const lang of ['en', 'ar', 'zh-CN']) for (const paper of ['letter', 'a4']) for (const size of ['typical', 'big']) fs.writeFileSync(path.join(dir, `${lang}-${paper}-${size}.html`), build(lang, paper, size));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures', 'case-study-pdf-main.cjs'), dir], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (s) => { output += s; });
    child.stderr.on('data', (s) => { output += s; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`PDF fixture timed out:\n${output}`)); }, 100000);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (c) => { clearTimeout(timer); resolve(c); });
    });
    assert.equal(code, 0, output);
    const line = output.split('\n').find((l) => l.startsWith('RESULT '));
    assert.ok(line, output);
    const res = JSON.parse(line.slice(7));
    for (const [name, r] of Object.entries(res)) {
      const big = name.endsWith('-big.html');
      if (big) {
        assert.equal(r.rows, 24, `${name}: every member is on the page`);
        assert.equal(r.more, false, `${name}: no "and N more"`);
        assert.ok(r.pages >= 2, `${name} runs onto more pages (${r.pages})`);
      } else {
        assert.equal(r.rows, 5);
        assert.equal(r.pages, 1, `${name}: a typical office still prints on one page`);
      }
      assert.deepEqual(r.headline, ['words', 'lock', 'words'], `${name}: the number sits between the headline's words`);
      if (name.startsWith('ar-')) {
        assert.equal(r.dir, 'rtl');
        assert.equal(r.firstBarRight, true, `${name}: the first day is on the right, the latest on the left`);
      } else {
        assert.equal(r.firstBarRight, false);
      }
    }
    assert.equal(Object.keys(res).length, 12);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp folder */ }
  }
});
