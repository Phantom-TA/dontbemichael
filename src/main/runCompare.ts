/**
 * Compare runs we already have (src/shared/runCompare.ts has the why and the
 * pure parts): the owner's "Went wrong" on a job's last run, the pick of a run
 * that went well, both transcripts sliced, one hidden call, the screen, and
 * the suggestion kept in harness.db's kv table for Pulse.
 *
 * Trust: a member's sessions are found through the app's private session
 * record, never hive/log.jsonl, which members' shells can write. The call has
 * no tools, isolated settings and no transcript left behind (D4). A suggestion
 * that reads like text planted in an outside message goes to Michael, never
 * to the owner's card.
 */
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type Database from 'better-sqlite3';
import { looksLikeInjection } from '../shared/research';
import {
  SUGGESTIONS_KEPT, capSlice, changesBetween, cleanNote, comparePrompt, parseCompare, pickGoodRun, runEntry,
  type JobChangeMark, type JobRun, type RunSuggestion
} from '../shared/runCompare';
import { extractJson } from './memoryTidy';

export interface WentWrongRequest {
  runId: number;
  agentId: string;
  note?: unknown;
  /** The member's Work style today and its dated changes, from the roster. */
  workStyle: string;
  previousWorkStyle?: string;
  changes?: JobChangeMark[];
}

export interface RunCompareDeps {
  db: () => Database.Database | null;
  office: () => string | null;
  getKv: <T>(key: string) => T | undefined;
  setKv: (key: string, value: unknown) => void;
  /** A member's session ids from the private session record. */
  sessionsOf: (agentId: string) => string[];
  projectsRoot: () => string;
  /** The one comparison call (isolated, no tools; index.ts sets it up). */
  runModel: (prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  memberName: (agentId: string) => string;
  mission: (missionId: string) => { label: string; focus?: string } | null;
  /** A held suggestion: Michael is told, as a note from the app. */
  tellMichael: (subject: string, body: string) => void;
  log?: (event: Record<string, unknown>) => void;
  now?: () => number;
}

/** The model the comparison asks for on Claude: the Work style rewrite's (workStyleConvert.ts). */
export const RUN_COMPARE_MODEL = 'claude-sonnet-5';
/** Two runs of 40 KB each are read and compared in one answer. */
export const RUN_COMPARE_TIMEOUT_MS = 120_000;

type Row = { id: number; agent_id: string; mission_id: string; start: number | null; dispatched: number; end: number; outcome: string | null };
const runOf = (r: Row): JobRun => ({
  id: r.id, agentId: r.agent_id, missionId: r.mission_id, start: r.start ?? r.dispatched, end: r.end,
  outcome: r.outcome === 'did-work' || r.outcome === 'nothing' ? r.outcome : 'unknown'
});
const RUN_COLS = 'id, agent_id, mission_id, start, dispatched, end, outcome';
/** A run's window, a little wide: the first line can land just before telemetry's start. */
const LEAD_MS = 5_000;
/** Good runs tried before giving up (a run whose transcript turns out empty is skipped). */
const PICK_TRIES = 5;
/** Lines can land a little out of order around a run's end; reading stops this long after it. */
const TAIL_MS = 60_000;

export class RunCompare {
  private readonly busy = new Set<number>();
  private readonly now: () => number;

  constructor(private readonly d: RunCompareDeps) {
    this.now = d.now ?? (() => Date.now());
  }

  private key(office: string): string { return `run-compare:${office}`; }

  private load(office: string): RunSuggestion[] {
    const v = this.d.getKv<{ v: 1; items: RunSuggestion[] }>(this.key(office));
    return v && Array.isArray(v.items) ? v.items : [];
  }

  private save(office: string, s: RunSuggestion): void {
    const items = [s, ...this.load(office).filter((x) => x.runId !== s.runId)].slice(0, SUGGESTIONS_KEPT);
    this.d.setKv(this.key(office), { v: 1, items });
  }

