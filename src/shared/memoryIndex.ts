/**
 * An agent's memory as an index of one-line entries (owner, 2026-09-25).
 *
 * `agents/<id>/memory.md` is the index. Only the app writes it: an agent adds
 * candidate notes to `memory/inbox.md`, and a background tidy-up (memoryTidy.ts,
 * on Haiku) turns them into itemised changes (add, update, delete, procedure)
 * applied here, never a rewrite of the whole file. Research behind the design
 * is in docs/designs/agent-instructions (ACE's "context collapse" is why a full
 * rewrite is never allowed; Mem0's add/update/delete/nothing is the shape).
 *
 *  - The index stays small (INDEX_BUDGET_TOKENS) and is given to the agent once
 *    per session, so it caches.
 *  - A replaced or deleted entry goes to `memory/archive.md`, never silently lost.
 *  - Steps for a recurring task live in `memory/procedures/<name>.md`, with a
 *    one-line pointer in the index.
 *  - Nothing is forgotten for being unused (owner, 2026-09-25).
 *
 * Pure: no fs. memoryTidy.ts does the reading and writing.
 */

export const MEMORY_KINDS = ['preference', 'fact', 'reference', 'procedure'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];

/** Who a note came from. Only the owner's words make a preference binding. */
export const MEMORY_SOURCES = ['owner', 'michael', 'task', 'tool'] as const;
export type MemorySource = typeof MEMORY_SOURCES[number];

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  text: string;
  source: MemorySource;
  /** YYYY-MM-DD the entry was written or last updated. */
  date: string;
  /** YYYY-MM-DD after which a fact that changes (a price, a rate) needs checking again. */
  expires?: string;
  /** What showed it ("the owner said so on Ask me, card c12, 2026-10-24"),
   *  the way harness2 keeps a lesson only with its evidence. Saved in the file
   *  and the archive for tidy and the Memory tab; never in the session block. */
  evidence?: string;
}

export type MemoryOp =
  | { op: 'add'; kind: MemoryKind; text: string; source: MemorySource; expires?: string; evidence?: string }
  | { op: 'update'; id: string; text?: string; kind?: MemoryKind; expires?: string; repeat?: boolean; evidence?: string; source?: MemorySource }
  | { op: 'delete'; id: string; reason: string }
  | { op: 'procedure'; name: string; steps: string; source: MemorySource };

/** The always-loaded index stays under this (about 8,000 characters). */
export const INDEX_BUDGET_TOKENS = 2000;
/** A tidy-up is asked to shrink the index once it passes this share of the budget. */
export const INDEX_PRUNE_AT = 0.9;
/** One entry is one line. */
export const MAX_ENTRY_CHARS = 200;
/** An entry's evidence is one short line. */
export const MAX_EVIDENCE_CHARS = 120;
/** A procedure file stays under this. */
export const MAX_PROCEDURE_CHARS = 16_000;

/** Marks a file as an index in this format; older free-form files lack it. */
export const INDEX_MARKER = '<!-- memory index v1 -->';

/** Rough tokens for a text: about four characters each. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY = /^- \[(m\d+)\] (\w+) \| (.+?) \| (\w+) \| (\d{4}-\d{2}-\d{2})(?: \| expires (\d{4}-\d{2}-\d{2}))?$/;
// An entry's evidence is the indented line right under it. On a line of its
// own, an older build that can't read it skips just that line and keeps the
// entry; a field at the end of the entry line would lose the whole entry.
const EVIDENCE = /^\s+why: (.+)$/;

/** The entries in an index, and whether the file is one (an older free-form
 *  memory.md is not, and is migrated by its first tidy-up). */
export function parseIndex(text: string): { isIndex: boolean; entries: MemoryEntry[] } {
  const isIndex = text.includes(INDEX_MARKER);
  const entries: MemoryEntry[] = [];
  let last: MemoryEntry | null = null;
  for (const line of text.split('\n')) {
    const why = EVIDENCE.exec(line);
    if (why) {
      const evidence = evidenceText(why[1]);
      if (last && evidence) last.evidence = evidence;
      last = null;
      continue;
    }
    last = null;
    const m = ENTRY.exec(line.trim());
    if (!m) continue;
    const [, id, kind, body, source, date, expires] = m;
    if (!(MEMORY_KINDS as readonly string[]).includes(kind)) continue;
    if (!(MEMORY_SOURCES as readonly string[]).includes(source)) continue;
    last = { id, kind: kind as MemoryKind, text: body, source: source as MemorySource, date, ...(expires ? { expires } : {}) };
    entries.push(last);
  }
  return { isIndex, entries };
}

