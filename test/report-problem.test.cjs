'use strict';
// A prefilled problem report on every build (docs/designs/windows-11-installer.md,
// E4), from a hard to miss top bar button and Help ▸ Report a problem…, with a
// picture of the window saved to Downloads; no Beta anywhere (owner, 2026-10-26;
// docs/designs/report-problem-top-bar.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { reportProblemUrl } = loadTs('src/shared/reportProblem.ts');
const { createReporter, pictureName, CAPTURE_LIMIT_MS } = loadTs('src/main/reportProblem.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the report link fills the bug form\'s version and OS fields, and nothing else', () => {
  // Value: protects=reports arrive labeled by OS and version without private data; fails_when=the field ids drift from bug_report.yml, the OS value is not a dropdown option, or more goes in the URL; why_new=E4; seam=none
  const win = new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'win32', arch: 'x64', osVersion: '10.0.26100' }));
  assert.equal(win.pathname, '/agentvivekkumar/dontbemichael/issues/new');
  assert.deepEqual([...win.searchParams.keys()].sort(), ['app-version', 'os', 'os-version', 'template']);
  assert.equal(win.searchParams.get('os'), 'Windows');
  assert.equal(win.searchParams.get('template'), 'bug_report.yml');
  assert.equal(new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'darwin', arch: 'arm64' })).searchParams.get('os'), 'macOS (Apple Silicon)');
  assert.equal(new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'darwin', arch: 'x64' })).searchParams.get('os'), 'macOS (Intel)');
  const form = read('.github/ISSUE_TEMPLATE/bug_report.yml');
  for (const id of ['app-version', 'os', 'os-version']) assert.match(form, new RegExp(`id: ${id}\\b`), `${id} is a field of the form`);
  for (const os of ['macOS (Apple Silicon)', 'macOS (Intel)', 'Windows']) assert.ok(form.includes(`- ${os}`), `${os} is a dropdown option`);
});

// A reporter with fakes; every call is logged in order.
function fakeReporter(over = {}) {
  const log = [];
  const files = new Set(over.files ?? []);
  const deps = {
    capture: async () => new Uint8Array([1, 2, 3]),
    wait: () => new Promise(() => {}), // the limit never fires unless a test says so
    openExternal: async (url) => { log.push(['open', url]); },
    downloads: () => '/Users/me/Downloads',
    exists: (p) => files.has(p),
    writeFile: async (p, bytes) => { log.push(['write', p, bytes.length]); files.add(p); },
    showItemInFolder: (p) => { log.push(['show', p]); },
    now: () => new Date(2026, 9, 26, 20, 15, 42),
    urlInputs: () => ({ appVersion: '0.2.8', platform: 'darwin', arch: 'arm64', osVersion: '15.1' }),
    warn: (step) => { log.push(['warn', step]); },
    ...over.deps
  };
  return { reporter: createReporter(deps), log };
}
const steps = (log) => log.map((l) => l[0]);

test('one click opens the prefilled report, then saves the picture in Downloads and shows it', async () => {
  // Value: protects=the report opens first and the picture lands in Downloads and Finder; fails_when=the order changes or the picture is lost; why_new=new flow; seam=deps injected (production passes Electron's); no_claim=real capturePage and Finder (fakes)
  const { reporter, log } = fakeReporter();
  const r = await reporter.report({});
  assert.equal(r.ok, true);
  // The save joins with path.join, so Windows gets back slashes.
  assert.equal(await r.saving, path.join('/Users/me/Downloads', "Don't Be Michael report 2026-10-26 20.15.png"));
  assert.deepEqual(steps(log), ['open', 'write', 'show'], 'the report opens before anything is written');
  const url = new URL(log[0][1]);
  assert.equal(url.searchParams.get('app-version'), '0.2.8');
  assert.equal(url.searchParams.get('os'), 'macOS (Apple Silicon)');
  assert.equal(pictureName(new Date(2026, 0, 5, 9, 3), 3), "Don't Be Michael report 2026-01-05 09.03 3.png");
  assert.ok(!pictureName(new Date()).includes(':'), 'no colon: Windows refuses it in a file name');
});