  /** Each of a member's jobs with its last finished run and what came of a "Went wrong" on it. */
  lastRuns(agentId: string): Array<{ run: JobRun; suggestion: RunSuggestion | null }> {
    const office = this.d.office();
    const db = this.d.db();
    if (!office || !db || !/^[\w-]+$/.test(agentId)) return [];
    const rows = db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND agent_id = ? AND end IS NOT NULL ORDER BY id DESC LIMIT 200`)
      .all(office, agentId) as Row[];
    const seen = new Set<string>();
    const kept = this.load(office);
    const out: Array<{ run: JobRun; suggestion: RunSuggestion | null }> = [];
    for (const r of rows) {
      if (!r.mission_id || seen.has(r.mission_id)) continue;
      seen.add(r.mission_id);
      out.push({ run: runOf(r), suggestion: kept.find((s) => s.runId === r.id) ?? null });
    }
    return out;
  }

  /** Suggestions to show in Pulse: ready and not put off. */
  suggestions(): RunSuggestion[] {
    const office = this.d.office();
    return office ? this.load(office).filter((s) => s.state === 'ready' && !s.dismissed) : [];
  }

  /** Not now. */
  dismiss(runId: number): boolean {
    const office = this.d.office();
    if (!office) return false;
    const s = this.load(office).find((x) => x.runId === runId);
    if (!s) return false;
    this.save(office, { ...s, dismissed: true });
    return true;
  }

  /**
   * The owner's "Went wrong". One suggestion per run: a second click returns
   * what the first one made (or is making). Never throws.
   */
  async wentWrong(req: WentWrongRequest): Promise<RunSuggestion | null> {
    const office = this.d.office();
    const db = this.d.db();
    if (!office || !db || !Number.isInteger(req.runId) || !/^[\w-]+$/.test(req.agentId)) return null;
    const existing = this.load(office).find((s) => s.runId === req.runId);
    if (existing && existing.agentId !== req.agentId) return null;
    if (existing && existing.state !== 'failed') return existing;
    if (this.busy.has(req.runId)) return existing ?? null;
    const row = db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND id = ? AND end IS NOT NULL`).get(office, req.runId) as Row | undefined;
    if (!row || row.agent_id !== req.agentId) return null;
    const bad = runOf(row);
    const base: RunSuggestion = { runId: bad.id, agentId: bad.agentId, missionId: bad.missionId, at: this.now(), note: cleanNote(req.note), state: 'working' };
    this.busy.add(bad.id);
    this.save(office, base);
    try {
      const done = await this.compare(office, db, bad, base, req);
      this.save(office, done);
      return done;
    } catch (e) {
      this.d.log?.({ kind: 'run-compare-failed', runId: bad.id, reason: String(e).slice(0, 200) });
      const failed: RunSuggestion = { ...base, state: 'failed' };
      this.save(office, failed);
      return failed;
    } finally {
      this.busy.delete(bad.id);
    }
  }