/** One entry as its index line, as the agent is given it: no evidence. */
export function entryLine(e: MemoryEntry): string {
  return `- [${e.id}] ${e.kind} | ${e.text} | ${e.source} | ${e.date}${e.expires ? ` | expires ${e.expires}` : ''}`;
}

/** One entry as memory.md and the tidy-up hold it: its line, then its
 *  evidence on the line below when it has any. */
export function entryLines(e: MemoryEntry): string {
  return e.evidence ? `${entryLine(e)}\n  why: ${e.evidence}` : entryLine(e);
}

/** The whole index file. */
export function renderIndex(name: string, id: string, entries: MemoryEntry[]): string {
  return [
    `# Memory, ${name} (${id})`,
    '',
    INDEX_MARKER,
    'The app keeps this file. Add notes to memory/inbox.md; they are sorted in here in the background.',
    '',
    ...entries.map(entryLines),
    ''
  ].join('\n');
}

/** Just the entries, as an agent is given them at session start, and as the
 *  index budget counts them: without evidence, so evidence costs no session room. */
export function entriesBlock(entries: MemoryEntry[]): string {
  return entries.map(entryLine).join('\n');
}

/** The entries with their evidence, for the tidy-up to weigh. */
export function entriesWithEvidence(entries: MemoryEntry[]): string {
  return entries.map(entryLines).join('\n');
}

/** Candidate notes in an inbox: each bullet or paragraph is one note. */
export function parseInbox(text: string): string[] {
  const notes: string[] = [];
  let cur: string[] = [];
  const flush = () => { const n = cur.join(' ').replace(/\s+/g, ' ').trim(); if (n) notes.push(n); cur = []; };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^#/.test(line)) { flush(); continue; }
    if (/^([-*]|\d+[.)])\s+/.test(line)) { flush(); cur.push(line.replace(/^([-*]|\d+[.)])\s+/, '')); continue; }
    cur.push(line);
  }
  flush();
  return notes;
}

/** The notes an older free-form memory.md holds, for its one-time migration. */
export function legacyNotes(text: string): string[] {
  const body = text
    .split('\n')
    .filter((l) => !/^# Memory\b/.test(l) && !/^_Append durable facts/.test(l))
    .join('\n');
  return parseInbox(body);
}

/** "Weekly money summary" → "weekly-money-summary". */
export function procedureSlug(name: string): string {
  // Normalize before lowercasing: NFKD can turn a letter like ℍ into an uppercase H.
  const s = name.normalize('NFKD').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  // A name with no Latin letters or digits (每周财务汇总, إغلاق اليوم) leaves
  // nothing above; a hash of it keeps each such procedure in its own file.
  return s.slice(0, 60).replace(/-$/, '') || `procedure-${nameHash(name)}`;
}

/** FNV-1a of the trimmed name, in base 36: the same name always gives the same slug. */
function nameHash(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name.normalize('NFC').trim()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const oneLine = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return s ? s.slice(0, MAX_ENTRY_CHARS) : undefined;
};
const dateOr = (v: unknown): string | undefined => (typeof v === 'string' && DATE.test(v) ? v : undefined);
/** Evidence as one clean line under MAX_EVIDENCE_CHARS, or undefined. */
export function evidenceText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return s ? s.slice(0, MAX_EVIDENCE_CHARS) : undefined;
}

export interface ValidatedOps {
  ops: MemoryOp[];
  /** Model ops the checks dropped, counted by reason. Empty when all were usable. */
  dropped: Record<string, number>;
}

/** The model's ops, checked: unknown ops, ids and kinds are dropped, each
 *  counted by reason so a tidy run shows how much of the reply was usable.
 *  `ownerWords` false (no note from the owner in this pass, memory evidence
 *  D5, D9): nothing can be the owner's, so an add or a procedure marked owner
 *  is filed as the member's own, and an owner entry or procedure is never
 *  deleted or rewritten; a repeat or a new expiry on it still lands. Evidence
 *  holds too (D5): an update that rewords an entry with evidence, from the
 *  same kind of source, lands only with evidence of its own. */
