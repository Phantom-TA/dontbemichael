'use strict';

// The case study's page model (docs/designs/case-study.md): every number on
// the page is a Pulse figure (D4), the headline's number can't be typed (D16,
// D20), the prompt and the page read one facts type, and the logo colour keeps
// white text readable (D17).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const cs = loadTs('src/shared/caseStudy.ts');

function facts(over = {}) {
  return {
    lang: 'en', paper: 'letter', showName: true,
    businessName: 'Harbor Bakery', website: 'https://harborbakery.example', businessType: 'Bakery', city: 'Austin',
    industry: 'Food', hours: 'Mon to Sat', offer: 'Bread and pastries for walk in customers and cafes',
    ceoName: 'Dana Reyes',
    members: [
      { id: 'god', name: 'Michael', role: 'Office manager', jobs: [], figure: { kind: 'routed', count: 158 }, isMichael: true },
      { id: 'pam', name: 'Pam', role: 'Front desk', roleDescription: 'Answers the inbox and sorts mail', jobs: ['Morning inbox'], figure: { kind: 'email', count: 640 }, isMichael: false }
    ],
    figures: { email: 1284, sent: 0, task: 96, check: 340, routed: 158, ranMs: 410 * 3_600_000, awayMs: 286 * 3_600_000, spendUsd: 184.4 },
    days: [{ day: '2026-10-04', ms: 9 * 3_600_000, awayMs: 6 * 3_600_000 }],
    range: { from: '2026-10-04', to: '2026-11-02', days: 30 },
    appVersion: '0.3.5',
    ...over
  };
}
const edits = (f, over = {}) => ({ ...cs.startingEdits(f, { headlines: {}, team: {} }), ...over });
const page = (f, e) => cs.pageHtml(f, e ?? edits(f), { fontCss: '' });

test('numbers in any script, and quantity words, count as numbers', () => {
  for (const t of ['saved 10 hours', 'twelve cafes', 'dozens of orders', 'half the inbox', '٣ طلبات']) assert.equal(cs.hasNumber(t, 'en'), true, t);
  assert.equal(cs.hasNumber('sorts the morning inbox', 'en'), false);
  assert.equal(cs.hasNumber('أكثر من مئة طلب', 'ar'), true);
  assert.equal(cs.hasNumber('يرد على الرسائل', 'ar'), false);
  assert.equal(cs.hasNumber('处理了三个小时', 'zh-CN'), true);
  assert.equal(cs.hasNumber('一起整理邮件', 'zh-CN'), false, 'a numeral inside an ordinary word is not a number');
});

test('headline choices and the band come from nonzero figures; spend is always on the page', () => {
  const f = facts();
  assert.deepEqual(cs.headlineChoices(f.figures), ['email', 'task', 'away']);
  assert.deepEqual(cs.bandFigures({ ...f.figures, email: 0, task: 0 }), ['away', 'check']);
  const html = page(facts({ figures: { ...f.figures, spendUsd: 0 } }));
  assert.match(html, /\$0\.00/, 'spend shows even at zero (D14)');
  assert.match(html, /for the whole team, all 30 days/);
  assert.equal(cs.hasWork({ ...f.figures, email: 0, task: 0, check: 0, sent: 0 }), false);
});

test("a member's figure is their largest kind, Michael's is routed, none when nothing counted", () => {
  assert.deepEqual(cs.memberFigure({ email: 3, sent: 9, task: 1, check: 0 }, null), { kind: 'sent', count: 9 });
  assert.deepEqual(cs.memberFigure({ email: 0, sent: 0, task: 0, check: 0 }, 12), { kind: 'routed', count: 12 });
  assert.equal(cs.memberFigure({ email: 0, sent: 0, task: 0, check: 0 }, null), null);
  assert.equal(cs.memberFigure({ email: 5, sent: 0, task: 0, check: 0 }, 0), null);
});

