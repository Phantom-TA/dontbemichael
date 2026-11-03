import { FOUNDATION_QUESTIONS, capFor, fileAnswerLine, folderAnswerLine, isListQuestion, joinListLines, type FoundationId } from '@shared/foundations';

/**
 * The foundation card's Save, as its steps (components/FoundationCard.tsx
 * keeps the state around them). The window.cth calls come in as `cth`, so the
 * order can be run without the app (test/review-behavior.test.cjs).
 */
export type FoundationSaveCth = Pick<Window['cth'], 'foundationsAnswer' | 'foundationsAddFile' | 'foundationsAnswerFile' | 'foundationsCheckFolder' | 'foundationsAnswerFolder' | 'kgRemove' | 'hiveSend'>;

/** Answer the card like any Ask me reply; false when the card did not take it. */
export type CardAnswer = (text: string) => Promise<boolean>;

/** Where the answer went once the card took it. */
export type SavedHow = 'saved' | 'michael' | 'failed';

/** Why the add step refused a file. */
export type AddFileRefusal = Extract<Awaited<ReturnType<FoundationSaveCth['foundationsAddFile']>>, { ok: false }>['error'];

/** What the owner's save of a list card says (design review D4): the seen
 *  items added to the box, and whether it is the whole list. */
export interface ListSave { added: string[]; whole: boolean }

/** The ask Michael gets when the write fails: a list says whether it is the
 *  whole list, so his message carries "complete": true only then. */
function michaelAsk(id: FoundationId, line: string, list?: ListSave): string {
  const q = `"${FOUNDATION_QUESTIONS[id].text}" (${id})`;
  if (!isListQuestion(id) || !list) return `Please add my answer to the company foundations question ${q}: ${line}`;
  return list?.whole
    ? `Please save this as the whole list for the company foundations question ${q}, with "complete": true: ${line}`
    : `Please save this as the list so far for the company foundations question ${q}, without "complete": ${line}`;
}

/** A typed answer: the card first, then the foundations, else Michael. */
export async function saveTextAnswer(id: FoundationId, text: string, cth: FoundationSaveCth, onAnswer: CardAnswer, list?: ListSave): Promise<{ taken: false } | { taken: true; how: SavedHow }> {
  // The card first: the answer reaches Michael, who closes it.
  if (!(await onAnswer(text).catch(() => false))) return { taken: false };
  // The card took it and leaves the board: the board reports from here.
  // A single question keeps its one call; a list names the seen items it added.
  const r = await (list ? cth.foundationsAnswer(id, text, list.added) : cth.foundationsAnswer(id, text)).catch(() => null);
  if (r?.ok) return { taken: true, how: 'saved' };
  // Not written: Michael adds it, as he does any owner answer.
  const line = list ? joinListLines(text) : text;
  const sent = await cth.hiveSend({ to: 'michael', act: 'request', subject: 'Add my answer to the company foundations', body: michaelAsk(id, line, list) }, 'human').catch(() => null);
  return { taken: true, how: sent?.ok ? 'michael' : 'failed' };
}

/** A file answer's outcome: refused by the add step (with its line), failed
 *  there for another reason, not taken by the card, or taken. */
export type FileSaveOutcome =
  | { kind: 'refused'; error: AddFileRefusal; reason?: string }
  | { kind: 'failed' }
  | { kind: 'not-taken' }
  | { kind: 'taken'; how: SavedHow };

/**
 * A file answer (docs/designs/foundation-card-upload.md): the file is added
 * and checked first, then the card is answered, the document is removed again
 * if the card does not take it, then the answer naming the document is
 * written. `steps.checked` runs once the check is back, `steps.taken` once the
 * card took the answer, so the card can update between the steps.
 */
