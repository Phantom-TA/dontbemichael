'use strict';
// Automatic failure reports: the shared schema (docs/designs/auto-report-failures.md).
// Only failures the repo owners can fix in code are reported (owner D11), with
// closed fields only; these tests keep the classes complete and the fields closed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const S = loadTs('src/shared/failureReport.ts');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mainFiles = () => fs.readdirSync(path.join(root, 'src/main')).filter((f) => f.endsWith('.ts')).map((f) => `src/main/${f}`);

function goodReport(over = {}) {
  return {
    kind: 'main-uncaught', detail: 'none', errorName: 'TypeError', frames: ['out/main/index.js:Hive.routeOnce:3644'],
    fingerprint: '0123456789ab', appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    engine: 'claude', engineVersion: '2.1.309', count: 3, ...over
  };
}

test('every kind the office log writes has a class', () => {
  // Value: protects=a new failure kind cannot ship unclassed and silent; fails_when=a log kind is added without a class; why_new=new schema; seam=none; no_claim=whether each class is the right call (reviewed by hand)
  const re = /(?:appendLog|\blog)\??\.?\(\s*\{\s*(?:ts:[^,]*,\s*)?kind:\s*'([a-z0-9-]+)'/g;
  const missing = [];
  for (const f of mainFiles()) {
    for (const m of read(f).matchAll(re)) if (!(m[1] in S.LOG_KIND_CLASS)) missing.push(`${m[1]} (${f})`);
  }
  assert.deepEqual(missing, []);
});

test('every drop reason the router logs has a class', () => {
  const missing = [];
  for (const f of mainFiles()) {
    for (const m of read(f).matchAll(/kind:\s*'drop',\s*reason:\s*'([a-z0-9-]+)'/g)) if (!(m[1] in S.DROP_REASON_CLASS)) missing.push(m[1]);
  }
  assert.deepEqual(missing, []);
});

test('every literal error a background check can end with is mapped', () => {
  // Value: protects=sign in or offline background checks never reach GitHub; fails_when=a new error string defaults to unmapped; why_new=eng E-R1; seam=none; no_claim=none beyond protects
  const literals = new Set();
  for (const f of ['src/main/hiddenModel.ts', 'src/main/hiddenClaude.ts']) {
    for (const m of read(f).matchAll(/error: '([^']+)'/g)) literals.add(m[1]);
  }
  for (const f of ['src/main/hireCheck.ts', 'src/main/workStyleConvert.ts', 'src/main/standingCheck.ts', 'src/main/fileFitCheck.ts', 'src/main/runCompare.ts']) {
    for (const m of read(f).matchAll(/reason: (?:result\.ok \? )?'([^']+)'/g)) literals.add(m[1]);
  }
  assert.ok(literals.size > 10);
  const unmapped = [...literals].filter((l) => !(l in S.HIDDEN_ERRORS));
  // Reasons of other log kinds in the same files are not background check errors.
  const notChecks = new Set(['Nothing to save.', 'cancelled', 'no-difference', 'no-good-run', 'no-name', 'no-transcript', 'restore-conversation', 'cli_missing']);
  assert.deepEqual(unmapped.filter((l) => !notChecks.has(l)), []);
  assert.equal(S.hiddenErrorClass('hidden session never took the prompt (signed out, or a screen is waiting)'), null, 'signed out is the owner\'s');
  assert.equal(S.hiddenErrorClass('engine unavailable'), null);
  assert.equal(S.hiddenErrorClass('cwd does not exist: /Users/someone/x'), null, 'dynamic text is never reported');
  assert.equal(S.hiddenErrorClass('could not submit background check'), 'submit-failed');
  assert.equal(S.hiddenErrorClass('unreadable'), 'answer-unparseable');
});

test('the engine list matches the AgentProvider union', () => {
  const src = read('src/shared/agentProvider.ts');
  const union = src.match(/export type AgentProvider =([\s\S]*?);/)[1];
  const ids = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...S.ENGINES].sort(), ids);
});