export function validateOps(raw: unknown, entries: MemoryEntry[], ownerWords = true): ValidatedOps {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { ops?: unknown }).ops) ? (raw as { ops: unknown[] }).ops : [];
  const ids = new Set(entries.map((e) => e.id));
  const ownerIds = new Set(entries.filter((e) => e.source === 'owner').map((e) => e.id));
  const kind = (v: unknown): MemoryKind | undefined => ((MEMORY_KINDS as readonly string[]).includes(v as string) ? v as MemoryKind : undefined);
  const source = (v: unknown): MemorySource => ((MEMORY_SOURCES as readonly string[]).includes(v as string) ? v as MemorySource : 'task');
  const out: MemoryOp[] = [];
  const dropped: Record<string, number> = {};
  const drop = (reason: string) => { dropped[reason] = (dropped[reason] ?? 0) + 1; };
  // Evidence that can't be used is left off and counted; the op still lands,
  // because dropping it would lose the note the tidy-up already took in.
  const evidence = (r: Record<string, unknown>): { evidence?: string } => {
    if (r.evidence === undefined) return {};
    const v = evidenceText(r.evidence);
    if (!v) { drop('bad-evidence'); return {}; }
    return { evidence: v };
  };
  // An update may move an entry to another source: to the owner's when the
  // owner's note corrects it, never without the owner's words in the pass.
  const updateSource = (r: Record<string, unknown>): { source?: MemorySource } => {
    if (!(MEMORY_SOURCES as readonly string[]).includes(r.source as string)) return {};
    if (r.source === 'owner' && !ownerWords) { drop('not-owner'); return {}; }
    return { source: r.source as MemorySource };
  };
  for (const o of list) {
    if (!o || typeof o !== 'object') { drop('malformed'); continue; }
    const r = o as Record<string, unknown>;
    if (r.op === 'add') {
      const k = kind(r.kind); const text = oneLine(r.text);
      if (!k || k === 'procedure') { drop('bad-kind'); continue; }
      if (!text) { drop('missing-text'); continue; }
      let src = source(r.source);
      if (src === 'owner' && !ownerWords) { drop('not-owner'); src = 'task'; }
      out.push({ op: 'add', kind: k, text, source: src, ...(dateOr(r.expires) ? { expires: dateOr(r.expires) } : {}), ...evidence(r) });
    } else if (r.op === 'update') {
      if (typeof r.id !== 'string' || !ids.has(r.id)) { drop('unknown-id'); continue; }
      const was = entries.find((e) => e.id === r.id)!;
      const words = oneLine(r.text);
      if (!ownerWords && ownerIds.has(r.id)
        && ((words && words !== was.text) || (kind(r.kind) && r.kind !== was.kind) || r.evidence !== undefined
          || (r.source !== undefined && r.source !== 'owner'))) { drop('owner-entry'); continue; }
      const src = updateSource(r);
      const ev = evidence(r);
      if (was.evidence && words && words !== was.text && !ev.evidence && (!src.source || src.source === was.source)) { drop('needs-evidence'); continue; }
      out.push({
        op: 'update', id: r.id,
        ...(words ? { text: words } : {}),
        ...(kind(r.kind) && r.kind !== 'procedure' ? { kind: kind(r.kind) } : {}),
        ...(dateOr(r.expires) ? { expires: dateOr(r.expires) } : {}),
        ...(r.repeat === true ? { repeat: true } : {}),
        ...ev,
        ...src
      });
    } else if (r.op === 'delete') {
      if (typeof r.id !== 'string' || !ids.has(r.id)) { drop('unknown-id'); continue; }
      if (!ownerWords && ownerIds.has(r.id)) { drop('owner-entry'); continue; }
      out.push({ op: 'delete', id: r.id, reason: oneLine(r.reason) ?? 'replaced' });
    } else if (r.op === 'procedure') {
      const name = oneLine(r.name);
      const steps = typeof r.steps === 'string' ? r.steps.trim().slice(0, MAX_PROCEDURE_CHARS) : '';
      if (!name || !steps) { drop('missing-text'); continue; }
      // The owner's steps stay the owner's: without their words in the pass, a
      // procedure is the member's own and never rewrites one the owner gave.
      const path = `memory/procedures/${procedureSlug(name)}.md`;
      if (!ownerWords && entries.some((e) => e.source === 'owner' && e.kind === 'procedure' && e.text.includes(path))) { drop('owner-entry'); continue; }
      let src = source(r.source);
      if (src === 'owner' && !ownerWords) { drop('not-owner'); src = 'task'; }
      out.push({ op: 'procedure', name, steps, source: src });
    } else {
      drop('unknown-op');
    }
  }
  return { ops: out, dropped };
}