test('no picture, an empty one, a failed one or a slow one never stops the report', async () => {
  // Value: protects=the report always opens and nothing empty is written; fails_when=a capture failure blocks or a late picture is written; why_new=E5; seam=deps injected; no_claim=real capture timing (fake wait)
  for (const capture of [async () => null, async () => new Uint8Array([]), async () => { throw new Error('gpu'); }]) {
    const { reporter, log } = fakeReporter({ deps: { capture } });
    const r = await reporter.report(null);
    assert.equal(r.ok, true);
    assert.equal(r.saving, undefined);
    assert.ok(steps(log).includes('open') && !steps(log).includes('write'));
  }
  // A capture that never settles: the limit passes, the report opens, and the
  // picture that arrives later is dropped.
  let late;
  let waited;
  const { reporter, log } = fakeReporter({ deps: {
    capture: () => new Promise((done) => { late = done; }),
    wait: (ms) => { waited = ms; return Promise.resolve(); }
  } });
  const r = await reporter.report({});
  assert.equal(waited, CAPTURE_LIMIT_MS);
  assert.equal(CAPTURE_LIMIT_MS, 3000);
  assert.deepEqual(steps(log), ['open']);
  late(new Uint8Array([9]));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(steps(log), ['open'], 'a late picture is never written');
  assert.equal(r.saving, undefined);
});