export async function saveFileAnswer(
  id: FoundationId,
  picked: { path: string },
  text: string,
  cth: FoundationSaveCth,
  onAnswer: CardAnswer,
  steps: { checked?: () => void; taken?: () => void } = {},
  list?: ListSave
): Promise<FileSaveOutcome> {
  // Read and checked first: nothing is answered or added unless it fits (D3).
  const added = await cth.foundationsAddFile(id, picked.path).catch(() => null);
  steps.checked?.();
  if (!added?.ok) {
    if (added && added.error !== 'unknown' && added.error !== 'no-office') return { kind: 'refused', error: added.error, reason: added.reason };
    return { kind: 'failed' };
  }
  const note = `I added "${added.name}" to company knowledge for this (document ${added.docId}).`;
  if (!(await onAnswer(text ? `${text}\n\n${note}` : note).catch(() => false))) {
    // The card didn't take it: the document goes again, nothing is left over.
    await cth.kgRemove(added.docId).catch(() => null);
    return { kind: 'not-taken' };
  }
  steps.taken?.();
  const r = await (list ? cth.foundationsAnswerFile(id, added.docId, text, list.added) : cth.foundationsAnswerFile(id, added.docId, text)).catch(() => null);
  if (r?.ok) return { kind: 'taken', how: 'saved' };
  // Michael adds it: the exact line, so the document id survives (Codex 3).
  const line = list ? fileAnswerLine(joinListLines(text), added.docId, added.name, capFor(id)) : fileAnswerLine(text, added.docId, added.name);
  const sent = await cth.hiveSend({ to: 'michael', act: 'request', subject: 'Add my answer to the company foundations', body: michaelAsk(id, line, list) }, 'human').catch(() => null);
  return { kind: 'taken', how: sent?.ok ? 'michael' : 'failed' };
}

/** Why the check refused a folder. */
export type FolderRefusal = Extract<Awaited<ReturnType<FoundationSaveCth['foundationsCheckFolder']>>, { ok: false }>['error'];

export type FolderSaveOutcome =
  | { kind: 'refused'; error: FolderRefusal }
  | { kind: 'failed' }
  | { kind: 'not-taken' }
  | { kind: 'taken'; how: SavedHow };

/**
 * A folder answer (eng review 2026-10-26): the folder is checked first
 * (nothing is written), then the card is answered, then the answer naming the
 * folder is written, which lets the members whose job uses the question read
 * it. Nothing is copied, so a card that doesn't take it leaves nothing over.
 */
export async function saveFolderAnswer(
  id: FoundationId,
  picked: { path: string },
  text: string,
  cth: FoundationSaveCth,
  onAnswer: CardAnswer,
  steps: { checked?: () => void; taken?: () => void } = {},
  list?: ListSave
): Promise<FolderSaveOutcome> {
  const checked = await cth.foundationsCheckFolder(id, picked.path).catch(() => null);
  steps.checked?.();
  if (!checked?.ok) {
    if (checked && checked.error !== 'unknown' && checked.error !== 'no-office') return { kind: 'refused', error: checked.error };
    return { kind: 'failed' };
  }
  const note = `I pointed the team to the folder "${checked.name}" for this (${checked.path}). Members whose job uses this question can read it now with their file tools, and with commands from their next start.`;
  if (!(await onAnswer(text ? `${text}\n\n${note}` : note).catch(() => false))) return { kind: 'not-taken' };
  steps.taken?.();
  const r = await (list ? cth.foundationsAnswerFolder(id, checked.path, text, list.added) : cth.foundationsAnswerFolder(id, checked.path, text)).catch(() => null);
  if (r?.ok) return { kind: 'taken', how: 'saved' };
  // Michael adds the line; an answer he adds names the folder but opens it to
  // nobody (only the owner's own card answer does, readFoldersFor).
  const line = (list ? folderAnswerLine(joinListLines(text), checked.path, capFor(id)) : folderAnswerLine(text, checked.path)) ?? `Kept in the folder ${checked.path}`;
  const sent = await cth.hiveSend({ to: 'michael', act: 'request', subject: 'Add my answer to the company foundations', body: michaelAsk(id, line, list) }, 'human').catch(() => null);
  return { kind: 'taken', how: sent?.ok ? 'michael' : 'failed' };
}