export interface TidyOutcome {
  entries: MemoryEntry[];
  /** Entries replaced or deleted, as they were, with why. */
  archived: Array<{ entry: MemoryEntry; reason: string }>;
  /** Procedure files to write: `memory/procedures/<slug>.md`. */
  procedures: Array<{ slug: string; name: string; content: string }>;
  /** Entries that are new to the index, not edits of one already there, for
   *  Pulse's Learning count (owner, 2026-10-18: an edit is not a new note). */
  added: Array<{ id: string; source: MemorySource }>;
  stats: { added: number; updated: number; deleted: number; procedures: number; repeats: number; dupes: number };
}

/** Apply checked ops to the entries. Deterministic; the model never writes the file.
 *  An add whose text matches an entry already in the index at that point in the
 *  batch (including earlier adds), ignoring case and extra whitespace, is
 *  skipped and counted as a dupe. Checked against the index as it stands, so a
 *  delete or an update that moves text away leaves room for that text again. */
export function applyOps(entries: MemoryEntry[], ops: MemoryOp[], today: string): TidyOutcome {
  let next = entries.map((e) => ({ ...e }));
  const archived: TidyOutcome['archived'] = [];
  const procedures: TidyOutcome['procedures'] = [];
  const added: TidyOutcome['added'] = [];
  const stats = { added: 0, updated: 0, deleted: 0, procedures: 0, repeats: 0, dupes: 0 };
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  let n = next.reduce((max, e) => Math.max(max, Number(e.id.slice(1)) || 0), 0);
  const newId = () => `m${++n}`;

  for (const op of ops) {
    if (op.op === 'add') {
      const key = norm(op.text);
      if (next.some((x) => norm(x.text) === key)) { stats.dupes++; continue; }
      const id = newId();
      next.push({ id, kind: op.kind, text: op.text, source: op.source, date: today, ...(op.expires ? { expires: op.expires } : {}), ...(op.evidence ? { evidence: op.evidence } : {}) });
      added.push({ id, source: op.source });
      stats.added++;
    } else if (op.op === 'update') {
      const i = next.findIndex((e) => e.id === op.id);
      if (i < 0) continue;
      const before = next[i];
      const rewritten = !!op.text && op.text !== before.text;
      const after: MemoryEntry = {
        ...before,
        ...(op.text ? { text: op.text } : {}),
        ...(op.kind ? { kind: op.kind } : {}),
        ...(op.expires ? { expires: op.expires } : {}),
        ...(op.source ? { source: op.source } : {}),
        date: today
      };
      // New words take the op's evidence or none: the old evidence was for
      // the old words, and the archive keeps the two together.
      if (op.evidence) after.evidence = op.evidence;
      else if (rewritten) delete after.evidence;
      if (rewritten) archived.push({ entry: before, reason: 'updated' });
      next[i] = after;
      stats.updated++;
      if (op.repeat) stats.repeats++;
    } else if (op.op === 'delete') {
      const i = next.findIndex((e) => e.id === op.id);
      if (i < 0) continue;
      archived.push({ entry: next[i], reason: op.reason });
      next = next.filter((_, j) => j !== i);
      stats.deleted++;
    } else if (op.op === 'procedure') {
      const slug = procedureSlug(op.name);
      const path = `memory/procedures/${slug}.md`;
      procedures.push({ slug, name: op.name, content: `# ${op.name}\n\n${op.steps}\n\nUpdated ${today}.\n` });
      // Shorten the name, never the path: the agent needs the path to find it.
      const pointer = `${op.name.slice(0, Math.max(1, MAX_ENTRY_CHARS - path.length - 11))}: steps in ${path}`;
      const i = next.findIndex((e) => e.kind === 'procedure' && e.text.includes(path));
      if (i >= 0) next[i] = { ...next[i], text: pointer, date: today };
      else {
        const id = newId();
        next.push({ id, kind: 'procedure', text: pointer, source: op.source, date: today });
        added.push({ id, source: op.source });
      }
      stats.procedures++;
    }
  }
  // An id added and then deleted in the same pass never reaches the file; an
  // id deleted and given out again counts once, as its last add.
  const kept = new Set(next.map((e) => e.id));
  const once = new Map(added.filter((a) => kept.has(a.id)).map((a) => [a.id, a] as const));
  return { entries: next, archived, procedures, added: [...once.values()], stats };
}