test('a picture never overwrites one already in Downloads', async () => {
  const base = path.join('/Users/me/Downloads', "Don't Be Michael report 2026-10-26 20.15");
  const { reporter } = fakeReporter({ files: [`${base}.png`, `${base} 2.png`] });
  const r = await reporter.report({});
  assert.equal(await r.saving, `${base} 3.png`);
  // A save that fails still leaves the report open; nothing is shown.
  const failing = fakeReporter({ deps: { writeFile: async () => { throw new Error('EACCES'); } } });
  const f = await failing.reporter.report({});
  assert.equal(f.ok, true);
  assert.equal(await f.saving, null);
  assert.deepEqual(steps(failing.log), ['open', 'warn']);
  // Two reports in the same minute picked the same name: wx refuses the second, which takes the next (review, 2026-10-27).
  const taken = new Set([`${base}.png`]);
  const racing = fakeReporter({ deps: { exists: () => false, writeFile: async (p) => { if (taken.has(p)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' }); taken.add(p); } } });
  assert.equal(await (await racing.reporter.report({})).saving, `${base} 2.png`);
});

test('a second click while a report starts is ignored; a failed open says so and frees the next click', async () => {
  // Value: protects=five fast clicks give one report and a failed open never sticks; fails_when=the in flight mark is lost or not cleared after a throw; why_new=new state; seam=deps injected; no_claim=none beyond protects
  let release;
  const { reporter, log } = fakeReporter({ deps: { openExternal: (url) => { log.push(['open', url]); return new Promise((done) => { release = done; }); } } });
  const first = reporter.report({});
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(await reporter.report({}), { ok: true, ignored: true });
  release();
  assert.equal((await first).ok, true);
  assert.equal(steps(log).filter((s) => s === 'open').length, 1);

  let fail = true;
  const broken = fakeReporter({ deps: { openExternal: async () => { if (fail) throw new Error('no browser'); } } });
  assert.deepEqual(await broken.reporter.report({}), { ok: false, error: 'no browser' });
  assert.ok(!steps(broken.log).includes('write'), 'no picture saved for a report that never opened');
  fail = false;
  assert.equal((await broken.reporter.report({})).ok, true, 'the next click works');
});

test('the top bar has a hard to miss Report a problem button and no Beta; Settings has neither', () => {
  // Value: protects=the button sits where Beta was, is clickable (not a drag handle), carries the public warning for keyboard and screen readers and says when it failed; fails_when=it moves out of the nodrag span, loses aria-description, or Beta returns; why_new=R1, R3, P1, F1; seam=none; no_claim=the look (hand check)
  const bar = read('src/renderer/src/shell/TopBar.tsx');
  const at = (needle) => bar.indexOf(needle);
  assert.ok(at('<span className="cth-titlebar-nodrag"') < at('<UpdateBadge />') && at('<UpdateBadge />') < at('<ReportProblemButton />') && at('<ReportProblemButton />') < at('<CliUpdateBadge />'),
    'after the version chip, inside the drag free span');
  const button = bar.slice(at('function ReportProblemButton'), at('function IconButton'));
  assert.match(button, /title=\{tip\}\s+aria-description=\{tip\}/);
  assert.match(button, /const tip = t\('shell\.reportProblemTip'\);/);
  assert.match(button, /background: 'var\(--cth-lemon\)', color: 'var\(--cth-on-accent\)'/, 'solid amber; coral stays Needs you\'s');
  assert.match(button, /<Icon name="flag"/);
  assert.match(button, /window\.cth\.reportProblem\(\)/);
  assert.match(button, /t\('shell\.reportProblemFailed'\)/);
  assert.match(button, /<span className="cth-sr-only" aria-live="polite">/);
  assert.match(button, /disabled=\{state === 'busy'\}/);
  assert.doesNotMatch(bar, /BetaPill|betaInfo|zIndex: 240/);
  const hero = read('src/renderer/src/components/SettingsHeroCard.tsx');
  assert.doesNotMatch(hero, /BetaPill|reportProblem/);
  assert.match(hero, /settingsHero\.whatsNew/);
  assert.match(hero, /settingsHero\.starOnGitHub/);
  assert.equal(fs.existsSync(path.resolve(__dirname, '..', 'src/renderer/src/components/BetaPill.tsx')), false);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    // Dashes in these strings are no-dashes.test.cjs's job.
    assert.ok(d.shell.reportProblem && d.shell.reportProblemTip && d.shell.reportProblemFailed, loc);
    assert.ok(!('beta' in d.settingsHero) && !('betaInfo' in d.settingsHero) && !('reportProblem' in d.settingsHero) && !('betaInfo' in d.shell), `${loc}: no Beta words left`);
  }
  assert.match(JSON.parse(read('src/renderer/src/i18n/locales/en.json')).shell.reportProblemTip, /GitHub[\s\S]*Downloads[\s\S]*public/);
});

test('Help ▸ Report a problem… and the button run the same reporter', () => {
  const main = read('src/main/index.ts');
  assert.equal((main.match(/createReporter</g) ?? []).length, 1, 'one reporter for both doors');
  assert.match(main, /role: 'help',\s+submenu: \[\{\s+label: 'Report a problem…',\s+click: \(_item, focused\) => \{ void reporter\.report\(focused instanceof BrowserWindow \? focused : mainWindow\); \}/);
  assert.match(main, /ipcMain\.handle\('app:reportProblem', async \(evt\) => \{\s+const r = await reporter\.report\(BrowserWindow\.fromWebContents\(evt\.sender\)\);/);
  assert.match(main, /writeFile: \(path, bytes\) => fsPromises\.writeFile\(path, bytes, \{ flag: 'wx' \}\)/);
  assert.match(main, /return image\.isEmpty\(\) \? null : image\.toPNG\(\);/);
  assert.match(read('src/preload/index.ts'), /reportProblem: \(\): Promise<\{ ok: boolean; error\?: string \}> =>\s+ipcRenderer\.invoke\('app:reportProblem'\)/);
});

test('the report link adds only this office\'s recent automatic report fingerprints', () => {
  // Value: protects=a person's report links to the automatic issue and still holds nothing private (E7, eng E-R5); fails_when=other text reaches the URL or the field id drifts; why_new=E7; seam=none; no_claim=GitHub prefilling the field
  const base = { appVersion: '0.2.9', platform: 'darwin', arch: 'arm64' };
  const u = new URL(reportProblemUrl({ ...base, fingerprints: ['0123456789ab', 'not a fingerprint /Users/jane', 'aaaaaaaaaaaa', 'b', 'c', 'd', 'e', 'f'] }));
  assert.equal(u.searchParams.get('logs'), 'Recent automatic reports: 0123456789ab, aaaaaaaaaaaa');
  assert.doesNotMatch(u.toString(), /jane|Users/);
  assert.equal(new URL(reportProblemUrl({ ...base, fingerprints: [] })).searchParams.has('logs'), false);
  const many = Array.from({ length: 9 }, (_, i) => String(i).repeat(12));
  assert.equal(new URL(reportProblemUrl({ ...base, fingerprints: many })).searchParams.get('logs').split(', ').length, 5);
  assert.match(read('.github/ISSUE_TEMPLATE/bug_report.yml'), /id: logs\b/);
});