test('a drafted part with a number is refused, the rest are kept', () => {
  const f = facts();
  const reply = 'Here you go:\n' + JSON.stringify({
    subtitle: "A bakery and its Don't Be Michael team",
    about: 'Saves 10 hours a week on email',
    why: 'Dozens of small tasks get done',
    headlines: { email: "Harbor Bakery's AI office handled {n} emails in a month", task: 'Finished {n} tasks and {n} more', away: 'Worked {n} hours, about 20 a day' },
    team: { pam: 'Answers order questions and sorts the morning inbox', god: 'Routes 5 requests an hour' }
  });
  const d = cs.parseDraft(reply, f);
  assert.equal(d.subtitle, "A bakery and its Don't Be Michael team");
  assert.equal(d.about, undefined);
  assert.equal(d.why, undefined, 'a quantity word is a number');
  assert.deepEqual(d.headlines.email, { before: "Harbor Bakery's AI office handled", after: 'emails in a month' });
  assert.equal(d.headlines.task, undefined, '{n} must appear exactly once');
  assert.equal(d.headlines.away, undefined, 'no other number in the headline');
  assert.deepEqual(Object.keys(d.team), ['pam']);
  assert.deepEqual(cs.missingParts(d, f).sort(), ['about', 'headline:away', 'headline:task', 'team:god', 'why'].sort());
  const merged = cs.mergeDrafts(d, { headlines: { task: { before: 'X', after: 'Y' } }, team: { god: 'Routes the work' }, about: 'B' });
  assert.equal(merged.subtitle, d.subtitle);
  assert.equal(merged.about, 'B');
  assert.equal(merged.team.god, 'Routes the work');
  assert.deepEqual(cs.parseDraft('not json at all', f), { headlines: {}, team: {} });
});

