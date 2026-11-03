/**
 * Company foundations' one writer (docs/designs/office-foundations.md, eng
 * review): the record lives in the app's private folder, out of every member's
 * reach, and only this class writes it. Members reach it through the hive
 * route `foundations`; the owner through the foundation card.
 *
 *   member ─(answer + source | gap | draft)─► handle()
 *     ├─ source checked: an owner message the app kept as sent to the sender, or a file in the
 *     │  office folders; Michael's confirmation; anything else, what a member says the
 *     │  owner taught it included, goes to Michael
 *     ├─ fill only empty, owner wins, cap, a clash goes to Michael
 *     ├─ a gap kept once per question, the first one told to Michael
 *     ├─ foundations.json ─► telemetry event (harness.db, Pulse)
 *     ├─ company profile kept in step (owner wins)
 *     └─ publish soon ─► the Company foundations copy in company knowledge
 */
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { privateRoot } from '../shared/agentPrivatePaths';
import { writeFileAtomic } from './atomicFile';
import {
  FIT_PICTURES, FIT_TEXT_MAX, FOLDER_REF, FOUNDATION_FILE_TAG, FOUNDATION_QUESTIONS, FOUNDATIONS_TAG, FOUNDATIONS_TITLE, SEEN_ITEM_MAX, SEEN_LATER_MS, capFor, cleanRecord, emptyRecord, fileAnswerLine, folderAnswerLine, isExpired, isFoundationId, isFoundationsDoc, isLater, isListQuestion, isSettled, itemKey, joinListLines, listState, oneLine, questionOf, questionVersion, questionsFor, renderFoundations,
  type Coverage, type FoundationAnswer, type FoundationId, type FoundationJob, type FoundationPast, type FoundationSourceKind, type FoundationsRecord, type FoundationsView, type SeenItem
} from '../shared/foundations';
import { IMAGES, type DocExtraction } from './docText';
import type { FileFitCheck } from './fileFitCheck';

/** The profile facts the foundations share (one set of facts, eng finding 6). */
export interface ProfileFacts { hours?: string; fiscalYearStartMonth?: number }

export interface FoundationsDeps {
  /** The office's data folder; null while no office is open. */
  home: () => string | null;
  now?: () => number;
  /** One telemetry event per change (harness.db, eng finding 4). */
  record?: (ev: { agentId: string | null; kind: 'foundation'; ts: number; attrs: Record<string, unknown> }) => void;
  /** Publish the document into company knowledge, replacing the old copy;
   *  returns the new document id. A throw keeps the record and retries later. */
  publish?: (text: string, oldId: string | undefined) => string | undefined;
  /** The jobs the office has, for which sections the document prints. */
  jobs?: () => FoundationJob[];
  nameOf?: (id: string) => string;
  godId?: () => string | null;
  profile?: () => ProfileFacts;
  setProfile?: (patch: ProfileFacts) => void;
  /** Whether a message with this id came from the owner and reached this
   *  member (the owner's private list, never the shared hive log). */
  ownerSaid?: (messageId: string, recipient: string) => boolean;
  /** A member's jobs: a gap counts only for its own job's questions. */
  jobsOf?: (agentId: string) => FoundationJob[];
  /** Whether a published copy is still in company knowledge. */
  exists?: (docId: string) => boolean;
  /** Whether a path is a file inside the office folders this member can read. */
  inOffice?: (path: string, agentId: string) => boolean;
  /** An app message to a member or Michael, sent as `foundations`. */
  tell?: (to: string, subject: string, body: string) => void;
  /** The record changed (the renderer refreshes). */
  changed?: () => void;
  /** Delay before a change is published, so a burst publishes once. */
  publishDelayMs?: number;
  /** A file added on a foundation card (foundation-card-upload.md): read
   *  once, checked for fit, then added to company knowledge. */
  readFile?: (path: string) => Promise<DocExtraction>;
  fitFile?: FileFitCheck;
  addToKnowledge?: (path: string, read: DocExtraction, opts: { title: string; tags: string[] }) => string;
  /** A company knowledge document's title, or undefined when it is gone. */
  docTitle?: (docId: string) => string | undefined;
  /** The owner's home folder and the office's business and team folders, which
   *  a folder named on a card may not be or hold (eng review 2026-10-26, D3). */
  folderBounds?: () => { userHome?: string; business?: string; team: string[] };
  /** Whether paths compare without case (Mac and Windows). */
  caseInsensitive?: boolean;
  /** Reports sent to Michael since `sinceMs` by the team members whose job
   *  uses the question, newest first (docs/designs/foundation-answers-stay-open.md, R7). */
  reportsFor?: (id: FoundationId, sinceMs: number) => Array<{ from: string; subject: string; at: number }>;
}

/** How far back the reports note looks, and how many it lists (R7). */
const REPORTS_WINDOW_MS = 60 * 86_400_000;
const REPORTS_MAX = 20;
/** Shelf lives are checked at most this often (eng review, Architecture 3). */
const EXPIRY_CHECK_MS = 3_600_000;

/** The coverage of a whole list, saved today. */
type CoverageDecision = { ok: true; coverage: Coverage; remaining: SeenItem[] } | { ok: false };

/** What the owner can do with a seen item on a list card (design review D4, D7). */
export type SeenAction = 'notOurs' | 'undoNotOurs' | 'later' | 'undoLater';

/** Why a file added on a card was not taken; each has its own card line. */
export type AddFileError = 'unknown' | 'no-office' | 'no-file' | 'unreadable' | 'picture-type' | 'picture-engine' | 'misfit' | 'unchecked';

/** Why a folder named on a card was not taken; each has its own card line. */
export type FolderError = 'unknown' | 'no-office' | 'no-folder' | 'too-wide' | 'app-folder' | 'member-folder' | 'empty' | 'too-long';

/** How many entries the empty folder probe reads, at most. */
const FOLDER_PROBE_MAX = 200;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthName = (m: number): string => MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1);

/** The profile fields a question shares, both ways. */
const PROFILE_LINKS: Array<{ id: FoundationId; read: (p: ProfileFacts) => string | undefined; write: (text: string) => ProfileFacts | null }> = [
  {
    id: 'hours',
    read: (p) => (typeof p.hours === 'string' && p.hours.trim() ? p.hours.trim() : undefined),
    write: (text) => ({ hours: text.slice(0, 200) })
  },
  {
    id: 'fiscal_year',
    read: (p) => (typeof p.fiscalYearStartMonth === 'number' && p.fiscalYearStartMonth >= 1 && p.fiscalYearStartMonth <= 12 ? `Starts in ${monthName(p.fiscalYearStartMonth)}` : undefined),
    write: (text) => {
      const month = firstMonth(text);
      return month ? { fiscalYearStartMonth: month } : null;
    }
  }
];

