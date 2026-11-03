'use strict';

// The case study's printed page (docs/designs/case-study.md, eng pass, EP-O6):
// the fullest page (8 team rows, every part at its cap, a quote) prints on one
// page at Letter and A4 in English, Arabic and Chinese; Arabic mirrors, the
// strip runs latest day on the left, and the headline keeps its number between
// its words. Real Chromium layout, so macOS only (platform scoped tests): the
// caps are tuned on the Mac's fonts for Chinese and Arabic.

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

function worst(lang, paper) {
  const c = cs.CAPS[lang];
  const members = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, name: `Member${i}`, role: 'Bookkeeping lead', jobs: [], figure: { kind: 'email', count: 12345 }, isMichael: i === 0 }));
  const days = Array.from({ length: 31 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, ms: (8 + (i % 7)) * 3_600_000, awayMs: (3 + (i % 5)) * 3_600_000 }));
  const facts = {
    lang, paper, showName: true, businessName: 'Harbor Bakery and Cafe Company', website: 'harborbakeryandcafe.example', businessType: 'Bakery', city: 'San Francisco',
    members, figures: { email: 123456, sent: 23456, task: 34567, check: 4567, routed: 9999, ranMs: 744 * 3_600_000, awayMs: 500 * 3_600_000, spendUsd: 12345 },
    days, range: { from: '2026-10-01', to: '2026-10-31', days: 31 }, appVersion: '0.3.5',
    palette: cs.heroPalette('#8C5A2B')
  };
  const edits = {
    headline: { figure: 'email', before: fill(lang, Math.floor(c.headlineWords / 2)), after: fill(lang, Math.ceil(c.headlineWords / 2)) },
    subtitle: fill(lang, c.subtitle), about: fill(lang, c.about), quote: fill(lang, c.quote), why: fill(lang, c.why),
    team: Object.fromEntries(members.map((m) => [m.id, fill(lang, c.teamLine)]))
  };
  return cs.pageHtml(facts, edits, { editable: false, fontCss: cs.fontFaceCss(fonts()) });
}

test('the fullest case study prints on one page in every language and paper', { skip: process.platform === 'darwin' ? false : 'macOS only (platform scoped tests)', timeout: 120000 }, async () => {
  // Value: protects=the one page promise and Arabic layout of the published page; fails_when=a cap or a style lets the worst case run onto a second page, or RTL stops mirroring; why_new=the unit tests can't lay out; seam=none; no_claim=Windows fonts (macOS only)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'case pdf '));
  try {
    for (const lang of ['en', 'ar', 'zh-CN']) for (const paper of ['letter', 'a4']) fs.writeFileSync(path.join(dir, `${lang}-${paper}.html`), worst(lang, paper));
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
    const over = Object.entries(res).filter(([, r]) => r.overflow).map(([n, r]) => `${n} by ${r.over}px ${JSON.stringify(r.parts)}`);
    assert.deepEqual(over, [], 'every page fits');
    for (const [name, r] of Object.entries(res)) {
      assert.equal(r.pages, 1, `${name} prints on one page`);
      assert.equal(r.overflow, false, `${name} fits without clipping`);
      assert.deepEqual(r.headline, ['words', 'lock', 'words'], `${name}: the number sits between the headline's words`);
      if (name.startsWith('ar-')) {
        assert.equal(r.dir, 'rtl');
        assert.equal(r.firstBarRight, true, `${name}: the first day is on the right, the latest on the left`);
      } else {
        assert.equal(r.firstBarRight, false);
      }
    }
    assert.equal(Object.keys(res).length, 6);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp folder */ }
  }
});