test('a fresh screen starts from the draft, built in headline words and role descriptions', () => {
  const f = facts();
  const e = cs.startingEdits(f, { headlines: {}, team: {} });
  assert.equal(e.headline.figure, 'email');
  assert.equal(e.headline.before, "The Don't Be Michael team at Harbor Bakery handled");
  assert.equal(e.headline.after, 'emails', 'no day count: every number on the page is a Pulse figure');
  assert.match(e.subtitle, /^Harbor Bakery runs its office with Don't Be Michael\.$/, 'built in subtitle names the product (D25)');
  assert.match(e.why, /Don't Be Michael/);
  assert.equal(e.team.pam, 'Answers the inbox and sorts mail', 'a missing team line starts from the role description');
  assert.equal(e.team.god, '');
  assert.equal(cs.startingEdits(f, { headlines: {}, team: {} }, 'away').headline.figure, 'away');
});

test("a number typed into the headline's words is caught; elsewhere it is the owner's (D20)", () => {
  const f = facts();
  const typed = { headline: { figure: 'email', before: 'We saved 20 hours and handled', after: 'emails' }, about: 'Baking since 1998', quote: 'I stopped at 5 am', team: { pam: 'Sorts mail' }, subtitle: '', why: '' };
  const r = cs.cleanEdits(f, typed);
  assert.equal(r.headlineNumber, true);
  assert.equal(r.edits.about, 'Baking since 1998');
  assert.equal(cs.cleanEdits(f, { ...typed, headline: { figure: 'email', before: 'We handled', after: 'emails' } }).headlineNumber, false);
  assert.equal(cs.cleanEdits(f, { ...typed, headline: { figure: 'sent', before: 'a', after: 'b' } }).edits.headline, null, 'a figure the period lacks is dropped');
  assert.equal(cs.cleanEdits(f, null).edits.headline, null);
});

test('the prompt reads only the allowed facts; the name is out with D8 off, the CEO always', () => {
  const p = cs.draftPrompt(facts());
  assert.match(p, /Harbor Bakery/);
  assert.match(p, /Bread and pastries/);
  assert.match(p, /scheduled jobs: Morning inbox/);
  assert.doesNotMatch(p, /Dana Reyes/);
  const hidden = cs.draftPrompt(facts({ showName: false }));
  assert.doesNotMatch(hidden, /Harbor Bakery|harborbakery/);
  assert.match(hidden, /Write no numbers at all/);
});

test("the page is read only, and the headline's number is Pulse's, between its words (D16, D22)", () => {
  const typed = edits(facts(), { headline: { figure: 'email', before: 'The AI office handled', after: 'emails' } });
  const html = page(facts(), typed);
  const h1 = html.match(/<h1 class="headline[^"]*">(.*?)<\/h1>/)[1];
  assert.match(h1, /^<span>The AI office handled<\/span> <span class="lock"[^>]*>1,284<\/span> <span>emails<\/span>$/);
  assert.doesNotMatch(html, /contenteditable|data-part/, 'nothing on the page is editable');
  assert.match(html, /\.lock\{font-weight:700;color:var\(--hl\)/, 'the number has no box, in the hero tint (D23)');
  assert.doesNotMatch(html, /\.mono,\.n,|\.n,\.t-n/, 'the band numbers are not in the mono face (its comma left a gap)');
  assert.match(html, /\.stat \.n\{[^}]*tabular-nums/);
  assert.doesNotMatch(page(facts()), /<figure class="quote/, 'no quote block without the owner\'s words');
});

test('with the name switch off the page hides the name, logo and website (D8)', () => {
  const f = facts({ showName: false, logo: 'data:image/png;base64,AAAA', palette: { hero: '#6B3F1D', tint: '#F6EEE6', line: '#E8D9CA', away: '#C9782F' } });
  const html = page(f, edits(f, { quote: 'The team keeps up with the mail' }));
  assert.doesNotMatch(html, /Harbor Bakery|harborbakery|<img/);
  assert.match(html, /The Don&#39;t Be Michael team at a bakery in Austin handled|The Don't Be Michael team at a bakery in Austin handled/);
  assert.match(html, /Bakery in Austin/);
  assert.match(html, /--hero:#1E1B2E/, 'our ink when the name, and so the logo, is hidden');
  assert.match(html, /<figcaption>The owner<\/figcaption>/);
  assert.equal(cs.namesBusiness('We are Harbor Bakery', f), true);
  assert.equal(cs.namesBusiness('We are a bakery', f), false);
});

test('every team member is on the page (D27); text is escaped; zero figures are left out', () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, name: `M<${i}>`, role: 'Role', jobs: [], figure: null, isMichael: false }));
  const f = facts({ members: many, figures: { ...facts().figures, task: 0 } });
  const html = page(f, edits(f, { about: '<script>alert(1)</script>' }));
  assert.equal((html.match(/class="t-row"/g) || []).length, 11);
  assert.doesNotMatch(html, /class="t-more"/);
  assert.match(html, /\.page\{[^}]*min-height:[^}]*\}/, 'at least a page, longer when needed');
  assert.doesNotMatch(html, /\.page\{[^}]*overflow:hidden/, 'nothing is cut off at the page end');
  assert.match(html, /\.t-row,[^{]*\{break-inside:avoid\}/, 'a member never splits across pages');
  assert.match(html, /\.t-row>\.t-work\{white-space:normal;[^}]*-webkit-line-clamp:2/, 'a member\'s work may take two lines, never cut to one (D26)');
  assert.match(html, /<span class="t-work">/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /M&lt;0&gt;/);
  assert.doesNotMatch(html, /tasks finished/);
});

test('Arabic mirrors the page; no away time names the strip by hours worked', () => {
  const f = facts({ lang: 'ar', figures: { ...facts().figures, awayMs: 0 } });
  const html = page(f, edits(f));
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /ساعات عمل المكتب/);
  assert.doesNotMatch(html, /class="legend"/);
});

