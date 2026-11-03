import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { GrowingTextarea } from './GrowingTextarea';
import { PixelButton } from './PixelButton';
import { AgentAvatar } from './AgentAvatar';
import { FileText } from './FileChip';
import { InfoTip } from './InfoTip';
import { askedAgo } from './askHeadline';
import { useStore } from '@/store/store';
import { useRtl } from '@/i18n/useDirection';
import { isComposingKey } from '@shared/imeGuard';
import { FOUNDATION_QUESTIONS, capFor, draftPending, isLater, isListQuestion, joinListLines, jobsAsking, listLines, type FoundationId, type FoundationsView, type SeenItem } from '@shared/foundations';
import { refreshNeedsYou } from '@/shell/useNeedsYou';
import { saveFileAnswer, saveFolderAnswer, saveTextAnswer, type ListSave } from '@/shell/foundationSave';

/** Seen rows shown before "Show N more" (design review, outside reviewer 7). */
const SEEN_SHOWN = 3;
/** The counter shows this close to the cap (design review D5). */
const COUNTER_FROM = 40;

/**
 * One Company foundations card in Needs you (docs/designs/office-foundations.md,
 * design D2, D8, D10 to D13): the question as its title, the member whose work
 * hit it, Michael's one bold line on what the work did without it, then a
 * labeled answer box with Save answer, Have the member draft it, and Not now.
 *
 * Save answers the card like any Ask me reply first, so Michael closes it,
 * then writes the answer into the foundations (the app's one writer); if that
 * write fails, Michael is asked to add it, as he does any owner answer.
 *
 * Add a file (docs/designs/foundation-card-upload.md): the file is read and
 * checked against the question before anything else, and added to company
 * knowledge only if it fits; a file that can't be read, doesn't fit or
 * couldn't be checked stops there with its line (D3, D4, D5). Then the card
 * is answered (the document is removed again if the card doesn't take it),
 * then the answer naming the document is written.
 *
 * Add a folder (eng review 2026-10-26): the folder stays where it is. It is
 * checked for plain mistakes only (D3), the card is answered, then the answer
 * naming it is written, and the members whose job uses the question read it
 * from there (D1).
 *
 * A list question (docs/designs/foundation-answers-stay-open.md, design
 * review, branding/DESIGN.md §7.27b): the box holds the list so far, one item
 * a line, and saving says it is the whole list. Under it, each thing the
 * team's work saw that the list lacks, with Add (into the box), Not ours and
 * Decide later (both saved at once, each with Undo). Save waits until every
 * seen item has one of the three; with one put off it saves the list so far.
 */
