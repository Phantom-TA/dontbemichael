'use strict';

/**
 * The engine capability table (issue #531, src/shared/engineCapabilities.ts):
 * one entry per engine, facts the presets hold derived from them, and
 * `engineGaps` saying what an engine lacks for a job on an OS.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const ap = loadTs('src/shared/agentProvider.ts');
const ec = loadTs('src/shared/engineCapabilities.ts');
const silent = loadTs('src/shared/silentEngine.ts');

const SUPPORT = new Set(['yes', 'no', 'unknown']);
const DERIVED = ['seedPrompt', 'lifecycleEvents', 'inbox', 'resume', 'systemPromptOnResume'];
const PER_ENGINE = ec.ENGINE_NEEDS.filter((n) => !DERIVED.includes(n));
const PER_OS = new Set(['fileSandbox', 'runsOn']);

test('every engine has an entry, and the table names no engine that does not exist', () => {
  // Value: protects=a new engine cannot reach BUILD_ENGINES without someone writing down what it can do; fails_when=a preset is added with no table entry, or an entry outlives its preset; why_new=issue #531; seam=none
  const presets = ap.AGENT_PROVIDER_PRESETS.map((p) => p.id).sort();
  assert.deepEqual(Object.keys(ec.ENGINE_FACTS).sort(), presets);
  for (const id of presets) assert.ok(ap.isAgentProvider(id), id);
});

test('every fact is yes, no or unknown, and per OS facts name every OS', () => {
  // Value: protects=engineGaps never meets a value it cannot classify; fails_when=an entry misses a field, misspells a value, or leaves an OS out; why_new=issue #531; seam=none
  for (const [id, facts] of Object.entries(ec.ENGINE_FACTS)) {
    for (const need of PER_ENGINE) {
      const value = facts[need];
      if (PER_OS.has(need)) {
        assert.deepEqual(Object.keys(value).sort(), [...ec.ENGINE_OSES].sort(), `${id}.${need}`);
        for (const os of ec.ENGINE_OSES) assert.ok(SUPPORT.has(value[os]), `${id}.${need}.${os} is ${value[os]}`);
      } else {
        assert.ok(SUPPORT.has(value), `${id}.${need} is ${value}`);
      }
    }
  }
});

test('the facts the presets hold are read from the presets, never copied', () => {
  // Value: protects=the table and the presets cannot disagree; fails_when=a derived need is hard coded and a preset change leaves it stale; why_new=issue #531; seam=none
  const yesNo = (v) => (v ? 'yes' : 'no');
  for (const preset of ap.AGENT_PROVIDER_PRESETS) {
    const id = preset.id;
    const bridged = preset.hiveAware || !!ap.bridgeOf(id);
    const neverReports = silent.NEVER_REPORTS.some((r) => r.engine === id);
    const expect = {
      inbox: yesNo(preset.canReceiveInbox),
      resume: yesNo(preset.resumeFlag || preset.resumeSubcommand),
      lifecycleEvents: !bridged ? 'no' : neverReports ? 'unknown' : 'yes',
      systemPromptOnResume: preset.instructionsDelivery === 'system-level' ? 'yes'
        : neverReports || ap.bridgeOf(id)?.kind === 'hooks' ? 'unknown' : 'no',
      seedPrompt: yesNo(preset.hiveAware || preset.initialPromptFlag || preset.positionalInitialPrompt || preset.seedDelivery)
    };
    for (const [need, value] of Object.entries(expect)) {
      for (const os of ec.ENGINE_OSES) assert.equal(ec.engineSupport(id, os, need), value, `${id} ${need} on ${os}`);
    }
  }
  for (const facts of Object.values(ec.ENGINE_FACTS)) assert.ok(!('systemPromptOnResume' in facts), 'derived, so not written down');
});

test('the protocol comes back after a resume only where something carries it back', () => {
  // Value: protects=a re-injected engine whose hook server never hears SessionStart does not read as getting the protocol back; fails_when=systemPromptOnResume reads instructionsDelivery alone, or Codex reads anything but yes; why_new=review of #577 after #311; seam=none
  const expect = {
    claude: 'yes', codex: 'yes',
    gemini: 'unknown', grok: 'unknown', opencode: 'unknown',
    qwen: 'no', crush: 'no', kimi: 'no', copilot: 'no', cursor: 'no', custom: 'no'
  };
  for (const [id, value] of Object.entries(expect)) {
    for (const os of ec.ENGINE_OSES) assert.equal(ec.engineSupport(id, os, 'systemPromptOnResume'), value, `${id} on ${os}`);
  }
});

test('an engine with a version known never to report does not read as reporting', () => {
  // Value: protects=the table never says yes for lifecycle events that NEVER_REPORTS says current versions skip; fails_when=lifecycleEvents is derived from the bridge alone, so Gemini reads yes; why_new=review of #577; seam=none
  assert.ok(silent.neverReports('gemini', '0.60.0'), 'sanity: current Gemini CLI never reports');
  for (const os of ec.ENGINE_OSES) {
    assert.equal(ec.engineSupport('gemini', os, 'lifecycleEvents'), 'unknown', `gemini on ${os}: an older version may still report`);
    assert.equal(ec.engineSupport('codex', os, 'lifecycleEvents'), 'yes');
    assert.equal(ec.engineSupport('custom', os, 'lifecycleEvents'), 'no');
  }
});

test('the file sandbox says yes exactly where the silent engine rules say an OS sandbox guards the files', () => {
  // Value: protects=two answers to "does an OS sandbox hold this engine's files" cannot drift apart; fails_when=fileSandbox says yes where guardedWithoutReports is false or the other way round, or Gemini reads anything but no; why_new=review of #577; seam=none
  for (const id of Object.keys(ec.ENGINE_FACTS)) {
    for (const os of ec.ENGINE_OSES) {
      assert.equal(ec.ENGINE_FACTS[id].fileSandbox[os] === 'yes', silent.guardedWithoutReports(id, os), `${id} on ${os}`);
    }
  }
  assert.deepEqual(ec.ENGINE_FACTS.gemini.fileSandbox, { darwin: 'no', win32: 'no', linux: 'no' }, 'Gemini has none anywhere');
});

test('engineGaps names what is missing in the order asked, and tells a known gap from an unchecked one', () => {
  // Value: protects=a caller can tell "this engine cannot" from "nobody has checked"; fails_when=unknown reads as yes, or yes shows up as a gap; why_new=issue #531; seam=none
  assert.deepEqual(ec.engineGaps('claude', 'darwin', ['fileSandbox', 'mailTools', 'resume']), []);
  assert.deepEqual(ec.engineGaps('claude', 'win32', ['mailTools', 'fileSandbox']), [{ need: 'fileSandbox', support: 'no' }],
    'Claude Code has no sandbox on Windows');
  assert.deepEqual(ec.engineGaps('codex', 'win32', ['mailTools', 'fileSandbox', 'contextGauge']), [
    { need: 'mailTools', support: 'no' },
    { need: 'fileSandbox', support: 'unknown' }
  ]);
  assert.deepEqual(ec.engineGaps('custom', 'linux', ['inbox', 'lifecycleEvents']), [
    { need: 'inbox', support: 'no' },
    { need: 'lifecycleEvents', support: 'no' }
  ]);
  assert.deepEqual(ec.engineGaps('codex', 'darwin', []), []);
});

test('an engine with no bridge, or only a proxy, can never refuse a tool call', () => {
  // Value: protects=the table never claims a guard an engine cannot have; fails_when=a hookless or proxy engine is marked as guarded; why_new=#139 notes the proxy tier is unguarded; seam=none
  for (const preset of ap.AGENT_PROVIDER_PRESETS) {
    const bridge = ap.bridgeOf(preset.id);
    if (preset.hiveAware || bridge?.kind === 'hooks') continue;
    assert.equal(ec.ENGINE_FACTS[preset.id].toolGuard, 'no', preset.id);
  }
});

test('mail tools and Research stay Claude only, as the spawn code holds them today', () => {
  // Value: protects=the table matches what spawnAgentCore does until a PR changes both; fails_when=an engine is marked as getting mail tools or Research that the spawn code still refuses; why_new=issue #531; seam=none
  for (const id of Object.keys(ec.ENGINE_FACTS)) {
    const expected = ap.isClaudeProvider(id) ? 'yes' : 'no';
    assert.equal(ec.ENGINE_FACTS[id].mailTools, expected, `${id} mailTools`);
    assert.equal(ec.ENGINE_FACTS[id].researchWalls, expected, `${id} researchWalls`);
  }
});

test('every engine this build offers has no known gap on the platforms that ship', () => {
  // Value: protects=adding an engine id to BUILD_ENGINES fails here first when the table knows it cannot do an office member's job; fails_when=an offered engine has a "no" on Mac or Windows; why_new=issue #531; seam=none
  const member = ['seedPrompt', 'lifecycleEvents', 'inbox', 'resume', 'systemPromptOnResume', 'toolGuard', 'contextGauge', 'costData', 'mailTools', 'runsOn'];
  for (const id of ap.BUILD_ENGINES) {
    for (const os of ['darwin', 'win32']) {
      assert.deepEqual(ec.engineGaps(id, os, member), [], `${id} on ${os}`);
    }
  }
});