/** The month a financial year answer starts in: the one after "starts",
 *  "begins" or "from" ("ends in March, starts in April" is April), else the
 *  first month the text names, in its order ("July to June" and "Jul to Jun"
 *  are July; "calendar year" is January). "May" and "Mar" count only
 *  capitalized, so the words "may" and "mar" never read as months. */
export function firstMonth(text: string): number | null {
  for (const m of text.matchAll(/\b(?:starts?|starting|begins?|beginning|from)\b/gi)) {
    // To the end of its clause ("starts on the first business day of April").
    const rest = text.slice(m.index + m[0].length);
    const end = rest.search(/[.;\n]/);
    const after = end === -1 ? rest : rest.slice(0, end);
    const month = earliestMonth(after);
    if (month) return month;
  }
  return earliestMonth(text);
}

function earliestMonth(text: string): number | null {
  let best: { at: number; month: number } | null = null;
  const take = (re: RegExp, month: number): void => {
    const hit = re.exec(text);
    if (hit && (!best || hit.index < best.at)) best = { at: hit.index, month };
  };
  MONTHS.forEach((m, i) => {
    const short = m === 'september' ? 'sept?' : m.slice(0, 3);
    if (m === 'may') take(/\bMay\b/, 5);
    else if (m === 'march') { take(/\bmarch\b/i, 3); take(/\bMar\b/, 3); }
    else take(new RegExp(`\\b(${m}|${short})\\b`, 'i'), i + 1);
  });
  take(/\bcalendar year\b/i, 1);
  return best ? (best as { month: number }).month : null;
}

/** What Michael is told when a question with a gap is answered off its card. */
const CLOSE_CARD = 'If a foundation card for it is open, close it as done.';