export function FoundationCard({ id, rowKey, taskId, q, askedAt, raiserId, raiserName, raiserIsMember = true, memberName, chipStyle, foundations, onAnswer, onSaved }: {
  id: FoundationId;
  rowKey: string;
  taskId: string;
  /** Michael's line: what the work did without it. */
  q: string;
  askedAt?: string;
  raiserId?: string;
  raiserName?: string;
  /** Whether the raiser is on the team now: only then can it draft. */
  raiserIsMember?: boolean;
  /** A team member's name, or undefined for someone not on the team now. */
  memberName?: (id: string) => string | undefined;
  /** The raiser chip in the member's department color (D11). */
  chipStyle: CSSProperties;
  foundations: FoundationsView | null;
  /** Answer the card like any Ask me reply; resolves false when the card did not take it. */
  onAnswer: (text: string) => Promise<boolean>;
  /** Where the answer went once the card took it (the card leaves the board,
   *  so the board says it): written into the foundations, to Michael to add,
   *  or neither; for a list, whether it was the whole list. */
  onSaved?: (how: 'saved' | 'michael' | 'failed', list?: 'whole' | 'soFar') => void;
}) {
  const { t, i18n } = useTranslation();
  const rtl = useRtl();
  const hintId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);
  const draft = useStore((s) => s.answerDrafts[rowKey] ?? '');
  const setDraft = useStore((s) => s.setAnswerDraft);
  const list = isListQuestion(id);
  const cap = capFor(id);
  // A list card's added seen items and the list it started from live beside
  // its draft, so Not now and a remount keep them (design review).
  const addedKey = `${rowKey}\u0000added`;
  const baseKey = `${rowKey}\u0000base`;
  const addedRaw = useStore((s) => s.answerDrafts[addedKey] ?? '');
  const base = useStore((s) => s.answerDrafts[baseKey]);
  const added = useMemo<string[]>(() => { try { const v = JSON.parse(addedRaw || '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } }, [addedRaw]);
  const [busy, setBusy] = useState(false);
  // Which action did not go through, so the line names it.
  const [failed, setFailed] = useState<'save' | 'draft' | 'later' | null>(null);
  // The file or folder the owner picked or dropped, and why the last one was refused.
  const [file, setFile] = useState<{ path: string; name: string; kind: 'file' | 'folder' } | null>(null);
  const [checking, setChecking] = useState(false);
  const [refused, setRefused] = useState<{ name: string; error: string; reason?: string } | null>(null);
  // Seen items marked not ours on this card, the rows shown, a row's failure and the last spoken line.
  const [marked, setMarked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [rowFailed, setRowFailed] = useState<{ id: string; what: 'notOurs' | 'later' } | null>(null);
  const [said, setSaid] = useState('');
  const asked = foundations?.drafts?.[id];
  // A request waits 2 days; after that the card offers to ask again.
  // Who was asked (or filled it): named from the record, never the card's raiser.
  const askedName = asked ? memberName?.(asked.by) : undefined;
  const drafting = draftPending(asked, Date.now()) && !!askedName;
  const drafter = raiserName ?? '';
  const [filled, setFilled] = useState(false);
  const known = foundations?.answers?.[id];
  const loaded = !!foundations;
  // The member's draft fills an empty box once (D8), labeled as theirs.
  useEffect(() => {
    if (asked?.text && !draft.trim() && !filled) { setDraft(rowKey, asked.text); setFilled(true); }
  }, [asked?.text, draft, filled, rowKey, setDraft]);
  // A list's box starts from the saved list, once the record is in.
  useEffect(() => {
    if (!list || !loaded || base !== undefined) return;
    setDraft(baseKey, known?.text ?? '');
    if (!draft.trim() && known) setDraft(rowKey, listLines(known.text).join('\n'));
  }, [list, loaded, base, known, draft, baseKey, rowKey, setDraft]);
  const question = t(`foundations.q.${id}`, { defaultValue: FOUNDATION_QUESTIONS[id].text });
  const jobs = jobsAsking(id).map((j) => t(`foundations.job.${j}`));
  const jobList = ((): string => { try { return new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(jobs); } catch { return jobs.join(', '); } })();
  const ago = askedAgo(askedAt, Date.now(), i18n.language, t('askMe.justNow'));
  const text = draft.trim();
  const now = Date.now();

  // The list's seen items, newest first, and where each stands on this card.
  const seen = useMemo(() => [...(foundations?.seen?.[id] ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [foundations, id]);
  const undecided = seen.filter((s) => !added.includes(s.id) && !isLater(s, now));
  const putOff = seen.filter((s) => !added.includes(s.id) && isLater(s, now));
  const markedRows = (foundations?.notOurs?.[id] ?? []).filter((n) => n.seen && marked.includes(n.seen.id));
  const shownSeen = showAll ? seen : seen.slice(0, SEEN_SHOWN);
  const expired = list && foundations?.hits?.[id]?.reason === 'expired';
  const length = list ? joinListLines(draft).length : text.length;
  const over = length > cap;
  const changedSince = list && base !== undefined && (known?.text ?? '') !== base;
  const unchanged = list && !!known && joinListLines(draft) === known.text;
  const day = (iso: string | undefined): string => { const d = new Date(iso ?? ''); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : ''; };
  const whole = list && putOff.length === 0;
  const listSave: ListSave | undefined = list ? { added, whole } : undefined;
  const saveLabel = !list ? t('foundations.card.save') : putOff.length ? t('foundations.card.saveSoFar') : expired && unchanged ? t('foundations.card.stillAll') : t('foundations.card.saveWhole');
  const nameOf = (mid: string): string => memberName?.(mid) ?? mid;
  const boxLabel = !list || !known ? t('foundations.card.yourAnswer')
    : known.source === 'owner' || known.source === 'profile' ? t('foundations.card.listSoFar') : t('foundations.card.listSoFarFrom', { name: nameOf(known.by) });

  // The card leaves the board once saved; its added items go with it.
  const clearList = (): void => { if (list) setDraft(addedKey, ''); };
  const saved = (how: 'saved' | 'michael' | 'failed'): void => {
    clearList();
    onSaved?.(how, list ? (whole ? 'whole' : 'soFar') : undefined);
  };

  const pickFile = async (): Promise<void> => {
    if (busy) return;
    const r = await window.cth.foundationsPickFile().catch(() => null);
    if (r?.ok) { setFile({ path: r.path, name: r.name, kind: 'file' }); setRefused(null); }
  };
  const pickFolder = async (): Promise<void> => {
    if (busy) return;
    const r = await window.cth.foundationsPickFolder().catch(() => null);
    if (r?.ok) { setFile({ path: r.path, name: r.name, kind: 'folder' }); setRefused(null); }
  };
  const dropFile = (e: React.DragEvent): void => {
    const f = e.dataTransfer.files?.[0];
    if (!f || busy) return;
    e.preventDefault();
    // A dropped folder is taken as a folder, not refused as an unreadable file.
    const folder = !!e.dataTransfer.items?.[0]?.webkitGetAsEntry?.()?.isDirectory;
    const path = window.cth.pathForFile(f);
    if (path) { setFile({ path, name: f.name, kind: folder ? 'folder' : 'file' }); setRefused(null); }
  };

  // Focus moves on after a seen item is settled: the next one's Add, else Save.
  const focusNext = (after: string): void => {
    requestAnimationFrame(() => {
      const next = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>('[data-seen-add]') ?? []).find((b) => b.dataset.seenAdd !== after);
      (next ?? saveRef.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    });
  };
  const addItem = (s: SeenItem): void => {
    const lines = draft.split('\n').map((l) => l.trim()).filter(Boolean);
    setDraft(rowKey, [...lines, s.item].join('\n'));
    setDraft(addedKey, JSON.stringify([...added, s.id]));
    setSaid(t('foundations.card.seenAdded'));
    focusNext(s.id);
  };
  const undoAdd = (s: SeenItem): void => {
    const lines = draft.split('\n');
    const i = lines.map((l) => l.trim()).lastIndexOf(s.item);
    if (i >= 0) lines.splice(i, 1);
    setDraft(rowKey, lines.join('\n'));
    setDraft(addedKey, JSON.stringify(added.filter((x) => x !== s.id)));
  };
  const seenDo = async (s: SeenItem, action: 'notOurs' | 'undoNotOurs' | 'later' | 'undoLater'): Promise<void> => {
    setRowFailed(null);
    const r = await window.cth.foundationsSeen(id, s.id, action).catch(() => null);
    if (!r?.ok) { setRowFailed({ id: s.id, what: action === 'later' || action === 'undoLater' ? 'later' : 'notOurs' }); return; }
    if (action === 'notOurs') { setMarked((m) => [...m, s.id]); setSaid(t('foundations.card.seenMarkedNotOurs', { item: s.item })); focusNext(s.id); }
    if (action === 'undoNotOurs') setMarked((m) => m.filter((x) => x !== s.id));
    if (action === 'later') { setSaid(t('foundations.card.seenBackNextWeek')); focusNext(s.id); }
    refreshNeedsYou();
  };

  // The steps and their order live in shell/foundationSave.ts; the card keeps
  // its state around them.
  const saveFolder = async (picked: { path: string; name: string }): Promise<void> => {
    setBusy(true);
    setFailed(null);
    setRefused(null);
    const res = await saveFolderAnswer(id, picked, text, window.cth, onAnswer, { taken: () => setFile(null) }, listSave);
    if (res.kind === 'refused' || res.kind === 'failed') {
      if (res.kind === 'refused') setRefused({ name: picked.name, error: `folder-${res.error}` });
      else setFailed('save');
      setFile(null);
      setBusy(false);
      return;
    }
    if (res.kind === 'not-taken') {
      setFailed('save');
      setBusy(false);
      return;
    }
    saved(res.how);
    refreshNeedsYou();
    setBusy(false);
  };

  const saveFile = async (picked: { path: string; name: string }): Promise<void> => {
    setBusy(true);
    setFailed(null);
    setRefused(null);
    setChecking(true);
    // Added and checked first, then the card, the document removed if the
    // card does not take it, then the answer naming it (or Michael adds it).
    const res = await saveFileAnswer(id, picked, text, window.cth, onAnswer, { checked: () => setChecking(false), taken: () => setFile(null) }, listSave);
    if (res.kind === 'refused' || res.kind === 'failed') {
      if (res.kind === 'refused') setRefused({ name: picked.name, error: res.error, reason: res.reason });
      else setFailed('save');
      setFile(null);
      setBusy(false);
      return;
    }
    if (res.kind === 'not-taken') {
      setFailed('save');
      setBusy(false);
      return;
    }
    saved(res.how);
    refreshNeedsYou();
    setBusy(false);
  };

  // A list saves only once the record is in, within its cap, with every seen item settled.
  const blocked = list && (!loaded || undecided.length > 0);
  const save = async (): Promise<void> => {
    if (busy || blocked || over) return;
    if (file) { await (file.kind === 'folder' ? saveFolder(file) : saveFile(file)); return; }
    if (!text) return;
    setBusy(true);
    setFailed(null);
    // The card first, then the foundations; Michael adds it if that fails.
    const res = await saveTextAnswer(id, text, window.cth, onAnswer, listSave);
    if (!res.taken) {
      setFailed('save');
      setBusy(false);
      return;
    }
    // The card took it and leaves the board: the board reports from here.
    saved(res.how);
    refreshNeedsYou();
    setBusy(false);
  };
  const draftIt = (): void => {
    if (!raiserId || busy) return;
    setFailed(null);
    void window.cth.foundationsDraft(id, raiserId).then(() => refreshNeedsYou()).catch(() => setFailed('draft'));
  };
  const notNow = (): void => {
    if (busy) return;
    setFailed(null);
    void window.cth.foundationsSnooze(id).then(() => refreshNeedsYou()).catch(() => setFailed('later'));
  };

  // Draft only while a list is empty: with items known, the team grows it through seen items (D6).
  const canDraft = !!raiserId && raiserIsMember && !!drafter && !drafting && !asked?.text && !(list && known);
  return (
    <section ref={sectionRef} role="group" aria-label={question} data-askme-id={taskId} className="cth-askme-card is-open" style={cardStyle}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={dropFile}>
      <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 600, lineHeight: '19px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{question}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
        {raiserName && (
          <span style={chipStyle}><AgentAvatar id={raiserId} name={raiserName} size={16} />{raiserName}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>
          {expired && known?.completeAt ? t('foundations.card.confirmedOn', { day: day(known.completeAt) }) : ago ? t('foundations.card.needsAgo', { ago }) : t('foundations.card.needs')}
        </span>
      </div>
      {/* The evidence first (D2): Michael's bold line on what the work did without it. */}
      <div dir={rtl ? 'auto' : undefined} className="cth-askme-q" style={{ margin: '10px 0 10px', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>
        <FileText source={q} who={{ raisedBy: raiserId }} />
      </div>
      {/* A visible label, and the hint as its description (D12). */}
      <label htmlFor={`${hintId}-box`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, fontWeight: 600, color: 'var(--cth-ink-3)', marginBottom: 4 }}>
        {boxLabel}
        {asked?.text && filled && <span style={{ fontWeight: 500, color: 'var(--cth-indigo-text)' }}>{list ? t('foundations.card.draftedByList', { name: askedName ?? drafter }) : askedName ? t('foundations.card.draftedBy', { name: askedName }) : t('foundations.card.drafted')}</span>}
      </label>
      <GrowingTextarea
        id={`${hintId}-box`}
        aria-describedby={hintId}
        className="cth-input"
        dir={rtl ? 'auto' : undefined}
        value={draft}
        // Held while a save runs: words typed during a file check would be
        // neither saved nor kept (ship review, 2026-10-23). A list waits for its record.
        readOnly={busy || (list && !loaded)}
        maxLength={cap}
        onChange={(e) => setDraft(rowKey, e.target.value)}
        onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}
        style={{
          width: '100%', display: 'block', boxSizing: 'border-box', padding: '8px 10px', minHeight: 64,
          background: 'var(--cth-card)', border: 'none',
          fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)', outline: 'none'
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4, flexWrap: 'wrap' }}>
        <div id={hintId} style={{ flex: 1, minWidth: 160, fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-3)' }}>
          {!list ? t('foundations.card.hint', { n: cap }) : undecided.length ? t('foundations.card.listHintUndecided') : t('foundations.card.listHint')}
          {cap - length <= COUNTER_FROM && <span style={{ marginInlineStart: 6, color: over ? 'var(--cth-coral-text)' : undefined }}>{t('foundations.card.counter', { n: length, max: cap })}</span>}
        </div>
        {file ? (
          <span data-foundation-file style={fileChip}>
            <span dir="auto" title={file.path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file.kind === 'folder' ? t('foundations.card.folderChip', { name: file.name }) : file.name}</span>
            <button type="button" aria-label={t('foundations.card.removeFile', { name: file.name })} disabled={busy} onClick={() => setFile(null)} style={{ ...quietLink, fontSize: 13, lineHeight: '13px', minWidth: 24, minHeight: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 10 }}>
            <button type="button" onClick={() => void pickFile()} disabled={busy} style={{ ...quietLink, fontSize: 11, color: 'var(--cth-indigo-text)' }}>{t('foundations.card.addFile')}</button>
            <button type="button" onClick={() => void pickFolder()} disabled={busy} style={{ ...quietLink, fontSize: 11, color: 'var(--cth-indigo-text)' }}>{t('foundations.card.addFolder')}</button>
          </span>
        )}
      </div>
      {changedSince && <div role="status" style={{ marginTop: 6, fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-2)' }}>{t('foundations.card.listChanged')}</div>}
      {list && (seen.length > 0 || markedRows.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--cth-ink-3)' }}>
            {t('foundations.card.seenTitle')}
            <InfoTip text={t('foundations.card.seenInfo')} label={t('foundations.card.seenInfoLabel')} />
          </div>
          <ul aria-label={t('foundations.card.seenListLabel', { count: seen.length })} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shownSeen.map((s) => (
              <li key={s.id} style={{ marginTop: 6 }}>
                {added.includes(s.id) ? (
                  <div role="status" style={{ ...seenLine, background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)' }}>
                    {t('foundations.card.seenAdded')} <button type="button" onClick={() => undoAdd(s)} style={{ ...quietLink, fontSize: 11, color: 'var(--cth-green-text)', textDecoration: 'underline' }}>{t('foundations.card.undo')}</button>
                  </div>
                ) : isLater(s, now) ? (
                  <div role="status" style={{ ...seenLine, background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)' }}>
                    <span dir="auto">{s.item}</span>: {t('foundations.card.seenBackNextWeek')} <button type="button" onClick={() => void seenDo(s, 'undoLater')} style={{ ...quietLink, fontSize: 11, textDecoration: 'underline' }}>{t('foundations.card.undo')}</button>
                  </div>
                ) : (
                  <div style={{ padding: '8px 10px', borderRadius: 'var(--cth-r-lg)', background: 'var(--cth-amber-soft)' }}>
                    <div dir="auto" title={s.item} style={{ fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.item}</div>
                    <div dir="auto" style={{ marginTop: 2, fontSize: 11, lineHeight: '15px', color: 'var(--cth-amber-text)' }}>
                      {[nameOf(s.by), s.ref ? s.ref.split(/[\\/]/).pop() : '', day(s.at)].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                      <button type="button" data-seen-add={s.id} disabled={busy || !loaded} onClick={() => addItem(s)} aria-label={t('foundations.card.seenAddLabel', { item: s.item })} style={seenAddButton}>
                        {t('foundations.card.seenAdd')}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void seenDo(s, 'notOurs')} aria-label={t('foundations.card.seenNotOursLabel', { item: s.item })} style={{ ...quietLink, minHeight: 24 }}>{t('foundations.card.seenNotOurs')}</button>
                      <button type="button" disabled={busy} onClick={() => void seenDo(s, 'later')} aria-label={t('foundations.card.seenLaterLabel', { item: s.item })} style={{ ...quietLink, minHeight: 24 }}>{t('foundations.card.seenLater')}</button>
                    </div>
                    {rowFailed?.id === s.id && <div role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--cth-coral-text)' }}>{t(rowFailed.what === 'notOurs' ? 'foundations.card.failedNotOurs' : 'foundations.card.failedPutOff')}</div>}
                  </div>
                )}
              </li>
            ))}
            {markedRows.map((n) => (
              <li key={`not-${n.seen!.id}`} style={{ marginTop: 6 }}>
                <div role="status" style={{ ...seenLine, background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)' }}>
                  <span dir="auto">{t('foundations.card.seenMarkedNotOurs', { item: n.item })}</span> <button type="button" onClick={() => void seenDo(n.seen!, 'undoNotOurs')} style={{ ...quietLink, fontSize: 11, color: 'var(--cth-indigo-text)', textDecoration: 'underline' }}>{t('foundations.card.undo')}</button>
                </div>
              </li>
            ))}
          </ul>
          {seen.length > SEEN_SHOWN && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} style={{ ...quietLink, fontSize: 11, marginTop: 6 }}>{t('foundations.card.showMore', { count: seen.length - SEEN_SHOWN })}</button>
          )}
        </div>
      )}
      <div role="status" className="cth-sr-only">{said}</div>
      {refused && (
        <div role="alert" style={{ marginTop: 6, fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>
          {refused.error.startsWith('folder-') ? t(`foundations.card.${FOLDER_LINES[refused.error] ?? 'folderMissing'}`, { name: refused.name })
            : refused.error === 'misfit' ? t('foundations.card.fileMisfit', { name: refused.name, reason: refused.reason ?? '' })
            : refused.error === 'unreadable' ? t('foundations.card.fileUnreadable', { name: refused.name, reason: refused.reason ?? '' })
              : refused.error === 'picture-type' ? t('foundations.card.filePictureType')
                : refused.error === 'picture-engine' ? t('foundations.card.filePictureEngine')
                : refused.error === 'no-file' ? t('foundations.card.fileMissing', { name: refused.name })
                  : t('foundations.card.fileUnchecked')}
        </div>
      )}
      {drafting && (
        <div role="status" style={{ marginTop: 8, padding: '6px 10px', borderRadius: 'var(--cth-r-lg)', background: 'var(--cth-indigo-soft)', color: 'var(--cth-indigo-text)', fontSize: 12, lineHeight: '17px' }}>
          {t('foundations.card.drafting', { name: askedName })}
        </div>
      )}
      {/* At 320 px Save and Draft share a line and Not now wraps to its own (D13); Save never truncates. */}
      <div ref={saveRef} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <PixelButton variant="primary" size="sm" disabled={(!text && !file) || busy || blocked || over} onClick={() => void save()} style={{ height: 32, whiteSpace: 'nowrap' }}>
          {checking ? t('foundations.card.checking') : busy ? t('askMe.sending') : saveLabel}
        </PixelButton>
        {canDraft && (
          <PixelButton variant="secondary" size="sm" disabled={busy} onClick={draftIt} style={{ height: 32 }}>
            {t('foundations.card.draftBy', { name: drafter })}
          </PixelButton>
        )}
        <button type="button" onClick={notNow} disabled={busy} style={{ ...quietLink, marginInlineStart: 'auto' }}>{t('foundations.card.notNow')}</button>
      </div>
      {failed && <div role="alert" style={{ marginTop: 6, fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t(failed === 'save' ? 'foundations.card.failed' : failed === 'draft' ? 'foundations.card.failedDraft' : 'foundations.card.failedLater', { name: drafter })}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--cth-line)', fontSize: 11, color: 'var(--cth-ink-3)', flexWrap: 'wrap' }}>
        <span>{t('foundations.card.usedBy', { count: jobs.length, jobs: jobList })}</span>
        <span style={{ marginInlineStart: 'auto' }}>{t('foundations.card.weekly')}</span>
      </div>
    </section>
  );
}

/** Each folder refusal's card line (foundations.card.*). */
const FOLDER_LINES: Record<string, string> = {
  'folder-no-folder': 'folderMissing',
  'folder-too-wide': 'folderTooWide',
  'folder-app-folder': 'folderApp',
  'folder-member-folder': 'folderMember',
  'folder-empty': 'folderEmpty',
  'folder-too-long': 'folderTooLong'
};

const cardStyle: CSSProperties = {
  position: 'relative', flexShrink: 0,
  padding: '13px 14px 12px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
};
const fileChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11, color: 'var(--cth-ink-2)', maxWidth: 220
};
const quietLink: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-3)'
};
/** Add on a seen row: the secondary button's look at 26 px (DESIGN.md §7.7, §7.27b). */
const seenAddButton: CSSProperties = {
  height: 26, padding: '0 10px', borderRadius: 'var(--cth-r-md)', border: 'none', cursor: 'pointer',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 600
};
/** A seen row once it is settled on this card: one line with its Undo. */
const seenLine: CSSProperties = {
  padding: '6px 10px', borderRadius: 'var(--cth-r-lg)', fontSize: 12, lineHeight: '17px'
};
