'use strict';

/**
 * A first time owner's Michael exited at once (owner, 2026-10-30): the app
 * added --remote-control-session-name-prefix to every Claude start, and that
 * owner's Claude Code did not know the option. Every symptom hid the cause:
 * Clocking in waited out its cap, Needs you took answers nobody would route,
 * a "Claude connectors are now off" card meant for upgraders came up, and the
 * failure report said only "code-1". These pin each of those.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { parseCliFlags } = loadTs('src/shared/modelCliFloor.ts');
const { claudeCliFlags } = loadTs('src/main/claudeCliVersion.ts');
const { exitLine, exitCause } = loadTs('src/shared/agentExit.ts');
const { classifyLogEvent, validateReport } = loadTs('src/shared/failureReport.ts');

// What that owner's Michael printed, as the terminal got it.
const TAIL = "\x1b[?25l\x1b[2Kerror: unknown option '--remote-control-session-name-prefix'\r\n";

const skip = process.platform === 'win32' ? 'shell-script fixtures' : false;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cli-flags-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the naming option is added only when the installed Claude Code lists it', { skip }, async () => {
  // Value: protects=Michael starts on a Claude Code that lacks an option the app adds for its own convenience; fails_when=the option is passed to a CLI whose --help does not list it, an unanswered probe still passes it, or a failed probe is cached; why_new=owner 2026-10-30 (unknown option ended Michael); seam=a shell script standing in for claude; no_claim=which Claude Code version added the option
  const help = '  --remote-control [name]   Start with Remote Control\n  --remote-control-session-name-prefix <prefix>\n  -c, --continue   Continue';
  assert.ok(parseCliFlags(help).has('--remote-control-session-name-prefix'));
  assert.ok(parseCliFlags(help).has('--continue'));
  assert.ok(!parseCliFlags('  --remote-control [name]').has('--remote-control-session-name-prefix'), 'a longer option is never read from a shorter one');

  const fake = (name, body) => { const bin = path.join(tmp, name); fs.writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return bin; };
  const newer = await claudeCliFlags(fake('claude-new', `printf '%s\\n' '  --remote-control-session-name-prefix <prefix>'`));
  assert.ok(newer.has('--remote-control-session-name-prefix'));
  const older = await claudeCliFlags(fake('claude-old', `printf '%s\\n' '  --model <model>'`));
  assert.ok(!older.has('--remote-control-session-name-prefix'), 'an older Claude Code does not get it');
  const runs = path.join(tmp, 'runs');
  const broken = fake('claude-broken', `echo run >> "${runs}"; exit 3`);
  assert.equal(await claudeCliFlags(broken), null, 'unknown: the caller leaves the option out');
  assert.equal(await claudeCliFlags(broken), null);
  assert.equal(fs.readFileSync(runs, 'utf8').trim().split('\n').length, 2, 'a failure is asked again');

  const main = read('src/main/index.ts');
  assert.match(main, /if \(!args\.includes\('--remote-control-session-name-prefix'\) && \(await cliFlags\)\?\.has\('--remote-control-session-name-prefix'\)\) \{/);
  // The version is read on every Claude start, so a failure report can name it.
  assert.match(main, /const cliFlags = claudeCliFlags\(cliBin\);\s*const cliVersion = await claudeCliVersion\(cliBin\);/);
});

test('an exit says why on screen, and the failure report carries the closed cause', () => {
  // Value: protects=the owner sees the line that explains the stop, and the report tells causes apart; fails_when=the line is lost to colour codes or the app's own "process exited" line, an unknown option reads as another cause, or the report's detail drops or loses the cause; why_new=report #5 said only code-1; seam=none; no_claim=wording of other engines' errors
  assert.equal(exitLine(TAIL), "error: unknown option '--remote-control-session-name-prefix'");
  assert.equal(exitLine(`${TAIL}\r\n─ process exited (code 1) ─\r\n`), "error: unknown option '--remote-control-session-name-prefix'");
  assert.equal(exitLine(''), null);
  assert.equal(exitCause(TAIL), 'unknown-option');
  assert.equal(exitCause('Not logged in · Please run /login'), 'signed-out');
  assert.equal(exitCause('zsh: command not found: claude'), 'not-found');
  assert.equal(exitCause('Segmentation fault'), 'other');

  const c = classifyLogEvent({ kind: 'agent-exit', exitCode: 1, cause: 'unknown-option' });
  assert.deepEqual(c, { kind: 'agent-exit', detail: 'code-1:unknown-option' });
  assert.deepEqual(classifyLogEvent({ kind: 'agent-exit', exitCode: 1, cause: '--remote-control' }), { kind: 'agent-exit', detail: 'code-1' }, 'free text never reaches the report');
  const report = { kind: 'agent-exit', detail: c.detail, errorName: 'Error', frames: [], fingerprint: 'abcdef012345', appVersion: '0.3.2', os: 'darwin', osVersion: '27.0.1', arch: 'arm64', engine: 'claude', engineVersion: '2.1.100', count: 1 };
  assert.equal(validateReport(report), null);
  assert.match(read('src/main/hive.ts'), /cause: exitCause\(tail\),/);
});

test('main keeps who stopped by itself, and forgets them on their next start or report', () => {
  // Value: protects=the window learns Michael stopped; fails_when=an exit is not recorded, a clean exit of a member is shown as stopped, Michael's clean exit is not, or a member who started again stays stopped; why_new=the floor never learned Michael died; seam=source pins (the exit handler lives in index.ts); no_claim=explicit kills (they never reach the exit handler)
  const main = read('src/main/index.ts');
  assert.match(main, /if \(abnormal \|\| isMichael\) \{\s*stoppedMembers\.set\(dyingAgent, \{/);
  assert.match(main, /line: exitLine\(info\?\.tail\), at: Date\.now\(\)/);
  assert.match(main, /silentWatch\?\.noteHook\(agentId, event\);\s*clearStopped\(agentId\);/);
  assert.match(main, /ptyToAgent\.set\(opts\.id, opts\.hive\.id\);\s*pausedPty\.delete\(opts\.id\);\s*clearStopped\(opts\.hive\.id\);/);
  assert.match(main, /ipcMain\.handle\('agents:stopped', \(\) => \[\.\.\.stoppedMembers\.values\(\)\]\);/);
});

test('the floor stops waiting for a stopped member, says Michael stopped, and Needs you says answers wait', () => {
  // Value: protects=owner 2026-10-30 symptoms 1 to 3; fails_when=Clocking in waits for a dead member, a stopped Michael has no card or no Start again and Work tab, Start again cannot start him a second time, Needs you takes answers silently, or any language lacks the words; why_new=nothing outside the Work tab said Michael was dead; seam=source pins (no render harness for these); no_claim=layout
  const clock = read('src/renderer/src/components/TeamClockingIn.tsx');
  assert.match(clock, /const coming = \[\.\.\.arriving\]\.filter\(\(id\) => !stopped\[id\]\)\.length;/);
  assert.match(clock, /arriving: coming,/);
  assert.match(clock, /if \(!show \|\| michaelStopped\) return null;/);
  const card = read('src/renderer/src/components/MichaelStopped.tsx');
  assert.match(card, /requestMichaelStart\(\)/);
  assert.match(card, /openAgentWork\(stopped\.agentId\)/);
  assert.match(read('src/renderer/src/App.tsx'), /<MichaelStopped show=\{floorView === 'office'\} \/>/);
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /if \(michaelStartRequest > 0\) godSpawning\.current = false;/);
  assert.match(hive, /\}, \[config\?\.onboardingComplete, config\?\.harnessHome, michaelStartRequest\]\);/);
  assert.match(read('src/renderer/src/store/store.ts'), /ccTabRequest: \{ tab: 'terminal', seq \}/);
  assert.match(read('src/renderer/src/shell/NeedsYouBoard.tsx'), /t\('shell\.michaelStopped', \{ godName \}\)/);
  for (const locale of ['en', 'zh-CN', 'ar']) {
    const l = JSON.parse(read(`src/renderer/src/i18n/locales/${locale}.json`));
    for (const k of ['title', 'noLine', 'startAgain', 'seeWork']) assert.equal(typeof l.office.stopped[k], 'string', `${locale}: office.stopped.${k}`);
    assert.match(l.shell.michaelStopped, /\{\{godName\}\}/, `${locale}: shell.michaelStopped`);
  }
});

test('a new office never gets the connectors update card, and the card is a report to read', () => {
  // Value: protects=a first time owner is not told connectors "are now off" that were never on, and the card clears with Got it; fails_when=setup leaves the carry-over to run, or the card waits for an answer Michael must route; why_new=owner 2026-10-30; seam=source pins; no_claim=the carry-over rules themselves (claude-connectors tests)
  assert.match(read('src/renderer/src/components/OnboardingWizard.tsx'), /connectorsMigrated: true,/);
  const main = read('src/main/index.ts');
  const card = main.slice(main.indexOf('function connectorsUpgradeCard('), main.indexOf("console.error('[connectors] ask me card:'"));
  assert.match(card, /status: 'done',/);
  assert.match(card, /kind: 'report'/);
});

test('the exit line reads only the end of the tail, and says nothing it cannot back', () => {
  // Value: protects=business text from a long session never reads as the reason, and the closed cause stays true; fails_when=the whole tail is scanned, the fallback goes, or the cap goes; why_new=ship review; seam=none; no_claim=wording of other engines' errors
  const talk = ['we had an error in the invoice', 'not logged in customers cannot pay', ...Array.from({ length: 12 }, (_, i) => `line ${i}`)].join('\n');
  assert.equal(exitLine(talk), 'line 11', 'the last line, when nothing near the end reads like an error');
  assert.equal(exitCause(talk), 'other');
  assert.equal(exitLine('─ process exited (code 1) ─'), null);
  assert.equal(exitLine(undefined), null);
  assert.equal(exitLine(`error: ${'x'.repeat(300)}`).length, 200);
  assert.ok(parseCliFlags('  --allowedTools <tools>').has('--allowedTools'), 'a camelCase option is read whole');
});