const same = (a: string, b: string): boolean => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** "3 Feb 2026" for a note to Michael. */
const day = (iso: string | undefined): string => {
  const d = new Date(iso ?? '');
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}` : 'an earlier day';
};

/** What a member sends to `foundations`, as `"foundation": {...}`. */
export interface FoundationPayload {
  question?: unknown;
  answer?: unknown;
  gap?: unknown;
  /** With a gap on a list: the thing the work saw that the list does not hold. */
  item?: unknown;
  /** From Michael relaying the owner: the owner said it is the whole list. */
  complete?: unknown;
  draft?: unknown;
  source?: unknown;
}

/** How sure the app is of an answer's source, strongest first: the owner's
 *  words through Michael, Michael's confirmation, the owner's words a member
 *  was taught (fills only an empty answer), a file in the office folders. */
type Level = 'owner' | 'michael' | 'taught' | 'file';

export class Foundations {
  private cache: { home: string; rec: FoundationsRecord } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expiryCheckedAt = 0;

  constructor(private readonly d: FoundationsDeps) {}

  private now(): number { return this.d.now ? this.d.now() : Date.now(); }
  private iso(): string { return new Date(this.now()).toISOString(); }

  file(): string | null {
    const home = this.d.home();
    return home ? join(privateRoot(home), 'foundations.json') : null;
  }

  /** The record now (an empty one with no office). */
  read(): FoundationsRecord {
    const home = this.d.home();
    if (!home) return emptyRecord();
    if (this.cache?.home === home) return this.cache.rec;
    const file = this.file()!;
    let rec = emptyRecord();
    try { if (existsSync(file)) rec = cleanRecord(JSON.parse(readFileSync(file, 'utf8'))); } catch {
      // A broken file reads as empty and the next write replaces it, so a copy
      // is kept beside it first: the answers it held can still be put back.
      try { copyFileSync(file, `${file}.broken-${new Date(this.now()).toISOString().replace(/[:.]/g, '-')}`); } catch { /* best effort */ }
      console.error('[foundations] foundations.json could not be read; kept a copy beside it and started empty');
    }
    this.cache = { home, rec };
    return rec;
  }

  private save(rec: FoundationsRecord): void {
    const file = this.file();
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileAtomic(file, JSON.stringify(rec, null, 2));
    this.cache = { home: this.d.home()!, rec };
    try { this.d.changed?.(); } catch { /* the view refreshes on its next read */ }
  }

  /** The office's document as agents read it. */
  document(): string {
    // Each name read once per document (a name is a registry read).
    const names = new Map<string, string>();
    const nameOf = (id: string): string => { let n = names.get(id); if (n === undefined) { n = this.nameOf(id); names.set(id, n); } return n; };
    return renderFoundations(this.read(), this.d.jobs?.() ?? [], nameOf, this.now());
  }

  private nameOf = (id: string): string => (this.d.nameOf ? this.d.nameOf(id) : id);

  private event(agentId: string | null, q: FoundationId, change: 'answered' | 'changed' | 'cleared' | 'hit' | 'coverage' | 'expired', attrs: Record<string, unknown> = {}): void {
    try { this.d.record?.({ agentId, kind: 'foundation', ts: this.now(), attrs: { q, change, ...attrs } }); } catch { /* telemetry never blocks a write */ }
  }

  /**
   * At launch (and for a new office): the record is created when missing, with
   * the company profile's answers as a head start; the profile and the record
   * are brought into step; and a copy that changed is published.
   */
  seed(): void {
    const file = this.file();
    if (!file) return;
    if (!existsSync(file)) this.save(this.read());
    this.migrateLists();
    this.profileChanged();
    this.checkExpiry(true);
    const rec = this.read();
    const gone = !!rec.publishedId && !!this.d.exists && !this.d.exists(rec.publishedId);
    if (rec.publishedText !== this.document() || !rec.publishedId || gone) this.publishSoon(0);
  }

  /**
   * The company profile changed. A Settings save passes the profile before
   * it, and only the fields it changed reach the foundations, so a page opened
   * before a newer answer never undoes it. At launch (no `before`), the
   * profile fills or corrects only answers the owner did not write.
   */
  profileChanged(before?: ProfileFacts): void {
    const p = this.d.profile?.() ?? {};
    const rec = this.read();
    let next = rec;
    const filled: FoundationId[] = [];
    for (const link of PROFILE_LINKS) {
      const v = link.read(p);
      const a = next.answers[link.id];
      if (before ? link.read(before) === v : a?.source === 'owner') continue;
      // In step when the answer says the same in the profile's own short form
      // (a 300 character answer is a 200 character field; "July to June" is month 7).
      const asProfile = a ? (() => { const patch = link.write(a.text); return patch ? link.read(patch) : undefined; })() : undefined;
      if (v && (!a || (!same(a.text, v) && !(asProfile && same(asProfile, v))))) {
        next = this.withAnswer(next, link.id, { text: v, by: 'profile', source: 'profile', at: this.iso() }, null);
        if (rec.hits[link.id]) filled.push(link.id);
      } else if (!v && a?.source === 'profile') {
        next = { ...next, answers: { ...next.answers } };
        delete next.answers[link.id];
        this.event(null, link.id, 'cleared');
      }
    }
    if (next !== rec) { this.save(next); this.publishSoon(); }
    // The owner answered in the company profile: Michael closes its card.
    for (const id of filled) this.toMichael('Foundation answered', `"${FOUNDATION_QUESTIONS[id].text}" (${id}) is answered now, from the company profile: ${next.answers[id]?.text ?? ''}\n\n${CLOSE_CARD}`);
  }

  /** Set an answer: drafts, snoozes and the gap notice for it go, the old
   *  answer joins the history, and one telemetry event says what changed. A
   *  list's event follows whether it counts as answered: answered when it
   *  became the whole list, cleared when it stopped being one, coverage while
   *  it stays known so far (Pulse reads answered and cleared). `seen` is the
   *  list's seen items after this save. */
  private withAnswer(rec: FoundationsRecord, id: FoundationId, a: FoundationAnswer, agentId: string | null, opts: { seen?: SeenItem[] } = {}): FoundationsRecord {
    const had = rec.answers[id];
    const now = this.now();
    const next: FoundationsRecord = {
      ...rec,
      answers: { ...rec.answers, [id]: a },
      drafts: { ...rec.drafts },
      snoozed: { ...rec.snoozed },
      hits: { ...rec.hits },
      seen: { ...rec.seen },
      history: had ? this.withPast(rec, id, had) : rec.history
    };
    if (opts.seen) { if (opts.seen.length) next.seen[id] = opts.seen; else delete next.seen[id]; }
    delete next.drafts[id];
    delete next.snoozed[id];
    if (next.hits[id]) next.hits[id] = { ...next.hits[id]!, told: false };
    if (isListQuestion(id)) {
      const was = isSettled(rec, id, now), is = isSettled(next, id, now);
      this.event(agentId, id, is ? (was ? 'changed' : 'answered') : (was ? 'cleared' : 'coverage'), { by: a.by, source: a.source, coverage: a.coverage ?? 'known' });
    } else this.event(agentId, id, had ? 'changed' : 'answered', { by: a.by, source: a.source });
    return next;
  }

  /** The history with `had` added as it was until now (part 6). */
  private withPast(rec: FoundationsRecord, id: FoundationId, had: FoundationAnswer): FoundationsRecord['history'] {
    const past: FoundationPast = { text: had.text, by: had.by, source: had.source, at: had.at, until: this.iso(), ...(had.coverage ? { coverage: had.coverage } : {}) };
    return { ...rec.history, [id]: [...(rec.history[id] ?? []), past] };
  }

  /** A list answer's coverage fields: the whole list as of now, or known so far. */
  private coverageFields(id: FoundationId, coverage: Coverage): Pick<FoundationAnswer, 'coverage' | 'completeAt' | 'v'> {
    return coverage === 'complete' ? { coverage, completeAt: this.iso(), v: questionVersion(id) } : { coverage, v: questionVersion(id) };
  }

  /** What the owner's save of a list card means (design review D4): the seen
   *  items added go; every other one must be put off, and then the list stays
   *  known so far. One left undecided refuses the save. */
  private ownerCoverage(rec: FoundationsRecord, id: FoundationId, added: unknown): CoverageDecision {
    const ids = new Set(Array.isArray(added) ? added.filter((x): x is string => typeof x === 'string') : []);
    const remaining = (rec.seen[id] ?? []).filter((s) => !ids.has(s.id));
    const now = this.now();
    if (remaining.some((s) => !isLater(s, now))) return { ok: false };
    return { ok: true, remaining, coverage: remaining.length ? 'known' : 'complete' };
  }

  /**
   * The lists' coverage at launch. The first time (the upgrade day): a list
   * answer the owner or the profile gave becomes the whole list as of today,
   * so no office gets a burst of shelf life cards; one from a member, or one
   * given before its question was widened (money, 2 Nov), is known so far.
   * Every launch: a whole list answered to an older version of a widened
   * question is known so far again (R2), its text kept.
   */
  migrateLists(): void {
    if (!this.file()) return;
    const rec = this.read();
    const first = !rec.listsAt;
    const answers = { ...rec.answers };
    let history = rec.history;
    let changed = first;
    for (const id of Object.keys(answers) as FoundationId[]) {
      const a = answers[id];
      if (!a || !isListQuestion(id)) continue;
      if (!a.coverage) {
        const owner = (a.source === 'owner' || a.source === 'profile') && (a.v ?? 1) >= questionVersion(id);
        answers[id] = owner ? { ...a, ...this.coverageFields(id, 'complete') } : { ...a, coverage: 'known', v: a.v ?? 1 };
        changed = true;
      } else if (a.coverage === 'complete' && (a.v ?? 1) < questionVersion(id)) {
        history = this.withPast({ ...rec, history }, id, a);
        answers[id] = { ...a, coverage: 'known' };
        this.event(null, id, 'cleared', { reason: 'widened' });
        changed = true;
      }
    }
    if (changed) { this.save({ ...rec, answers, history, ...(first ? { listsAt: this.iso() } : {}) }); this.publishSoon(); }
  }

  /**
   * Whole lists past their shelf life (R4, R5) are known so far again: the
   * record keeps an "expired" hit with no member, so Michael's own card rule
   * raises one card per list, and telemetry writes an `expired` change, never
   * a member's hit. Checked at launch and at most once an hour after.
   */
  checkExpiry(force = false): number {
    const now = this.now();
    if (!force && now - this.expiryCheckedAt < EXPIRY_CHECK_MS) return 0;
    this.expiryCheckedAt = now;
    if (!this.file()) return 0;
    let rec = this.read();
    const done: FoundationId[] = [];
    for (const id of Object.keys(rec.answers) as FoundationId[]) {
      const a = rec.answers[id];
      if (!a || !isListQuestion(id) || !isExpired(id, a, now)) continue;
      const was = rec.hits[id];
      const at = this.iso();
      rec = {
        ...rec,
        answers: { ...rec.answers, [id]: { ...a, coverage: 'known' } },
        history: this.withPast(rec, id, a),
        hits: { ...rec.hits, [id]: { first: was?.first ?? at, last: at, count: (was?.count ?? 0) + 1, by: was?.by ?? [], told: true, reason: 'expired' } }
      };
      this.event(null, id, 'expired', { completeAt: a.completeAt });
      done.push(id);
    }
    if (!done.length) return 0;
    this.save(rec);
    this.publishSoon();
    for (const id of done) {
      const a = rec.answers[id]!;
      this.toMichael('Foundation list past its shelf life', `"${FOUNDATION_QUESTIONS[id].text}" (${id}) was saved as the whole list on ${day(a.completeAt)}, more than ${questionOf(id).shelfDays} days ago, so it counts as partly known again. Raise one foundation card for it on Ask me unless one is open: assign it to a team member whose job uses it, and make its "q" one bold sentence asking the owner whether it is still the whole list.`);
      this.reportsNote(id, 'passed its shelf life and is partly known again');
    }
    return done.length;
  }

  /** R7: when a list changes or reopens, one note to Michael naming the
   *  reports from the last 60 days by the members whose job uses it. */
  private reportsNote(id: FoundationId, why: string): void {
    let reports: Array<{ from: string; subject: string; at: number }> = [];
    try { reports = this.d.reportsFor?.(id, this.now() - REPORTS_WINDOW_MS) ?? []; } catch (e) { console.error('[foundations] reports', e); return; }
    if (!reports.length) return;
    const rows = reports.slice(0, REPORTS_MAX).map((r) => `- ${day(new Date(r.at).toISOString())}, ${this.nameOf(r.from)}: ${oneLine(r.subject).slice(0, 120)}`);
    this.toMichael('Reports that may rest on a changed answer', `"${FOUNDATION_QUESTIONS[id].text}" (${id}) ${why}. These reports from the last 60 days came from team members whose job uses it, newest first, so some may rest on the old answer:\n${rows.join('\n')}\n\nDecide whether any needs redoing, and ask its member if so. Nothing reruns by itself.`);
  }

  /** Keep the company profile in step with an answer: the owner's words set
   *  it; a learned answer fills only an empty field (eng finding 6). */
  private toProfile(id: FoundationId, text: string, owner: boolean): void {
    const link = PROFILE_LINKS.find((l) => l.id === id);
    if (!link || !this.d.setProfile) return;
    if (!owner && link.read(this.d.profile?.() ?? {})) return;
    const patch = link.write(text);
    if (patch) try { this.d.setProfile(patch); } catch (e) { console.error('[foundations] profile', e); }
  }

  /** The owner's answer from the foundation card: it always wins. On a list
   *  card a save says it is the whole list (eng review R2), unless a seen item
   *  was put off (design review D4); `added` names the seen items the owner
   *  added to the box, which go. */
  ownerAnswer(id: unknown, text: unknown, added?: unknown): { ok: true; complete?: boolean } | { ok: false; error: 'unknown' | 'empty' | 'too-long' | 'no-office' | 'undecided' } {
    if (!isFoundationId(id)) return { ok: false, error: 'unknown' };
    if (!this.file()) return { ok: false, error: 'no-office' };
    const list = isListQuestion(id);
    const t = typeof text === 'string' ? (list ? joinListLines(text) : oneLine(text)) : '';
    if (!t) return { ok: false, error: 'empty' };
    if (t.length > capFor(id)) return { ok: false, error: 'too-long' };
    return this.ownerSave(id, { text: t, by: 'owner', source: 'owner', at: this.iso() }, added, t);
  }

  /** One owner save, any kind: the coverage decided, the answer written, the
   *  profile and the copy kept in step, and Michael told which reports used a
   *  list that changed. `typed` is what reaches the profile. */
  private ownerSave(id: FoundationId, a: FoundationAnswer, added: unknown, typed: string): { ok: true; complete?: boolean } | { ok: false; error: 'undecided' } {
    const rec = this.read();
    const had = rec.answers[id];
    if (!isListQuestion(id)) {
      this.save(this.withAnswer(rec, id, a, null));
      if (typed) this.toProfile(id, typed, true);
      this.publishSoon();
      return { ok: true };
    }
    const cov = this.ownerCoverage(rec, id, added);
    if (!cov.ok) return { ok: false, error: 'undecided' };
    this.save(this.withAnswer(rec, id, { ...a, ...this.coverageFields(id, cov.coverage) }, null, { seen: cov.remaining }));
    if (typed) this.toProfile(id, typed, true);
    this.publishSoon();
    if (!had || !same(had.text, a.text)) this.reportsNote(id, 'changed: the owner saved a new list');
    return { ok: true, complete: cov.coverage === 'complete' };
  }

  /** What the owner did with a seen item on a list card: Not ours and Decide
   *  later are saved at once, each with its own undo (design review D4, D7). */
  seenAction(id: unknown, seenId: unknown, action: unknown): { ok: boolean } {
    if (!isFoundationId(id) || typeof seenId !== 'string' || !seenId || !this.file()) return { ok: false };
    const rec = this.read();
    const seen = rec.seen[id] ?? [];
    const notOurs = rec.notOurs[id] ?? [];
    const put = (nextSeen: SeenItem[], nextNot = notOurs): void => {
      const s2 = { ...rec.seen }, n2 = { ...rec.notOurs };
      if (nextSeen.length) s2[id] = nextSeen; else delete s2[id];
      if (nextNot.length) n2[id] = nextNot; else delete n2[id];
      this.save({ ...rec, seen: s2, notOurs: n2 });
      this.publishSoon();
    };
    const s = seen.find((x) => x.id === seenId);
    if (action === 'notOurs' && s) {
      const key = itemKey(s.item);
      put(seen.filter((x) => x !== s), [...notOurs.filter((n) => n.key !== key), { item: s.item, key, at: this.iso(), seen: s }]);
      return { ok: true };
    }
    if (action === 'undoNotOurs') {
      const n = notOurs.find((x) => x.seen?.id === seenId);
      if (!n) return { ok: false };
      put(n.seen && !seen.some((x) => x.id === seenId) ? [...seen, n.seen] : seen, notOurs.filter((x) => x !== n));
      return { ok: true };
    }
    if (action === 'later' && s) {
      put(seen.map((x) => (x === s ? { ...x, later: new Date(this.now() + SEEN_LATER_MS).toISOString() } : x)));
      return { ok: true };
    }
    if (action === 'undoLater' && s) {
      put(seen.map((x) => { if (x !== s) return x; const { later: _later, ...rest } = x; return rest; }));
      return { ok: true };
    }
    return { ok: false };
  }

  /** A file the owner adds on the card (D2, D3, D4, D5, D10): read it once;
   *  an unreadable file stops here with its reason. A picture is shown to the
   *  check as a picture, anything else by its text. Only a file the check
   *  says FITS is added to company knowledge, tagged as the card's file and
   *  never as the foundations copy; a NO, or a check that can't run, adds
   *  nothing. The card answers itself next, then calls answerFile. */
  async addFile(id: unknown, path: unknown): Promise<{ ok: true; docId: string; name: string } | { ok: false; error: AddFileError; reason?: string }> {
    if (!isFoundationId(id)) return { ok: false, error: 'unknown' };
    if (!this.file()) return { ok: false, error: 'no-office' };
    if (typeof path !== 'string' || !isAbsolute(path)) return { ok: false, error: 'no-file' };
    try { if (!statSync(path).isFile()) return { ok: false, error: 'no-file' }; } catch { return { ok: false, error: 'no-file' }; }
    const { readFile, fitFile, addToKnowledge } = this.d;
    if (!readFile || !fitFile || !addToKnowledge) return { ok: false, error: 'unchecked' };
    const name = basename(path);
    const read = await readFile(path).catch((e: unknown): DocExtraction => ({ kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) }));
    if (read.kind === 'unreadable') return { ok: false, error: 'unreadable', reason: read.reason };
    const ext = extname(path).slice(1).toLowerCase();
    const picture = (FIT_PICTURES as readonly string[]).includes(ext) ? path : undefined;
    let text = read.kind === 'text' ? read.text : undefined;
    if (read.kind === 'passthrough') {
      // A picture Claude can't be shown (HEIC, TIFF), with no words to read.
      if (IMAGES.has(ext) && !picture) return { ok: false, error: 'picture-type' };
      // Plain text and CSV, which kg-core reads itself: its start, as text.
      if (!IMAGES.has(ext)) text = firstText(path);
    }
    if (!picture && !text?.trim()) return { ok: false, error: 'unreadable', reason: 'This file is empty.' };
    const verdict = await fitFile({ id, name, text, picture });
    if (!verdict) return { ok: false, error: 'unchecked' };
    if ('engine' in verdict) return { ok: false, error: 'picture-engine' };
    if (!verdict.fits) return { ok: false, error: 'misfit', reason: verdict.reason };
    try {
      const docId = addToKnowledge(path, read, { title: name, tags: [FOUNDATION_FILE_TAG, id] });
      return { ok: true, docId, name };
    } catch (e) {
      return { ok: false, error: 'unreadable', reason: e instanceof Error ? e.message : String(e) };
    }
  }

  /** A folder the owner names on a card (eng review 2026-10-26): trusted as
   *  picked (D3), refusing only plain mistakes. Nothing is written; the card
   *  answers itself next, then calls answerFolder. The path given back is the
   *  folder as it really is on disk, which the read grant names. */
  checkFolder(id: unknown, path: unknown): { ok: true; path: string; name: string } | { ok: false; error: FolderError } {
    if (!isFoundationId(id)) return { ok: false, error: 'unknown' };
    const home = this.d.home();
    if (!home || !this.file()) return { ok: false, error: 'no-office' };
    if (typeof path !== 'string' || !isAbsolute(path) || /[\u0000-\u001f]/.test(path)) return { ok: false, error: 'no-folder' };
    let real: string;
    try {
      real = realpathSync(path);
      if (!statSync(real).isDirectory()) return { ok: false, error: 'no-folder' };
    } catch { return { ok: false, error: 'no-folder' }; }
    const ci = this.d.caseInsensitive ?? process.platform !== 'linux';
    const norm = (p: string): string => (ci ? resolve(p).toLowerCase() : resolve(p));
    const inside = (parent: string, child: string): boolean => {
      const rel = relative(norm(parent), norm(child));
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
    };
    const real2 = (p: string): string => { try { return realpathSync(p); } catch { return resolve(p); } };
    const b = this.d.folderBounds?.() ?? { team: [] };
    // A drive root, the home folder or anything holding it, or the business folder itself.
    if (dirname(real) === real) return { ok: false, error: 'too-wide' };
    if (b.userHome && inside(real, real2(b.userHome))) return { ok: false, error: 'too-wide' };
    if (b.business && inside(real, real2(b.business))) return { ok: false, error: 'too-wide' };
    const appHome = real2(home);
    if (inside(appHome, real) || inside(real, appHome)) return { ok: false, error: 'app-folder' };
    for (const t of b.team.filter(Boolean).map(real2)) {
      if (inside(t, real)) return { ok: false, error: 'member-folder' };
      if (inside(real, t)) return { ok: false, error: 'too-wide' };
    }
    if (!holdsAFile(real)) return { ok: false, error: 'empty' };
    if (folderAnswerLine('', real) === null) return { ok: false, error: 'too-long' };
    return { ok: true, path: real, name: basename(real) };
  }

  /** The owner's answer from a folder (D1): their words, then the folder. The
   *  members whose job uses the question read it from here on
   *  (readFoldersFor); only the words reach the company profile. */
  answerFolder(id: unknown, path: unknown, words: unknown, added?: unknown): { ok: true; text: string } | { ok: false; error: FolderError | 'undecided' } {
    const checked = this.checkFolder(id, path);
    if (!checked.ok) return checked;
    const fid = id as FoundationId;
    const typed = typeof words === 'string' ? (isListQuestion(fid) ? joinListLines(words) : oneLine(words)).slice(0, capFor(fid)) : '';
    const text = folderAnswerLine(typed, checked.path, capFor(fid)) as string;
    const r = this.ownerSave(fid, { text, by: 'owner', source: 'owner', ref: `${FOLDER_REF}${checked.path}`, at: this.iso() }, added, typed);
    return r.ok ? { ok: true, text } : r;
  }

  /** The owner's answer from a file (D2, D8): their words, then the document
   *  members read whole; only the words reach the company profile. */
  answerFile(id: unknown, docId: unknown, words: unknown, added?: unknown): { ok: true; text: string } | { ok: false; error: 'unknown' | 'no-office' | 'no-doc' | 'undecided' } {
    if (!isFoundationId(id)) return { ok: false, error: 'unknown' };
    if (!this.file()) return { ok: false, error: 'no-office' };
    const title = typeof docId === 'string' && /^[A-Za-z0-9_-]+$/.test(docId) ? this.d.docTitle?.(docId) : undefined;
    if (!title) return { ok: false, error: 'no-doc' };
    const typed = typeof words === 'string' ? (isListQuestion(id) ? joinListLines(words) : oneLine(words)).slice(0, capFor(id)) : '';
    const text = fileAnswerLine(typed, docId as string, title, capFor(id));
    const r = this.ownerSave(id, { text, by: 'owner', source: 'owner', ref: `kg:${docId as string}`, at: this.iso() }, added, typed);
    return r.ok ? { ok: true, text } : r;
  }

  /** Have a member draft it (design D8): the request is noted on the record
   *  and the member asked; its draft comes back into the card. */
  requestDraft(id: unknown, memberId: unknown): { ok: boolean } {
    if (!isFoundationId(id) || typeof memberId !== 'string' || !memberId || !this.file()) return { ok: false };
    const rec = this.read();
    this.save({ ...rec, drafts: { ...rec.drafts, [id]: { by: memberId, requestedAt: this.iso() } } });
    this.d.tell?.(memberId, `Draft: ${FOUNDATION_QUESTIONS[id].text}`,
      `The owner asked you to draft the company foundations answer to "${FOUNDATION_QUESTIONS[id].text}" (${id}) from what the office already holds: your files, your memory and company knowledge. Keep it under ${capFor(id)} characters${isListQuestion(id) ? ', one item after another with "; " between them' : ''} and send it to "foundations" with "foundation": {"question": "${id}", "draft": "<your draft>"}. The owner reads it on the card, edits it and saves it. If the office holds nothing to draft from, send the draft as "Nothing to draft from" and say what would answer it.`);
    return { ok: true };
  }

  /** Not now: out of Needs you for a week (design D2). */
  snooze(id: unknown, days = 7): { ok: boolean } {
    if (!isFoundationId(id) || !this.file()) return { ok: false };
    const rec = this.read();
    this.save({ ...rec, snoozed: { ...rec.snoozed, [id]: new Date(this.now() + days * 86_400_000).toISOString() } });
    return { ok: true };
  }

  /**
   * A message to `foundations` (the hive route). Returns the reply for the
   * sender, or null when none is owed (a gap report is answered only when the
   * question is answered already).
   */
  handle(from: string, payload: unknown): string | null {
    if (!this.file()) return 'Company foundations are not open. Try again later.';
    const p = (payload && typeof payload === 'object' ? payload : {}) as FoundationPayload;
    const id = p.question;
    if (!isFoundationId(id)) return `No company foundations question "${String(id ?? '')}". Use an id from your COMPANY FOUNDATIONS context, in square brackets after each question.`;
    const q = FOUNDATION_QUESTIONS[id].text;
    if (typeof p.gap === 'string' || typeof p.item === 'string') return this.gap(from, id, typeof p.gap === 'string' ? p.gap : '', p.item, p.source);
    // A draft comes only from the member the owner asked, or Michael (draft()).
    if (typeof p.draft === 'string') return this.draft(from, id, p.draft);
    // A member answers only its own job's questions (Michael any).
    const god = this.d.godId?.() ?? 'god';
    const isMichael = from === god || from === 'god';
    if (this.d.jobsOf && !isMichael && !questionsFor(this.d.jobsOf(from)).includes(id)) {
      return `"${q}" is not one of your job's foundations questions. Send what you know to ${this.michaelName()} instead.`;
    }
    // One plain line: an answer never adds headings or lines to the context
    // every member carries.
    const text = typeof p.answer === 'string' ? oneLine(p.answer) : '';
    if (!text) return `Nothing saved for "${q}": send "answer", "gap" or "draft" in "foundation".`;
    if (text.length > capFor(id)) return `Not saved: keep the answer to "${q}" under ${capFor(id)} characters. For more, save it to a file in the office folders and answer with its full path.`;
    const src = (p.source && typeof p.source === 'object' ? p.source : {}) as Record<string, unknown>;
    const level = this.level(from, src);
    if (!level) {
      if (typeof src.outside !== 'string' && typeof src.taught !== 'string' && typeof src.owner !== 'string' && typeof src.confirmed !== 'string' && typeof src.file !== 'string') {
        return `Not saved: an answer needs its source, "source": {"owner": "<id of the owner's message>"} or {"file": "<full path of the office file>"}, {"taught": "<what the owner told you and when>"} for what the owner taught you through ${this.michaelName()}, or {"outside": "<where it came from>"} for anything from outside the office.`;
      }
      this.toMichael('Foundation answer to check', `${this.nameOf(from)} offers this answer to "${q}" (${id}), from ${this.describe(from, src)}: ${text}\n\nIt comes from outside the office or from a source the app could not check, so it waits for you. If it is right, send it to "foundations" with "foundation": {"question": "${id}", "answer": "<the answer>", "source": {"confirmed": "<why you trust it>"}}; otherwise leave it.`);
      return `Sent to ${this.michaelName()} to check first, because the app could not check where it came from.`;
    }
    const rec = this.read();
    const had = rec.answers[id];
    const list = isListQuestion(id);
    // Only Michael relaying the owner's own words makes a list whole, and only
    // when the owner said it is all of it (eng review R2).
    const whole = list && level === 'owner' && p.complete === true;
    if (had && same(had.text, text) && !(whole && listState(rec, id, this.now()) !== 'complete')) return `Already in the company foundations: "${q}".`;
    const ownerWrote = had && (had.source === 'owner' || had.source === 'profile');
    if (had && level !== 'owner' && ownerWrote) {
      this.toMichael('Foundation answer suggestion', `${this.nameOf(from)} suggests a different answer to "${q}" (${id}), which the owner answered: "${had.text}". Suggested, from ${this.describe(from, src)}: ${text}\n\nThe owner's answer stands; ask the owner if it should change.`);
      return `The owner's answer to "${q}" stands. Your suggestion went to ${this.michaelName()}.`;
    }
    if (had && (level === 'file' || level === 'taught')) {
      this.toMichael('Foundation answers differ', `Two answers to "${q}" (${id}) differ. Kept: "${had.text}", from ${this.nameOf(had.by)}. New, from ${this.nameOf(from)} (${this.describe(from, src)}): ${text}\n\nThe first stays until you decide. To replace it, send the right one to "foundations" with "source": {"confirmed": "<why>"}.`);
      return `A different answer to "${q}" is already recorded, so it stays and ${this.michaelName()} decides.`;
    }
    const source: FoundationSourceKind = level;
    const ref = typeof src.owner === 'string' ? src.owner : typeof src.file === 'string' ? src.file : undefined;
    this.save(this.withAnswer(rec, id, { text, by: from, source, at: this.iso(), ...(ref ? { ref } : {}), ...(list ? this.coverageFields(id, whole ? 'complete' : 'known') : {}) }, from, whole ? { seen: [] } : {}));
    this.toProfile(id, text, level === 'owner');
    this.publishSoon();
    if (list && had && !same(had.text, text)) this.reportsNote(id, `changed: ${this.nameOf(from)} saved a new list`);
    // Answered without the owner's card: Michael closes the card he raised for
    // it (told here when the answer is his own, else by a note).
    if (rec.hits[id] && isMichael) return `Saved to the company foundations: "${q}". ${CLOSE_CARD}`;
    if (rec.hits[id]) this.toMichael('Foundation answered', `"${q}" (${id}) is answered now, from ${this.nameOf(from)}: ${text}\n\n${CLOSE_CARD}`);
    return `Saved to the company foundations: "${q}". Every member who needs it sees it.`;
  }

  /** How sure the app is of a source: an owner message the app's list shows
   *  reaching the sender (owner rights only through Michael), Michael's
   *  confirmation, or a file in the office folders. */
  private level(from: string, src: Record<string, unknown>): Level | null {
    const god = this.d.godId?.() ?? 'god';
    const isMichael = from === god || from === 'god';
    if (typeof src.owner === 'string' && src.owner && this.d.ownerSaid?.(src.owner, from)) return isMichael ? 'owner' : 'taught';
    if (typeof src.confirmed === 'string' && src.confirmed.trim() && isMichael) return 'michael';
    if (typeof src.file === 'string' && isAbsolute(src.file) && this.d.inOffice?.(src.file, from)) return 'file';
    return null;
  }

  private describe(from: string, src: Record<string, unknown>): string {
    if (typeof src.outside === 'string') return `outside text (${src.outside.slice(0, 120)})`;
    if (typeof src.taught === 'string') return `what ${this.nameOf(from)} says the owner taught it (${src.taught.slice(0, 200)})`;
    if (typeof src.owner === 'string') return `a message said to be the owner's (${src.owner.slice(0, 60)}), which the app has no record of reaching them`;
    if (typeof src.file === 'string') return `the file ${src.file.slice(0, 200)}`;
    if (typeof src.confirmed === 'string') return 'a confirmation only you can give';
    return 'no source';
  }

  /** Work hit an empty question: kept once per question; Michael is told the
   *  first time (eng finding 8). */
  private gap(from: string, id: FoundationId, evidence: string, item?: unknown, source?: unknown): string | null {
    const rec = this.read();
    // A gap counts only for the member's own job (Michael's for any), so no
    // member can fill Ask me with other jobs' questions.
    const god = this.d.godId?.() ?? 'god';
    if (this.d.jobsOf && from !== god && from !== 'god' && !questionsFor(this.d.jobsOf(from)).includes(id)) {
      return `"${FOUNDATION_QUESTIONS[id].text}" is not one of your job's foundations questions. If your work needs it, tell ${this.michaelName()}.`;
    }
    const name = typeof item === 'string' ? oneLine(item).slice(0, SEEN_ITEM_MAX) : '';
    if (name && isListQuestion(id)) return this.seenItem(from, id, name, evidence, source);
    const answer = rec.answers[id];
    if (answer && isSettled(rec, id, this.now())) return `"${FOUNDATION_QUESTIONS[id].text}" is answered: ${answer.text}`;
    const at = this.iso();
    const was = rec.hits[id];
    const line = oneLine(evidence).slice(0, 200);
    const hit = { first: was?.first ?? at, last: at, count: (was?.count ?? 0) + 1, by: was?.by.includes(from) ? was.by : [...(was?.by ?? []), from], ...(line ? { evidence: line } : was?.evidence ? { evidence: was.evidence } : {}), told: true };
    this.save({ ...rec, hits: { ...rec.hits, [id]: hit } });
    this.event(from, id, 'hit');
    if (!was?.told) {
      this.toMichael('Foundation gap', `${this.nameOf(from)}'s work needed "${FOUNDATION_QUESTIONS[id].text}" (${id}) and it is empty in the company foundations.${line ? ` What the work did without it: ${line}` : ''}\n\nRaise one foundation card for it on Ask me, unless one is open (see "Company foundations" in your instructions).`);
    }
    return null;
  }

  /**
   * Work saw something a list does not hold (R6, outside voice 4): kept as its
   * own item beside the answer, never in the answer's words, with a source
   * checked as an answer's is. An item on the not ours list, already waiting,
   * or already in the answer is dropped. A whole list is known so far again,
   * and Michael is told as for a gap.
   */
  private seenItem(from: string, id: FoundationId, name: string, evidence: string, source: unknown): string | null {
    const q = FOUNDATION_QUESTIONS[id].text;
    const key = itemKey(name);
    if (!key) return `Nothing saved for "${q}": name the thing you saw, such as the account, tool or supplier.`;
    const rec = this.read();
    if ((rec.notOurs[id] ?? []).some((n) => n.key === key)) return `"${name}" is on the not ours list for "${q}". Leave it out.`;
    if ((rec.seen[id] ?? []).some((s) => itemKey(s.item) === key)) return `"${name}" is already waiting for the owner on "${q}".`;
    const answer = rec.answers[id];
    if (answer && ` ${itemKey(answer.text)} `.includes(` ${key} `)) return `"${name}" is already on the list for "${q}".`;
    const src = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
    const level = this.level(from, src);
    const line = oneLine(evidence).slice(0, 200);
    if (!level) {
      if (typeof src.outside !== 'string' && typeof src.taught !== 'string' && typeof src.owner !== 'string' && typeof src.confirmed !== 'string' && typeof src.file !== 'string') {
        return `Not saved: a seen item needs its source, "source": {"file": "<full path of the office file it was seen in>"}, or {"outside": "<where it came from>"} for anything from outside the office.`;
      }
      this.toMichael('Seen item to check', `${this.nameOf(from)} saw "${name}" for "${q}" (${id}), from ${this.describe(from, src)}, and it is not on the list.${line ? ` What the work saw: ${line}` : ''}\n\nIt comes from outside the office or from a source the app could not check, so it waits for you. If it is real, send it to "foundations" with "foundation": {"question": "${id}", "gap": "<what the work saw>", "item": "${name}", "source": {"confirmed": "<why you trust it>"}}; otherwise leave it.`);
      return `Sent to ${this.michaelName()} to check first, because the app could not check where it came from.`;
    }
    const now = this.now();
    const wasWhole = listState(rec, id, now) === 'complete';
    const at = this.iso();
    const seen: SeenItem = { id: `s${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, item: name, by: from, at, ...(typeof src.file === 'string' ? { ref: src.file } : {}) };
    const was = rec.hits[id];
    const told = !!was?.told;
    const hit = { first: was?.first ?? at, last: at, count: (was?.count ?? 0) + 1, by: was?.by.includes(from) ? was.by : [...(was?.by ?? []), from], evidence: line || `Saw ${name}`, told: true };
    this.save({ ...rec, seen: { ...rec.seen, [id]: [...(rec.seen[id] ?? []), seen] }, hits: { ...rec.hits, [id]: hit } });
    this.event(from, id, 'hit', { seen: true });
    if (wasWhole) this.event(from, id, 'cleared', { reason: 'seen' });
    this.publishSoon();
    if (!told || wasWhole) {
      this.toMichael('Foundation gap', `${this.nameOf(from)}'s work saw "${name}" for "${q}" (${id}), and it is not on the list${wasWhole ? ' the owner saved as the whole list' : ''}.${line ? ` What the work saw: ${line}` : ''}\n\nRaise one foundation card for it on Ask me, unless one is open (see "Company foundations" in your instructions).`);
    }
    if (wasWhole) this.reportsNote(id, `was reopened: ${this.nameOf(from)}'s work saw "${name}", which is not on it`);
    return `Saved for the owner to check: "${name}" on "${q}".`;
  }

  private draft(from: string, id: FoundationId, text: string): string {
    const rec = this.read();
    const t = oneLine(text);
    if (!t) return 'Nothing saved: the draft was empty.';
    if (t.length > capFor(id)) return `Not saved: keep the draft under ${capFor(id)} characters.`;
    const asked = rec.drafts[id];
    // Only the member the owner asked (or Michael) fills the card's draft.
    const god = this.d.godId?.() ?? 'god';
    if (!asked || (from !== asked.by && from !== god && from !== 'god')) return `No draft was asked of you for "${FOUNDATION_QUESTIONS[id].text}".`;
    this.save({ ...rec, drafts: { ...rec.drafts, [id]: { ...asked, by: from, text: t, at: this.iso() } } });
    return 'Draft saved. The owner sees it on the card.';
  }

  private michaelName(): string {
    return this.nameOf(this.d.godId?.() ?? 'god');
  }

  private toMichael(subject: string, body: string): void {
    try { this.d.tell?.(this.d.godId?.() ?? 'god', subject, body); } catch (e) { console.error('[foundations] tell', e); }
  }

  /** Publish the readable copy once a burst of changes settles (eng finding 5). */
  publishSoon(delay = this.d.publishDelayMs ?? 5000): void {
    if (!this.d.publish) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.publishNow(); }, delay);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Publish now, when the text changed. A failure keeps the record; the next
   *  change or launch tries again. */
  publishNow(): void {
    if (!this.d.publish || !this.file()) return;
    const rec = this.read();
    const text = this.document();
    const present = !rec.publishedId || !this.d.exists || this.d.exists(rec.publishedId);
    if (rec.publishedId && rec.publishedText === text && present) return;
    try {
      const id = this.d.publish(text, rec.publishedId);
      if (id) this.save({ ...this.read(), publishedId: id, publishedText: text });
    } catch (e) { console.error('[foundations] publish', e); }
  }

  /** The record for the renderer: answers, drafts, snoozes and hits. */
  view(): FoundationsView {
    const r = this.read();
    return { answers: r.answers, drafts: r.drafts, snoozed: r.snoozed, hits: r.hits, seen: r.seen, notOurs: r.notOurs };
  }
}

