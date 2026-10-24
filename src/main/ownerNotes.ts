/**
 * The owner's own notes for members' memory (memory evidence, D9): an Ask me
 * answer, a decision on a proposed email, a word to Michael in the dock. They
 * are kept in harness.db, in the app's own data folder, because any member's
 * shell can write every inbox in the hive; a note there can never count as the
 * owner's. The tidy-up reads a member's pending notes as the owner's, files
 * them and marks them filed.
 *
 *   add() ─► owner_notes (filed_at NULL) ─► pending() ─► tidy-up ─► filed()
 *     │ write fails
 *     └► held in memory, saved on the next add() or pending()
 *
 * Each note carries its Why, built by the app from the channel, an id and the
 * date, never a card title or email text.
 */
import type Database from 'better-sqlite3';
import { evidenceText } from '../shared/memoryIndex';

/** Longer than any note the app writes; a long dock message is cut here. */
export const MAX_OWNER_NOTE_CHARS = 2000;

export interface OwnerNote { id: number; agentId: string; at: string; text: string; why: string }

interface Held extends OwnerNote { office: string }

export class OwnerNotes {
  /** Notes whose write failed (or with no database yet), by negative id. */
  private held: Held[] = [];
  private nextHeld = -1;
  private loggedFailure = false;

  constructor(
    private readonly db: () => Database.Database | null,
    private readonly office: () => string | null,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Keeps a note from the owner for a member. False when there is no office
   *  or nothing to keep. */
  add(agentId: string, text: string, why: string): boolean {
    const office = this.office();
    const body = text.replace(/\s+/g, ' ').trim().replace(/^- /, '').slice(0, MAX_OWNER_NOTE_CHARS);
    if (!office || !/^[\w-]+$/.test(agentId) || !body) return false;
    const note: Held = { id: this.nextHeld--, office, agentId, at: new Date(this.now()).toISOString(), text: body, why: evidenceText(why) ?? '' };
    this.held.push(note);
    this.save();
    return true;
  }

  /** A member's notes not yet filed, oldest first. */
  pending(agentId: string): OwnerNote[] {
    const office = this.office();
    if (!office) return [];
    this.save();
    const kept = this.held.filter((n) => n.office === office && n.agentId === agentId).map(({ office: _o, ...n }) => n);
    const db = this.db();
    if (!db) return kept;
    try {
      const rows = db.prepare('SELECT id, agent_id, at, text, why FROM owner_notes WHERE office = ? AND agent_id = ? AND filed_at IS NULL ORDER BY id')
        .all(office, agentId) as Array<{ id: number; agent_id: string; at: string; text: string; why: string }>;
      return [...rows.map((r) => ({ id: r.id, agentId: r.agent_id, at: r.at, text: r.text, why: r.why })), ...kept];
    } catch (e) {
      this.logFailure(e);
      return kept;
    }
  }

  /** The tidy-up filed these into memory. */
  filed(ids: number[]): void {
    const gone = new Set(ids);
    this.held = this.held.filter((n) => !gone.has(n.id));
    const saved = ids.filter((id) => id > 0);
    const db = this.db();
    if (!saved.length || !db) return;
    try {
      const at = new Date(this.now()).toISOString();
      const mark = db.prepare('UPDATE owner_notes SET filed_at = ? WHERE id = ?');
      db.transaction(() => { for (const id of saved) mark.run(at, id); })();
    } catch (e) { this.logFailure(e); }
  }

  /** Memory reset: the office's notes go with its memory. */
  clearOffice(office: string): void {
    this.held = this.held.filter((n) => n.office !== office);
    try { this.db()?.prepare('DELETE FROM owner_notes WHERE office = ?').run(office); } catch (e) { this.logFailure(e); }
  }

  /** Writes the held notes; any that fail stay held for the next try. */
  private save(): void {
    const db = this.db();
    if (!db || !this.held.length) return;
    try {
      const put = db.prepare('INSERT INTO owner_notes (office, agent_id, at, text, why) VALUES (?, ?, ?, ?, ?)');
      db.transaction(() => { for (const n of this.held) put.run(n.office, n.agentId, n.at, n.text, n.why); })();
      this.held = [];
    } catch (e) { this.logFailure(e); }
  }

  private logFailure(e: unknown): void {
    if (this.loggedFailure) return;
    this.loggedFailure = true;
    console.error('[memory] owner notes write failed:', e);
  }
}