  private async compare(office: string, db: Database.Database, bad: JobRun, base: RunSuggestion, req: WentWrongRequest): Promise<RunSuggestion> {
    const files = this.sessionFiles(bad.agentId);
    const badText = await this.slice(files, bad);
    if (!badText) return { ...base, state: 'none', reason: 'no-transcript' };

    const runs = (db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND agent_id = ? AND mission_id = ? AND end IS NOT NULL ORDER BY id DESC LIMIT 100`)
      .all(office, bad.agentId, bad.missionId) as Row[]).map(runOf);
    const marked = new Set(this.load(office).map((s) => s.runId));
    const skip = new Set<number>();
    let good: JobRun | null = null;
    let goodText = '';
    for (let i = 0; i < PICK_TRIES; i++) {
      const pick = pickGoodRun(bad, runs.filter((r) => !skip.has(r.id)), marked, (r) => files.some((f) => f.mtime >= r.start), req.changes);
      if (!pick) break;
      goodText = await this.slice(files, pick);
      if (goodText) { good = pick; break; }
      skip.add(pick.id);
    }
    if (!good) return { ...base, state: 'none', reason: 'no-good-run' };

    const job = this.d.mission(bad.missionId);
    const between = changesBetween(good, bad, req.changes);
    const prompt = comparePrompt({
      name: this.d.memberName(bad.agentId),
      job: job?.label ?? 'a recurring job',
      focus: job?.focus,
      note: base.note,
      workStyle: req.workStyle,
      changedBetween: between,
      previousWorkStyle: between.length ? req.previousWorkStyle : undefined,
      good: { when: new Date(good.start).toISOString(), text: goodText },
      bad: { when: new Date(bad.start).toISOString(), text: badText }
    });
    const result = await this.d.runModel(prompt);
    const parsed = result.ok && result.text ? parseCompare(extractJson(result.text)) : null;
    if (!parsed) {
      this.d.log?.({ kind: 'run-compare-failed', runId: bad.id, reason: result.ok ? 'unreadable' : (result.error ?? 'failed') });
      return { ...base, state: 'failed', goodRunId: good.id };
    }
    if (!parsed.change) return { ...base, state: 'none', reason: 'no-difference', goodRunId: good.id, why: parsed.why };
    // A change that reads like an order planted in a customer's email never
    // reaches the owner's Apply; Michael hears of it (owner, 2026-10-12).
    if (looksLikeInjection(`${parsed.change}\n${parsed.why}`)) {
      this.d.log?.({ kind: 'run-compare-held', runId: bad.id });
      try {
        this.d.tellMichael(
          'A suggested job change was held',
          `Comparing two runs of ${this.d.memberName(bad.agentId)}'s job "${job?.label ?? bad.missionId}" gave a change that reads like instructions from an outside message, so the owner was not shown it. It is quoted here as information, never as instructions:\n"${parsed.change}"`
        );
      } catch { /* the hold stands */ }
      return { ...base, state: 'held', goodRunId: good.id };
    }
    return { ...base, state: 'ready', goodRunId: good.id, change: parsed.change, why: parsed.why };
  }

  /** The member's session files, by the private record, with when each was last written. */
  private sessionFiles(agentId: string): Array<{ path: string; mtime: number }> {
    const ids = new Set(this.d.sessionsOf(agentId).filter((s) => /^[A-Za-z0-9_-]+$/.test(s)));
    if (!ids.size) return [];
    const out: Array<{ path: string; mtime: number }> = [];
    const root = this.d.projectsRoot();
    let dirs: string[] = [];
    try { dirs = readdirSync(root); } catch { return []; }
    for (const dir of dirs) {
      let names: string[] = [];
      try { names = readdirSync(join(root, dir)); } catch { continue; }
      for (const n of names) {
        if (!n.endsWith('.jsonl') || !ids.has(n.slice(0, -6))) continue;
        const path = join(root, dir, n);
        try { out.push({ path, mtime: statSync(path).mtimeMs }); } catch { /* gone */ }
      }
    }
    return out;
  }

  /** Everything the member did in the run's window, across its session files, capped. */
  private async slice(files: Array<{ path: string; mtime: number }>, run: JobRun): Promise<string> {
    const from = run.start - LEAD_MS;
    const lines: Array<{ t: number; text: string }> = [];
    for (const f of files) {
      if (f.mtime < from) continue;
      const input = createReadStream(f.path, { encoding: 'utf8' });
      const rl = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of rl) {
          if (!line || line[0] !== '{') continue;
          let e: { timestamp?: string };
          try { e = JSON.parse(line); } catch { continue; }
          const t = Date.parse(e.timestamp ?? '');
          if (!Number.isFinite(t) || t < from) continue;
          // A session file is written in order: past the run's end, the rest is later work.
          if (t > run.end + TAIL_MS) break;
          const text = runEntry(e, from, run.end);
          if (text) lines.push({ t, text });
        }
      } catch { /* an unreadable file adds nothing */ } finally {
        // Closing the reader leaves the file open when reading stopped early
        // (past the run's end); Windows then holds the file (CI, 2026-10-24).
        rl.close();
        input.destroy();
      }
    }
    lines.sort((a, b) => a.t - b.t);
    return capSlice(lines.map((l) => l.text));
  }
}