test('the logo colour skips grey, white and see through pixels, and an edge never wins', () => {
  const px = (rgba, n) => Array.from({ length: n }, () => rgba).flat();
  assert.equal(cs.logoColour(px([128, 128, 128, 255], 100)), null, 'grey');
  assert.equal(cs.logoColour(px([255, 255, 255, 255], 100)), null, 'white');
  assert.equal(cs.logoColour(px([200, 40, 40, 20], 100)), null, 'transparent');
  const brown = cs.logoColour([...px([140, 80, 30, 255], 60), ...px([255, 255, 255, 255], 300), ...px([40, 90, 200, 255], 3)]);
  assert.match(brown, /^#[0-9A-F]{6}$/);
  const [r, , b] = [1, 3, 5].map((i) => parseInt(brown.slice(i, i + 2), 16));
  assert.ok(r > b, 'the brown, not the thin blue edge');
  assert.equal(cs.logoColour(px([40, 90, 200, 255], 2).concat(px([255, 255, 255, 255], 400))), null, 'too little colour to decide');
});

test('the hero keeps white text at 4.5:1 and its tint keeps labels readable', () => {
  for (const c of ['#FFD84D', '#7FD1FF', '#8C5A2B', '#FF5A5F', null]) {
    const p = cs.heroPalette(c);
    assert.ok(cs.contrast(p.hero, '#FFFFFF') >= 4.5, `${c} hero`);
    assert.ok(cs.contrast(p.tint, '#4A4660') >= 4.5, `${c} tint`);
    assert.ok(cs.contrast(p.tint, '#1E1B2E') >= 4.5);
    assert.ok(cs.contrast(p.highlight, p.hero) >= 3, `${c} headline number on the hero (large bold text)`);
    assert.notEqual(p.highlight.toUpperCase(), '#FFFFFF', 'a tint, not plain white');
  }
  assert.deepEqual(cs.heroPalette(null), cs.INK_PALETTE);
});

test('the email to us is in the app language and carries the take down promise (D10, D11)', () => {
  assert.match(cs.caseStudyEmail(facts()).body, /will take it down if I ask/);
  assert.match(cs.caseStudyEmail(facts({ lang: 'zh-CN' })).subject, /^客户案例/);
  assert.equal(cs.CASE_STUDY_TO, 'hello@dontbemichael.com');
});

test("the subtitle and the closing must name Don't Be Michael; every built in headline is free of typed numbers (D25)", () => {
  const f = facts();
  const d = cs.parseDraft(JSON.stringify({ subtitle: 'A bakery and its AI team', why: 'An AI team frees the owner', headlines: {}, team: {} }), f);
  assert.equal(d.subtitle, undefined, 'a generic AI team is refused');
  assert.equal(d.why, undefined);
  assert.ok(cs.missingParts(d, f).includes('subtitle'));
  assert.equal(cs.parseDraft(JSON.stringify({ subtitle: 'Runs on Don\u2019t Be Michael' }), f).subtitle, 'Runs on Don\u2019t Be Michael', 'a curly apostrophe counts');
  for (const lang of ['en', 'ar', 'zh-CN']) {
    const fl = facts({ lang });
    for (const k of cs.HEADLINE_FIGURES) {
      const h = cs.builtInHeadline(fl, k);
      assert.equal(cs.hasNumber(h.before + ' ' + h.after, lang), false, `${lang} ${k}`);
      assert.match(h.before, /Don't Be Michael/);
    }
    assert.match(cs.builtInSubtitle(fl), /Don't Be Michael/);
    assert.match(cs.builtInWhy(fl), /Don't Be Michael/);
    assert.equal(cs.cleanEdits(fl, cs.startingEdits(fl, { headlines: {}, team: {} })).headlineNumber, false, `${lang}: a built in headline never trips the number check`);
  }
  assert.match(page(f), /Don't Be Michael case study|Don&#39;t Be Michael case study/, 'the label above the headline names the product');
});