/** Archive lines for replaced or deleted entries. */
export function archiveLines(archived: TidyOutcome['archived'], today: string): string {
  return archived.map(({ entry, reason }) => `${entryLine(entry)} | archived ${today}: ${reason.replace(/\|/g, '/')}${entry.evidence ? `\n  why: ${entry.evidence}` : ''}`).join('\n');
}

// ─── Reading it: the Memory tab (docs/designs/memory-tab-readable.md) ────────

/** The order the Memory tab shows the kinds in: the owner's own words first. */
export const MEMORY_VIEW_ORDER: readonly MemoryKind[] = ['preference', 'procedure', 'fact', 'reference'];

export interface MemoryView {
  isIndex: boolean;
  /** Non-empty groups only, in MEMORY_VIEW_ORDER. */
  groups: Array<{ kind: MemoryKind; entries: MemoryEntry[] }>;
  /** Lines in an index that aren't entries (a hand-written "- LESSON: ..."),
   *  without their bullet. The parser skips them; the owner shouldn't lose them. */
  other: string[];
}

const INDEX_NOTE = /^The app keeps this file\b/;

/** An index file as the Memory tab shows it. */
export function memoryView(text: string): MemoryView {
  const { isIndex, entries } = parseIndex(text);
  const groups = MEMORY_VIEW_ORDER
    .map((kind) => ({ kind, entries: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.entries.length > 0);
  const other: string[] = [];
  if (isIndex) {
    const kept = new Set(entries.map((e) => e.id));
    // An evidence line belongs to the entry right above it, which shows it.
    let underEntry = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const attached = underEntry && EVIDENCE.test(raw);
      underEntry = false;
      if (attached) continue;
      if (!line || line.startsWith('#') || line === INDEX_MARKER || INDEX_NOTE.test(line)) continue;
      const m = ENTRY.exec(line);
      if (m && kept.has(m[1])) { underEntry = true; continue; }
      const body = line.replace(/^[-*]\s+/, '').trim();
      if (body) other.push(body);
    }
  }
  return { isIndex, groups, other };
}

/** A procedure pointer ("Shutdown protocol: steps in memory/procedures/shutdown-protocol.md")
 *  split into the name to show and the slug to read, or null for any other text. */
export function procedurePointer(text: string): { name: string; slug: string } | null {
  const m = /^(.*): steps in memory\/procedures\/([a-z0-9-]{1,60})\.md$/.exec(text.trim());
  return m && m[1].trim() ? { name: m[1].trim(), slug: m[2] } : null;
}

/** A slug in the character set procedureSlug writes (a to z, 0 to 9, hyphen),
 *  the same one procedurePointer reads: no "/" and no ".", so it can't point
 *  outside the folder. Looser than it looks on purpose: procedureSlug can leave
 *  a leading hyphen ("-foo"), and that file must still open (review, 2026-09-25). */
export function isProcedureSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && /^[a-z0-9-]{1,60}$/.test(slug);
}

/** Whether a fact's "check again" date is still ahead, or has passed. Dates are
 *  YYYY-MM-DD, so they compare as strings; `today` is the local date. */
export function expiryState(expires: string | undefined, today: string): 'none' | 'future' | 'passed' {
  if (!expires || !DATE.test(expires)) return 'none';
  return expires < today ? 'passed' : 'future';
}
