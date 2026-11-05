'use strict';

/**
 * An owner's Michael stopped at a Settings Error prompt (owner, 2026-10-30): the
 * app registers the PostToolBatch hook on every Claude start, and an older
 * Claude Code refuses the whole settings file over a hook name it does not know.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { CLAUDE_HOOK_CLI_FLOOR, hooksForCli } = loadTs('src/shared/modelCliFloor.ts');
const root = path.resolve(__dirname, '..');

const { HiveManager } = loadTs('src/main/hive.ts');
const { claudeCliVersion, claudeCliFlags } = loadTs('src/main/claudeCliVersion.ts');

async function settingsFor(cliVersion) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hook-floor-'));
  try {
    const launch = await new HiveManager(() => home).ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home }, { cliVersion });
    const file = launch.args[launch.args.indexOf('--settings') + 1];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('an older Claude Code gets settings it can read', async () => {
  // Value: protects=Michael starts with his hooks, sandbox and deny rules on a Claude Code that lacks PostToolBatch; fails_when=the hook is written for a version below its floor, or left out of a version that takes it; why_new=owner 2026-10-30 Settings Error on god.json; seam=real ensureAgent and the settings file it writes; no_claim=a real old Claude Code reading the file
  const old = await settingsFor('2.1.90');
  assert.equal(old.hooks.PostToolBatch, undefined);
  assert.ok(old.hooks.StopFailure && old.hooks.PreToolUse && old.hooks.Stop, 'the rest stay');
  const current = await settingsFor('2.1.314');
  assert.ok(current.hooks.PostToolBatch);
});

test('each hook is kept from its floor up, and an unread version keeps none with a floor', () => {
  // Value: protects=the floor boundary, and a failed probe never brings the Settings Error back; fails_when=the boundary is off by one or a failed probe keeps a hook an old CLI refuses; why_new=owner 2026-10-30 D1; seam=none; no_claim=the floors themselves
  const all = { Stop: 1, PostCompact: 2, StopFailure: 3, PostToolBatch: 4 };
  assert.deepEqual(hooksForCli(all, '2.1.118'), all);
  assert.deepEqual(Object.keys(hooksForCli(all, '2.1.117')), ['Stop', 'PostCompact', 'StopFailure']);
  assert.deepEqual(Object.keys(hooksForCli(all, '2.1.77')), ['Stop', 'PostCompact']);
  assert.deepEqual(Object.keys(hooksForCli(all, '2.1.75')), ['Stop']);
  for (const unread of [null, undefined, 'not a version']) assert.deepEqual(Object.keys(hooksForCli(all, unread)), ['Stop']);
});

test('a hook the app adds later needs a floor or a place on the old list', () => {
  // Value: protects=the next hook does not repeat this; fails_when=a hook name joins the settings without a decision about older Claude Codes; why_new=second start blocker in a week from a name an old CLI refuses; seam=source read of the hooks block; no_claim=that a listed floor is exact
  const src = fs.readFileSync(path.join(root, 'src/main/hive.ts'), 'utf8');
  const block = src.slice(src.indexOf('hooks: hooksForCli({'), src.indexOf('}, cliVersion)'));
  const events = [...block.matchAll(/^\s+([A-Z][A-Za-z]+): \[entry/gm)].map((m) => m[1]);
  assert.ok(events.includes('Stop'));
  // Every one of these was taken by the Claude Code on the owner's Settings Error.
  const old = ['Stop', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'Notification', 'SessionStart', 'PreCompact'];
  for (const e of events) assert.ok(old.includes(e) || CLAUDE_HOOK_CLI_FLOOR[e], `${e} needs a floor in CLAUDE_HOOK_CLI_FLOOR`);
});

test('the version is read before the settings are written, for every member', () => {
  // Value: protects=the real spawn hands the version over; fails_when=the probe moves back after ensureAgent or one spawn branch drops it; why_new=the probe used to run after the settings were written; seam=source pins (spawnAgentCore needs Electron); no_claim=non Claude engines
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  assert.ok(main.indexOf('const cliVersion = await claudeCliVersion(cliBin);') < main.indexOf('const inj = await hive.ensureAgent('));
  const call = main.slice(main.indexOf('const inj = await hive.ensureAgent('), main.indexOf('opts.args = [...(opts.args ?? []), ...inj.args];'));
  assert.equal(call.match(/^\s+cliVersion,?$/gm)?.length, 2, 'Research and the rest of the team');
});

test('a start with no Claude binary runs no probe, and a missing one answers unknown', async () => {
  // Value: protects=the earlier probe cannot fail a start; fails_when=a null or missing binary rejects instead of answering null; why_new=the probe now runs before every Claude start's settings; seam=none; no_claim=a real slow machine
  for (const bin of [null, path.join(os.tmpdir(), 'md-no-such-claude')]) {
    assert.equal(await claudeCliVersion(bin), null);
    assert.equal(await claudeCliFlags(bin), null);
  }
});

test('a probe that fails takes the answer for its own install, and never another install\'s', { skip: process.platform === 'win32' ? 'shell-script fixtures' : false }, async (t) => {
  // Value: protects=starts side by side share one good answer, and a failed read never borrows a newer version from another install; fails_when=a slow failed probe returns null though its install answered, or an unread binary gets another binary's version; why_new=ship review of the fallback; seam=none; no_claim=a real timeout
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hook-probe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const once = path.join(dir, 'once');
  const release = path.join(dir, 'release');
  const shared = path.join(dir, 'claude-shared');
  // The first run waits until the second has answered, then fails: a fixed order, no clock.
  fs.writeFileSync(shared, `#!/bin/sh\nif mkdir "${once}" 2>/dev/null; then i=0; while [ ! -e "${release}" ] && [ $i -lt 80 ]; do sleep 0.05; i=$((i+1)); done; exit 3; fi\necho '2.1.314 (Claude Code)'\n`, { mode: 0o755 });
  const slow = claudeCliVersion(shared);
  for (let i = 0; i < 500 && !fs.existsSync(once); i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(await claudeCliVersion(shared), '2.1.314');
  fs.writeFileSync(release, '');
  assert.equal(await slow, '2.1.314', 'the failed probe takes the answer for this install');
  const broken = path.join(dir, 'claude-broken');
  fs.writeFileSync(broken, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  assert.equal(await claudeCliVersion(broken), null, 'another install stays unread');
});
