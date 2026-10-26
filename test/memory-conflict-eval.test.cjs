/**
 * Eval: the tidy-up's order for notes that disagree (memory evidence, D5),
 * run against the real model: the tidy-up's own prompt and model
 * (claude-haiku-4-5), sent with `claude -p` and no tools instead of the app's
 * hidden terminal session, so it runs from any shell. Off by default, since
 * it makes three model calls; run it with:
 *
 *   MEMORY_EVAL=1 node --test test/memory-conflict-eval.test.cjs
 *
 * The cases, one per step of the order:
 *  1. the owner's word: a note from the owner replaces a member's entry;
 *  2. evidence: between two of the member's own, the entry with evidence holds
 *     against a newer note with none;
 *  3. newer: with no evidence on either side, the newer note wins.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

// The same prompt the app sends, through print mode. Outside a Claude Code
// session's own variables, which would turn off what the CLI saves.
loadTs('src/main/hiddenModel.ts').runHiddenModel = async (prompt, opts) => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  const r = spawnSync('claude', ['-p', '--model', opts.model, '--tools', '', '--strict-mcp-config'], { input: prompt, cwd: opts.cwd, env, encoding: 'utf8', timeout: opts.timeoutMs });
  return r.status === 0 && r.stdout.trim() ? { ok: true, text: r.stdout } : { ok: false, error: (r.stderr || r.error?.message || 'no reply').slice(0, 300) };
};

const mi = loadTs('src/shared/memoryIndex.ts');
const { MemoryTidy } = loadTs('src/main/memoryTidy.ts');

const skip = process.env.MEMORY_EVAL === '1' ? false : 'set MEMORY_EVAL=1 to run against the model';

async function tidyCase(t, { entries, inbox = [], owner = [] }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memeval-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = path.join(home, 'hive', 'agents', 'oscar');
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'memory.md'), mi.renderIndex('Oscar', 'oscar', entries));
  if (inbox.length) fs.writeFileSync(path.join(dir, 'memory', 'inbox.md'), inbox.map((n) => `- ${n}`).join('\n') + '\n');
  let pending = owner.map((n, i) => ({ id: i + 1, agentId: 'oscar', at: '2026-10-23T12:00:00.000Z', ...n }));
  const store = { pending: () => pending, filed: (ids) => { pending = pending.filter((n) => !ids.includes(n.id)); } };
  const log = [];
  const tidy = new MemoryTidy(() => home, () => 'claude', () => ({}), () => true, () => 'Oscar', (e) => log.push(e), () => ({}), () => {}, () => store);
  const [r] = await tidy.tidyNow('oscar');
  assert.equal(r?.tidied, true, JSON.stringify(log));
  return mi.parseIndex(fs.readFileSync(path.join(dir, 'memory.md'), 'utf8')).entries;
}

const said = (entries, re) => entries.filter((e) => re.test(e.text));

test('1. the owner\'s word replaces a member\'s entry', { skip, timeout: 240_000 }, async (t) => {
  const entries = await tidyCase(t, {
    entries: [{ id: 'm1', kind: 'fact', text: 'Supplier invoices are paid on the 30th', source: 'task', date: '2026-10-01', evidence: 'last month\'s ledger, 2026-10-01' }],
    owner: [{ text: 'From the owner (2026-10-23), answering a question on "Invoices": Q: When do we pay supplier invoices? A: Always on the 15th from now on.', why: 'you answered on Ask me on card t_1, 2026-10-23' }]
  });
  assert.equal(said(entries, /\b30th\b/).length, 0, entries.map((e) => e.text).join('\n'));
  const now = said(entries, /\b15th\b/);
  assert.equal(now.length, 1);
  assert.equal(now[0].source, 'owner');
});

test('2. an entry with evidence holds against a newer note with none', { skip, timeout: 240_000 }, async (t) => {
  const entries = await tidyCase(t, {
    entries: [{ id: 'm1', kind: 'fact', text: 'The warehouse closes at 5pm on weekdays', source: 'task', date: '2026-10-20', evidence: 'warehouse website, checked 2026-10-20' }],
    inbox: ['I think the warehouse closes at 4pm on weekdays.']
  });
  assert.equal(said(entries, /\b5\s?pm\b/i).length, 1, entries.map((e) => e.text).join('\n'));
  assert.equal(said(entries, /\b4\s?pm\b/i).filter((e) => !/\b5\s?pm\b/i.test(e.text)).length, 0, 'the unbacked note did not replace it');
});

test('3. with no evidence either side, the newer note wins', { skip, timeout: 240_000 }, async (t) => {
  const entries = await tidyCase(t, {
    entries: [{ id: 'm1', kind: 'reference', text: 'Signed contracts are kept in the Contracts folder', source: 'task', date: '2026-09-01' }],
    inbox: ['Signed contracts are now kept in the Legal folder, the Contracts folder was retired.']
  });
  assert.equal(said(entries, /\bLegal\b/).length, 1, entries.map((e) => e.text).join('\n'));
  assert.equal(said(entries, /\bContracts folder\b/i).filter((e) => !/\bLegal\b/.test(e.text)).length, 0);
});
