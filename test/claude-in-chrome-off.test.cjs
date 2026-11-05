'use strict';

/**
 * Claude in Chrome is off for every Claude session the app starts (owner,
 * 2026-11-04). With no saved Claude in Chrome setting, Claude Code looks for its
 * browser extension in Chrome's own folder at start, and macOS blocks it with
 * "Data Access Blocked" in the app's name: on Make my case study (a hidden
 * session with a fresh settings folder), and at each team member's start for an
 * owner whose Claude settings never say. The team can't use Claude in Chrome
 * anyway: the connector gate refuses its tools.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

test('a Claude team member starts with Claude in Chrome off, and so does a claude it starts from its shell', { skip: process.platform === 'win32' ? 'bash shell env file' : false }, async (t) => {
  // Value: protects=no "Data Access Blocked" at a member's start on a Mac whose Claude settings never set Claude in Chrome; fails_when=the member's env or its shell env file loses CLAUDE_CODE_ENABLE_CFC=0; why_new=owner 2026-11-04; seam=the real ensureAgent; no_claim=that Claude Code honours the variable (checked live: a fresh settings folder scans browser folders without it and not with it)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfc-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  for (const connectors of [undefined, { strip: false, deny: [] }]) {
    const inj = await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home }, connectors ? { connectors } : {});
    assert.equal(inj.env.CLAUDE_CODE_ENABLE_CFC, '0', connectors ? 'with connectors' : 'without connectors');
    const file = inj.env.CLAUDE_ENV_FILE;
    assert.ok(file && fs.existsSync(file), 'shell env file written');
    const out = spawnSync('bash', ['-c', 'source "$1"; printf %s "$CLAUDE_CODE_ENABLE_CFC"', 'x', file], { encoding: 'utf8' });
    assert.equal(out.stdout, '0', 'a claude started from the shell has it off too');
  }
});

test('another engine is started as before', async (t) => {
  // Value: protects=the switch stays Claude only; fails_when=a non Claude engine gets a Claude Code variable; why_new=owner 2026-11-04; seam=the real ensureAgent
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfc-codex-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'codex', cwd: home }, {});
  assert.equal(inj.env.CLAUDE_CODE_ENABLE_CFC, undefined);
});

test('the hidden checks turn it off last, so no caller turns it back on', () => {
  // Value: protects=the case study and every other hidden check; fails_when=the switch moves before the caller's env; why_new=owner 2026-11-04; seam=source pin (the PTY run is covered in hidden-claude-isolate.test.cjs)
  const hidden = fs.readFileSync(path.join(__dirname, '..', 'src/main/hiddenClaude.ts'), 'utf8');
  assert.match(hidden, /\.\.\.\(isolated\?\.env \?\? \{\}\),\s*ENABLE_CLAUDEAI_MCP_SERVERS: 'false',[\s\S]{0,600}CLAUDE_CODE_ENABLE_CFC: '0',\s*\} as Record<string, string>/);
});