test('the schema file imports nothing, so the Action can run it alone', () => {
  assert.doesNotMatch(read('src/shared/failureReport.ts'), /^\s*import\b|require\(/m);
});

test('only the app\'s own frames survive, with no home folder, on every OS', () => {
  // Value: protects=no user name or path reaches a public issue; fails_when=the bundle prefix check loosens; why_new=no scrubber existed; seam=none; no_claim=real crash stacks (fixtures stand in)
  const mac = [
    'TypeError: boom at /Users/jane.smith/secret',
    '    at Hive.routeOnce (/Applications/Don\'t Be Michael.app/Contents/Resources/app.asar/out/main/index.js:3644:11)',
    '    at Timeout._onTimeout (/Applications/Don\'t Be Michael.app/Contents/Resources/app.asar/out/main/index.js:3641:30)',
    '    at listOnTimeout (node:internal/timers:573:17)',
    '    at /Users/jane.smith/HarnessAgents/node_modules/x/y.js:1:1'
  ].join('\n');
  assert.deepEqual(S.scrubFrames(mac), ['out/main/index.js:Hive.routeOnce:3644', 'out/main/index.js:Timeout._onTimeout:3641']);
  const win = '    at async Hive.drain (C:\\Users\\Jane Smith\\AppData\\Local\\Programs\\dbm\\resources\\app.asar\\out\\main\\index.js:12:3)';
  assert.deepEqual(S.scrubFrames(win), ['out/main/index.js:Hive.drain:12']);
  const linux = '    at file:///opt/dbm/resources/app.asar/out/preload/index.js:40:2';
  assert.deepEqual(S.scrubFrames(linux), ['out/preload/index.js:-:40']);
  const renderer = '    at Ve (file:///Applications/X.app/Contents/Resources/app.asar/out/renderer/assets/index-B1x_9aZq.js:88:1201)';
  assert.deepEqual(S.scrubFrames(renderer), ['out/renderer/assets/index.js:-:88']);
  const many = Array.from({ length: 30 }, (_, i) => `    at f${i} (/x/app.asar/out/main/index.js:${i + 1}:1)`).join('\n');
  assert.equal(S.scrubFrames(many).length, S.MAX_FRAMES);
  assert.deepEqual(S.scrubFrames('    at scam.example/visit:Buy_now:1'), []);
  assert.deepEqual(S.scrubFrames(undefined), []);
  for (const f of [...S.scrubFrames(mac), ...S.scrubFrames(win)]) assert.doesNotMatch(f, /jane|Users|smith/i);
});

test('the fingerprint input ignores line numbers and the version', () => {
  const a = S.fingerprintInput('main-uncaught', 'none', 'TypeError', ['out/main/index.js:f:10']);
  const b = S.fingerprintInput('main-uncaught', 'none', 'TypeError', ['out/main/index.js:f:99']);
  assert.equal(a, b);
  assert.notEqual(a, S.fingerprintInput('main-uncaught', 'ENOENT', 'TypeError', ['out/main/index.js:f:10']));
});

test('a report holds closed fields only', () => {
  assert.equal(S.validateReport(goodReport()), null);
  const bad = {
    kind: 'free text', detail: 'whatever', errorName: 'Type Error!', frames: ['/Users/jane/x.js:f:1'], fingerprint: 'XYZ',
    appVersion: 'v0.2.9', os: 'beos', osVersion: '6.5.0-azure', arch: 'ia32', engine: 'gpt', engineVersion: 'latest', count: 0
  };
  for (const [k, v] of Object.entries(bad)) assert.equal(S.validateReport(goodReport({ [k]: v })), k, `${k} is checked`);
  assert.equal(S.validateReport({ ...goodReport(), message: 'hi' }), 'unknown field message');
  assert.equal(S.validateReport(goodReport({ appVersion: '0.2.9-rc.1' })), null, 'Windows beta rc versions pass');
  assert.equal(S.validateReport(goodReport({ kind: 'agent-exit', detail: 'SIGSEGV' })), null);
  assert.equal(S.validateReport(goodReport({ kind: 'loop-agent', detail: 'repeat:stopped' })), null);
  assert.equal(S.validateReport(goodReport({ kind: 'hidden-call-failed', detail: 'hire-check-fallback:answer-unparseable' })), null);
  assert.equal(S.validateReport(goodReport({ kind: 'hidden-call-failed', detail: 'hire-check-fallback:engine-unavailable' })), 'detail');
  assert.equal(S.cleanOsVersion('6.5.0-1025-azure'), '6.5.0');
});

test('an issue body reads back exactly and carries nothing but the fields', () => {
  const r = goodReport();
  const body = S.issueBody(r);
  assert.deepEqual(S.parseIssueBody(body), r);
  assert.match(S.issueTitle(r), /\(0123456789ab\)$/);
  assert.equal(S.parseIssueBody(body.replace('`main-uncaught`', '`see https://scam.example`')), null, 'forged fields are refused');
  assert.equal(S.parseIssueBody('Hello, please visit https://scam.example'), null);
});

test('a seen-on comment is one closed line', () => {
  const line = S.seenOnLine(goodReport());
  assert.equal(line, 'seen-on 0.2.9 darwin 15.1.0 arm64 claude 2.1.309 count=3');
  assert.deepEqual(S.parseSeenOn(line), { appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64', engine: 'claude', engineVersion: '2.1.309', count: 3 });
  assert.equal(S.parseSeenOn(`${line} click https://scam.example`), null);
  assert.equal(S.parseSeenOn('seen-on 0.2.9 darwin 15.1.0 arm64 gpt 1 count=3'), null);
});

test('office log events classify into reported kinds, or nothing', () => {
  // Value: protects=owner fixable events never filed and repo ones always are (D11); fails_when=a reason maps to the wrong kind; why_new=new classifier; seam=none; no_claim=none beyond protects
  assert.deepEqual(S.classifyLogEvent({ kind: 'drop', reason: 'hop-cap' }), { kind: 'loop-messages', detail: 'hop-cap' });
  assert.deepEqual(S.classifyLogEvent({ kind: 'drop', reason: 'malformed-json' }), { kind: 'outbox-bad', detail: 'malformed-json' });
  assert.equal(S.classifyLogEvent({ kind: 'drop', reason: 'no-inbox' }), null);
  assert.equal(S.classifyLogEvent({ kind: 'drop', reason: 'research-off' }), null);
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', signal: 11, exitCode: 0 }, (n) => (n === 11 ? 'SIGSEGV' : undefined)), { kind: 'agent-exit', detail: 'SIGSEGV' });
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', exitCode: 1 }), { kind: 'agent-exit', detail: 'code-1' });
  assert.deepEqual(S.classifyLogEvent({ kind: 'hook-server-error', code: 'EADDRINUSE' }), { kind: 'hook-server', detail: 'EADDRINUSE' });
  assert.deepEqual(S.classifyLogEvent({ kind: 'hire-check-fallback', reason: 'no verdict' }), { kind: 'hidden-call-failed', detail: 'hire-check-fallback:answer-unparseable' });
  assert.equal(S.classifyLogEvent({ kind: 'hire-check-fallback', reason: 'hidden session timed out' }), null);
  assert.deepEqual(S.classifyLogEvent({ kind: 'trust-check-failed', error: 'could not submit background check' }), { kind: 'trust-check-failed', detail: 'trust-check-failed:submit-failed' });
  assert.equal(S.classifyLogEvent({ kind: 'office-break', reason: 'credit' }), null);
  assert.equal(S.classifyLogEvent({ kind: 'message', from: 'god' }), null);
  assert.equal(S.KIND_CLASS.canary, 'none');
  assert.equal(S.KIND_CLASS['main-uncaught'], 'repo');
});

test('an agent exit with no usable signal or code is reported as other, and still validates', () => {
  // Value: protects=an exit node-pty gives no signal or usable code for is still one valid report, never a dropped one or free text; fails_when=a zero, missing or out of range code, or a junk signal name, reaches detail as is; why_new=only a signal and code 1 were tested; seam=none; no_claim=real node-pty exit values
  const other = { kind: 'agent-exit', detail: 'other' };
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit' }), other);
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', exitCode: 0, signal: 0 }), other);
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', exitCode: 300 }), other);
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', exitCode: 1.5 }), other);
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', signal: 9 }, () => 'kill -9 /Users/jane'), other, 'a junk signal name is never used');
  assert.deepEqual(S.classifyLogEvent({ kind: 'agent-exit', signal: 9, exitCode: 255 }, () => undefined), { kind: 'agent-exit', detail: 'code-255' });
  assert.equal(S.validateReport(goodReport({ kind: 'agent-exit', detail: 'other' })), null);
  assert.equal(S.validateReport(goodReport({ kind: 'agent-exit', detail: 'code-256' })), 'detail');
});

test('an error name comes only from a real Error shaped like an error class', () => {
  // Value: protects=a rejected record ({ name: 'Pete' }) or an Error renamed to a person never reaches a public issue title; fails_when=errorName reads .name off any object or accepts any word; why_new=security review; seam=none; no_claim=every error class a library throws
  assert.equal(S.errorName({ name: 'Pete', role: 'sales' }), 'Error');
  assert.equal(S.errorName(new TypeError('x')), 'TypeError');
  const renamed = new Error('x'); renamed.name = 'Pete';
  assert.equal(S.errorName(renamed), 'Error');
  class QuotaExceededError extends Error { constructor() { super('x'); this.name = 'QuotaExceededError'; } }
  assert.equal(S.errorName(new QuotaExceededError()), 'QuotaExceededError');
  assert.equal(S.errorName('boom'), 'Error');
  const base = { kind: 'canary', detail: 'release', errorName: 'Error', frames: [], fingerprint: '000000000000', appVersion: '0.2.9', os: 'linux', osVersion: '0', arch: 'x64', engine: 'none', engineVersion: 'unknown', count: 1 };
  assert.equal(S.validateReport({ ...base, errorName: 'Pete' }), 'errorName');
  assert.equal(S.validateReport({ ...base, errorName: 'AbortError' }), null);
});

test('every prerelease form the release workflow publishes is a valid version', () => {
  // Value: protects=a beta or alpha build still keeps reports and its canary validates; fails_when=only rc is accepted; why_new=red team; seam=none; no_claim=tags the workflow does not publish
  const base = { kind: 'canary', detail: 'release', errorName: 'Error', frames: [], fingerprint: '000000000000', os: 'linux', osVersion: '0', arch: 'x64', engine: 'none', engineVersion: 'unknown', count: 1 };
  for (const v of ['0.2.9', '0.2.9-rc.1', '0.3.0-beta.2', '0.3.0-alpha.1']) assert.equal(S.validateReport({ ...base, appVersion: v }), null, v);
  for (const v of ['0.2.9-dev', '0.2.9-beta', 'v0.2.9', '0.2']) assert.equal(S.validateReport({ ...base, appVersion: v }), 'appVersion', v);
});

test('a full disk or quota is the owner\'s on every path, never a report', () => {
  // Value: protects=owner fixable errors are never filed, from the hook log path as from a direct report (D11; DeepSeek); fails_when=hook-server-error with ENOSPC classifies as hook-server; why_new=DeepSeek review note; seam=none; no_claim=every errno an OS can give
  assert.equal(S.classifyLogEvent({ kind: 'hook-server-error', code: 'ENOSPC' }), null);
  assert.equal(S.classifyLogEvent({ kind: 'hook-server-error', code: 'EDQUOT' }), null);
  assert.deepEqual(S.classifyLogEvent({ kind: 'hook-server-error', code: 'ECONNRESET' }), { kind: 'hook-server', detail: 'ECONNRESET' });
  assert.equal(S.LOG_KIND_CLASS['failure-report-held'], 'none');
});

// Context (issue 661): a loop-agent report said only `error-storm:constrained`,
// which fits an owner's limit of 0, an agent that recovered and was never
// cleared, and a real storm alike. Context is closed facts that tell them apart.

test('context holds closed facts per kind, and a bad one is refused', () => {
  // Value: protects=a report still carries nothing but closed values once it has context; fails_when=a context key or value outside the kind's list is accepted; why_new=context is new (issue 661); seam=none
  const ctx = { limit: '5', limitSet: 'invalid', hits: '5', hardStop: 'off', sinceTool: 'over-4h', codes: '529-529', errorSpan: '1-5m', sinceSuccess: 'never', role: 'member', uptime: '1-4h' };
  const r = goodReport({ kind: 'loop-agent', detail: 'error-storm:constrained', context: ctx });
  assert.equal(S.validateReport(r), null);
  for (const [k, v] of [['limit', 'five'], ['limitSet', 'mine'], ['codes', '529-overloaded'], ['codes', '700'], ['role', 'Pam'], ['sinceTool', '12 minutes'], ['tool', 'mcp__acme_crm__find']]) {
    assert.equal(S.validateReport({ ...r, context: { ...ctx, [k]: v } }), 'context', `${k}=${v} is refused`);
  }
  assert.equal(S.validateReport({ ...r, context: { ...ctx, note: 'hello' } }), 'context', 'an unknown key is refused');
  assert.equal(S.validateReport({ ...r, context: {} }), 'context', 'an empty context is left out, never sent');
  assert.equal(S.validateReport(goodReport({ context: { limit: '5' } })), 'context', 'loop keys belong to loop-agent only');
  assert.equal(S.validateReport(goodReport({ context: { role: 'michael', uptime: 'under-1m' } })), null, 'role and uptime fit any kind');
  assert.deepEqual(S.cleanContext('loop-agent', { ...ctx, note: 'x', limit: 'five' }), Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== 'limit').sort()), 'cleanContext keeps only valid entries');
});

test('an issue body with context reads back exactly, and context leaves the fingerprint alone', () => {
  // Value: protects=the promotion Action re-renders the same issue from a report with context, and one failure still groups as one issue; fails_when=context rows do not read back, or context is hashed into the fingerprint; why_new=context is new; seam=none
  const r = goodReport({ kind: 'loop-agent', detail: 'repeat:stopped', frames: [], context: { hits: '8', limit: '8', limitSet: 'default', tool: 'Bash' } });
  const body = S.issueBody(r);
  assert.match(body, /\| context\.tool \| `Bash` \|/);
  assert.match(body, /Noticed in: src\/main\/breaker\.ts/);
  assert.deepEqual(S.parseIssueBody(body), r);
  assert.deepEqual(S.parseIssueBody(S.issueBody(goodReport())), goodReport(), 'a report without context reads back without one');
  assert.equal(S.parseIssueBody(body.replace('`Bash`', '`see https://scam.example`')), null, 'a forged context value is refused');
  assert.equal(S.fingerprintInput(r.kind, r.detail, r.errorName, r.frames), S.fingerprintInput('loop-agent', 'repeat:stopped', 'TypeError', []));
  assert.doesNotMatch(S.issueBody({ ...r, context: { tool: 'mcp__acme_crm__find', limit: '8' } }), /acme/, 'only checked context reaches the body');
});

test('every kind names the code that notices it, and that code exists', () => {
  // Value: protects=whoever picks an issue up starts in the right file; fails_when=a kind has no source or names a file that moved; why_new=Noticed in is new; seam=source
  for (const k of S.FAILURE_KINDS) {
    const src = S.KIND_SOURCE[k];
    assert.ok(src, k);
    assert.ok(fs.existsSync(path.join(root, src.split(' ')[0])), `${k}: ${src}`);
  }
});

test('a loop trip turns the breaker facts into closed fields', () => {
  // Value: protects=an error storm report says the limit, where it came from, the statuses and whether a request got through; fails_when=the context drops a fact, sends a raw time or number list, or names an MCP tool; why_new=issue 661; seam=none
  const now = 1_700_000_000_000;
  const facts = {
    limit: 5, limitSet: 'invalid', hits: 5, hardStop: true, lastDistinctToolAt: now - 3 * 3600_000,
    tool: 'mcp__acme_crm__find', errorCodes: [500, 529, 529, 529, 529, 999], errorRunStartedAt: now - 2 * 60_000,
    lastErrorAt: now - 30_000, lastApiSuccessAt: now - 60_000
  };
  assert.deepEqual(S.loopAgentContext('error-storm', facts, now), {
    codes: '500-529-529-529-529', errorSpan: '1-5m', hardStop: 'on', hits: '5', limit: '5', limitSet: 'invalid',
    sinceSuccess: '1-5m', sinceTool: '1-4h'
  });
  const loop = S.loopAgentContext('repeat', { ...facts, limitSet: 'default', limit: 8, hits: 8 }, now);
  assert.equal(loop.tool, 'mcp', 'an MCP tool is only mcp');
  assert.equal(loop.codes, undefined, 'error details only for an error storm');
  const quiet = S.loopAgentContext('error-storm', { ...facts, errorCodes: [], lastApiSuccessAt: now - 3600_000 * 9, lastDistinctToolAt: 0 }, now);
  assert.equal(quiet.codes, 'none');
  assert.equal(quiet.sinceSuccess, 'never', 'a success from before the run says nothing about it');
  assert.equal(quiet.sinceTool, 'never');
  assert.equal(S.validateReport(goodReport({ kind: 'loop-agent', detail: 'error-storm:stopped', context: S.loopAgentContext('error-storm', facts, now) })), null);
  assert.equal(S.agoBucket(59_999), 'under-1m');
  assert.equal(S.agoBucket(4 * 3600_000), 'over-4h');
  assert.equal(S.agoBucket(Number.NaN), 'never');
});
