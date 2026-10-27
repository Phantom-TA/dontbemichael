/**
 * Michael hears when email becomes usable, so a request the owner made before
 * email was connected ("check my emails") gets done without asking again
 * (docs/designs/settings-links-in-replies.md, E3 and G1).
 *
 *   mail:save, a new mailbox ──> "A mailbox was added" (now)
 *   mail:setCapabilities, a member now holds a mailbox they did not
 *      ├─ member not running, or running with mail tools already ──> "<name> can read <address>" (now)
 *      └─ running: a grant needs their restart ──> pending note on disk
 *            ├─ their next session start (not a compaction or a clear) ──> sent
 *            └─ 15 minutes without one (a failed restart included) ──> sent, "not active yet"
 *
 * Every note lists the owner's open dock questions with their ids, so Michael
 * answers the one that waited on email, and says nothing when none did. The
 * disk, hive, clock and running check are passed in, so tests drive this
 * with fakes.
 */

export const GRANT_NOTE_FALLBACK_MS = 15 * 60_000;
export const GRANT_NOTES_FILE = 'mailbox-grant-notes.json';

export interface PendingGrant { agentId: string; address: string; at: number }
export interface OpenQuestion { id: string; text: string }

export interface MailboxNoteDeps {
  readPending: () => PendingGrant[];
  writePending: (list: PendingGrant[]) => void;
  /** Sends an inform to Michael from the app (system). */
  tell: (subject: string, body: string) => boolean;
  openQuestions: () => OpenQuestion[];
  isRunning: (agentId: string) => boolean;
  nameOf: (agentId: string) => string;
  now: () => number;
  warn: (what: string, error: unknown) => void;
}

function questionLines(qs: OpenQuestion[]): string {
  if (!qs.length) return 'The owner has no open question in the dock, so there is nothing to answer: say nothing about this.';
  return 'The owner\'s open questions in the dock:\n'
    + qs.map((q) => `- id ${q.id}: ${q.text.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
    + '\nIf one of them waited on email, answer it (in_reply_to that id). If none did, say nothing about this.';
}

export function mailboxAddedNote(address: string, qs: OpenQuestion[]): { subject: string; body: string } {
  return {
    subject: `A mailbox was added: ${address}`,
    body: `The owner connected ${address} in Settings. No team member can read it yet: only the owner gives a mailbox to someone, on their Access tab, Email. `
      + 'If a question below waited on email, answer it naming who should read this mailbox (someone whose job fits; a member holds one mailbox, so prefer one with none, or say which address this replaces), '
      + 'with the button [<name>, Access, Email](dbm:member/<their id>/access/email), and keep the question open. You never give access yourself.\n'
      + questionLines(qs)
  };
}

export function grantNote(name: string, address: string, active: boolean, qs: OpenQuestion[]): { subject: string; body: string } {
  return {
    subject: `${name} can read ${address}`,
    body: (active
      ? `The owner gave ${address} to ${name}, and ${name} has started with it. `
      : `The owner gave ${address} to ${name}, but ${name} is not active with it yet (not restarted). Give it a few minutes before you hand ${name} mail work. `)
      + 'If a question below waited on email, have the work done now and answer it with done when it is. '
      + questionLines(qs)
  };
}

/** Mailbox ids a member holds now and did not before (a swap counts). */
export function newlyHeld(before: string[] | undefined, after: string[] | undefined): string[] {
  const had = new Set(before ?? []);
  return (after ?? []).filter((id) => !had.has(id));
}

export function createMailboxNotes(deps: MailboxNoteDeps) {
  const send = (n: { subject: string; body: string }): void => {
    try {
      if (!deps.tell(n.subject, n.body)) deps.warn('send', new Error('hive refused the note'));
    } catch (e) { deps.warn('send', e); }
  };
  const pending = (): PendingGrant[] => {
    try { return deps.readPending(); } catch (e) { deps.warn('read', e); return []; }
  };
  const keep = (list: PendingGrant[]): boolean => {
    try { deps.writePending(list); return true; } catch (e) { deps.warn('write', e); return false; }
  };
  const deliver = (g: PendingGrant, active: boolean): void =>
    send(grantNote(deps.nameOf(g.agentId), g.address, active, deps.openQuestions()));

  return {
    mailboxAdded(address: string): void {
      send(mailboxAddedNote(address, deps.openQuestions()));
    },
    /** needsRestart: the grant brings mail tools the running member lacks; a
     *  swap, or one who had them from a Send only grant, reads it at once. */
    granted(agentId: string, address: string, needsRestart = true): void {
      const g = { agentId, address, at: deps.now() };
      if (!deps.isRunning(agentId) || !needsRestart) { deliver(g, true); return; }
      // Kept on disk so a quit before the restart loses nothing; a failed
      // write still tells Michael now rather than never.
      if (!keep([...pending().filter((p) => !(p.agentId === agentId && p.address === address)), g])) deliver(g, false);
    },
    sessionStarted(agentId: string): void {
      const list = pending();
      const mine = list.filter((p) => p.agentId === agentId);
      if (!mine.length) return;
      keep(list.filter((p) => p.agentId !== agentId));
      for (const g of mine) deliver(g, true);
    },
    /** Called on a timer and at start: notes past the fallback go anyway. */
    sweep(): void {
      const list = pending();
      const late = list.filter((p) => deps.now() - p.at >= GRANT_NOTE_FALLBACK_MS);
      if (!late.length) return;
      keep(list.filter((p) => !late.includes(p)));
      for (const g of late) deliver(g, false);
    }
  };
}
