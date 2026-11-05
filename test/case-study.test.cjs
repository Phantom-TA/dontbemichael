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
  assert.doesNotMatch(page(facts()), /<section class="quote"/, 'no quote block without the owner\'s words');
});

test('with the name switch off the page hides the name, logo and website (D8)', () => {
  const f = facts({ showName: false, logo: 'data:image/png;base64,AAAA', palette: { hero: '#6B3F1D', tint: '#F6EEE6', line: '#E8D9CA', away: '#C9782F' } });
  const html = page(f, edits(f, { quote: 'The team keeps up with the mail' }));
  assert.doesNotMatch(html, /Harbor Bakery|harborbakery|<img/);
  assert.match(html, /The Don&#39;t Be Michael team at a bakery in Austin handled|The Don't Be Michael team at a bakery in Austin handled/);
  assert.match(html, /Bakery in Austin/);
  assert.match(html, /--hero:#1E1B2E/, 'our ink when the name, and so the logo, is hidden');
  assert.match(html, /<figcaption><div class="av">[^<]*<\/div><span>The owner<\/span><\/figcaption>/);
  assert.match(html, /Run your office like a bakery in Austin\./, 'the closing reads as a sentence with the type and city');
  assert.equal(cs.namesBusiness('We are Harbor Bakery', f), true);
  assert.equal(cs.namesBusiness('We are a bakery', f), false);
});

test('every team member is on the page (D27); text is escaped; zero figures are left out', () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, name: `M<${i}>`, role: 'Role', jobs: [], figure: null, isMichael: false }));
  const f = facts({ members: many, figures: { ...facts().figures, task: 0 } });
  const html = page(f, edits(f, { about: '<script>alert(1)</script>' }));
  assert.equal((html.match(/class="m-card[ "]/g) || []).length, 11);
  assert.doesNotMatch(html, /\.page\{[^}]*overflow:hidden/, 'nothing is cut off at the page end');
  assert.match(html, /\.m-card,[^{]*\{break-inside:avoid\}/, 'a member card never splits across pages of the PDF copy');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /M&lt;0&gt;/);
  assert.doesNotMatch(html, /tasks finished/);
});

test('the team chart shows how the office is set up: owner, Michael, then each member with jobs, tools and number (D28)', () => {
  const f = facts({
    members: [
      { ...facts().members[0], schedules: [{ label: 'Morning standup', when: 'Weekdays at 08:00' }] },
      { ...facts().members[1], tools: ['Email', 'QuickBooks'], schedules: [1, 2, 3, 4].map((i) => ({ label: `Job ${i}`, when: 'Every day at 07:00' })) }
    ]
  });
  const html = page(f);
  const org = html.match(/<div class="org">([\s\S]*?)<\/section>/)[1];
  assert.ok(org.indexOf('Dana Reyes') < org.indexOf('Michael') && org.indexOf('Michael') < org.indexOf('Pam'), 'owner, then Michael, then the team');
  assert.match(org, /class="m-card lead"/);
  assert.match(org, /<b>Morning standup<\/b><span>Weekdays at 08:00<\/span>/);
  assert.equal((org.match(/<li><b>Job /g) || []).length, cs.CARD_JOBS, 'at most three jobs on a card');
  assert.match(org, /class="more">and 1 more</);
  assert.match(org, /<i>Email<\/i><i>QuickBooks<\/i>/);
  assert.match(org, /<span>emails<\/span><b>640<\/b>/);
  assert.match(html, /<dt>Connected<\/dt><dd><span class="pills"><i>Email<\/i><i>QuickBooks<\/i><\/span><\/dd>/, 'the snapshot lists what the team is connected to');
  assert.match(html, /<dt>Don't Be Michael team<\/dt><dd>2 members<\/dd>/);
  assert.match(html, new RegExp(`href="${cs.SITE_URL}"`), 'the call to action goes to our site');
});

test('the Before chapter shows only with words, and chapters number in order (D28)', () => {
  const none = page(facts(), edits(facts(), { about: '' }));
  assert.doesNotMatch(none, /ch-before/);
  assert.match(none, /ch-team"><div class="wrap"><div class="ch-label"><div class="num">01</);
  const both = page(facts(), edits(facts(), { about: 'The inbox filled faster than anyone could clear it' }));
  assert.match(both, /ch-before"><div class="wrap"><div class="ch-label"><div class="num">01<\/div><h2>Before<\/h2>/);
  assert.match(both, /ch-result"><div class="wrap"><div class="ch-label"><div class="num">03</);
});

test('the web page goes narrow on a phone; the PDF copy is the same page zoomed to the paper (D28)', () => {
  const web = page(facts());
  assert.match(web, /@media \(max-width:760px\)/);
  assert.match(web, /<meta name="viewport"/);
  assert.doesNotMatch(web, /@page/);
  const print = cs.pageHtml(facts(), edits(facts()), { fontCss: '', mode: 'print' });
  assert.match(print, /@page\{size:letter;margin:0\.45in 0\}/);
  assert.match(print, new RegExp(`\\.page\\{width:${cs.PAGE_W}px;zoom:0\\.78`));
  assert.doesNotMatch(print, /@media/, 'print never takes the phone layout');
});

test("a job's times read in the page's language", () => {
  assert.equal(cs.caseWhen({ intervalMs: 0, weekly: { days: [1, 2, 3, 4, 5], minute: 480 } }, 'en'), 'Weekdays at 08:00');
  assert.equal(cs.caseWhen({ intervalMs: 7_200_000 }, 'en'), 'Every 2h');
  assert.equal(cs.caseWhen({ intervalMs: 0, times: [{ kind: 'at', days: [0, 1, 2, 3, 4, 5, 6], minute: 420 }] }, 'zh-CN'), '每天 07:00');
  assert.match(cs.caseWhen({ intervalMs: 0, weekly: { days: [1], minute: 540 } }, 'ar'), /الاثنين الساعة 09:00/);
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
  }
  assert.match(page(f), /Don't Be Michael case study|Don&#39;t Be Michael case study/, 'the label above the headline names the product');
});