/** What publishing the copy needs from company knowledge. */
export interface CopyStore {
  ingestText: (text: string, opts: { title?: string; tags?: string[] }) => { docId?: string } | unknown;
  list: () => Array<{ id: string; tags?: unknown }>;
  remove: (id: string) => unknown;
}

/** Publish the Company foundations copy: one copy in the store, which every
 *  office shares, so our old copy and any other office's go and no business
 *  reads another's answers. `changed` tells search by meaning. */
export function publishCopy(store: CopyStore, text: string, changed?: () => void): string | undefined {
  const r = store.ingestText(text, { title: FOUNDATIONS_TITLE, tags: [FOUNDATIONS_TAG] }) as { docId?: string } | undefined;
  for (const d of store.list()) {
    if (d.id !== r?.docId && isFoundationsDoc(d)) { try { store.remove(d.id); } catch { /* gone already */ } }
  }
  try { changed?.(); } catch { /* the next pass indexes it */ }
  return r?.docId;
}

/** The start of a file kg-core reads as text itself (plain text, CSV), for
 *  the fit check: at most FIT_TEXT_MAX characters, never the whole file. */
function firstText(path: string): string | undefined {
  try {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(FIT_TEXT_MAX * 4);
      const n = readSync(fd, buf, 0, buf.length, 0);
      return buf.subarray(0, n).toString('utf8').slice(0, FIT_TEXT_MAX);
    } finally { closeSync(fd); }
  } catch { return undefined; }
}

/** Whether a folder holds at least one file, at its top or one level down,
 *  reading at most FOLDER_PROBE_MAX entries (never a whole tree). A folder
 *  with more than that to read is not called empty: "Clients" with hundreds
 *  of client folders is a real answer (review, 2026-10-27). */
function holdsAFile(dir: string): boolean {
  let seen = 0;
  const subs: string[] = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (++seen > FOLDER_PROBE_MAX) return true;
      if (e.name.startsWith('.')) continue;
      if (e.isFile()) return true;
      if (e.isDirectory()) subs.push(join(dir, e.name));
    }
    for (const s of subs) {
      for (const e of readdirSync(s, { withFileTypes: true })) {
        if (++seen > FOLDER_PROBE_MAX) return true;
        if (!e.name.startsWith('.') && e.isFile()) return true;
      }
    }
  } catch { /* unreadable counts as empty */ }
  return false;
}
