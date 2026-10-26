import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isComposingKey } from '@shared/imeGuard';
import { PixelButton } from './PixelButton';
import { InfoTip } from './InfoTip';
import { Disclosure } from './triggers/ui';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useRtl } from '@/i18n/useDirection';
import { JobParts, fieldLabel, hint } from './fieldText';
import { Spinner } from './GetMichaelReady';
import { homeRows, type HomeChoice } from '@shared/jobChange';

export type ReviseResult = Awaited<ReturnType<Window['cth']['workStyleRevise']>>;
export type ReviseOk = Extract<ReviseResult, { kind: 'ok' }>;
type Question = Extract<ReviseResult, { kind: 'question' }>;
type Progress = Parameters<Parameters<Window['cth']['onWorkStyleProgress']>[1]>[0];
type Answer = { question: string; answer: string };

/** Teammates a change adds to the overlap, why, and the check's split. */
type Overlap = { names: string[]; why: string; suggestion?: string };

/** A teammate the overlap check named, by id for the handoffs. */
export interface Teammate { id: string; name: string; title?: string }

export type { HomeChoice };

/** What a run is given: the typed change, any change added on the way (Leave
 *  it with Kelly), the owner's answers so far, how the work splits with the
 *  teammates the check named, and its stop id. */
export interface ReviseRun {
  typed: string;
  extras: string[];
  answers: Answer[];
  explanation?: string;
  teammates?: Teammate[];
  requestId: string;
}

export interface JobChangeReviewProps {
  /** Whose job, for the copy ("Working out what changes for Pam…"). */
  who: string;
  /** Michael or his assistant: no "What X handles" in the preview. */
  lead?: boolean;
  /** The change box; absent on the pack update card, which runs at once. */
  box?: { label: string; info?: string; placeholder?: string; button: string };
  /** The preview's heading; "Here's what changes" unless given. */
  previewTitle?: string;
  /** The rewrite: main's revise call, or the pack card's own. */
  run: (r: ReviseRun) => Promise<ReviseResult>;
  /** Only when the duties changed (eng D6): who already does the new work,
   *  the check's split suggestion, and those teammates by id. */
  checkOverlap?: (ok: ReviseOk) => Promise<{ names: string[]; why: string; suggestion?: string; teammates?: Teammate[] } | null>;
  /** A teammate's name now, for the preview's handoff lines. */
  nameOf?: (id: string) => string | undefined;
  /** Where tracked numbers can live, when a run asks (Edit agent only). */
  homeChoices?: () => HomeChoice[];
  /** Opens the member's Access tab, from the preview's access note. */
  onOpenAccess?: () => void;
  /** The job the run starts from, compared again at Apply (A3). */
  base?: () => string;
  /** Saves the job: 'moved' when it changed since `startedFrom`. */
  apply: (ok: ReviseOk, change: string, startedFrom: string) => Promise<'applied' | 'moved' | 'failed'>;
  applyLabel: string;
  /** The pack card: run on mount, Cancel closes it. */
  autoRun?: boolean;
  onCancel?: () => void;
  /** The line under the box after Apply or Undo (role=status). */
  status?: string | null;
  /** Bumped by the parent (Undo) to put focus back in the box. */
  focusKey?: number;
  /** Something typed or shown that leaving would lose. */
  onDraft?: (draft: boolean) => void;
  /** A change to start the box with (a run comparison's suggestion from
   *  Pulse). Only fills the box: nothing runs until the owner asks. */
  initialTyped?: string;
  /** A run or a preview is up: the parent holds its own buttons. */
  onBusy?: (busy: boolean) => void;
  /** False where Apply sends no card for a one-time task (Michael's own job,
   *  the pack update card), so the preview never promises one. */
  sendsTask?: boolean;
}

type State =
  | { at: 'idle' }
  | { at: 'working'; progress?: Progress }
  | { at: 'ok'; ok: ReviseOk; from: string; overlap?: Overlap }
  | { at: 'question'; q: Question }
  | { at: 'home'; question: string }
  | { at: 'explain'; back: { ok: ReviseOk; from: string; overlap: Overlap } }
  | { at: 'error' }
  | { at: 'moved' };

const SUMMARY_SHOWN = 6;

/**
 * "What should change?" and its preview (docs/designs/work-style-change-request.md,
 * DESIGN.md §7.26): the owner types what should change, the app shows what
 * changes, and nothing saves before Apply. The preview takes the box's place
 * on the indigo-soft fill (DR8); a clash asks with option rows (DR5); an
 * overlap names the teammate (DR6). Edit agent, the hire wizard and the pack
 * update card share it.
 */
export function JobChangeReview(p: JobChangeReviewProps) {
  const { t, i18n } = useTranslation();
  const rtl = useRtl();
  const [typed, setTyped] = useState(p.initialTyped ?? '');
  const [extras, setExtras] = useState<string[]>([]);
  // How the owner says the work splits (design D3: asked in the overlap card).
  // `explainText` is the box; `explanation` is what the last run was given.
  const [explainText, setExplainText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [state, setState] = useState<State>({ at: p.autoRun ? 'working' : 'idle' });
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  const runId = useRef<string | null>(null);
  /** Bumped by every start, Stop and Cancel: a run that awaited something
   *  (the overlap check) shows nothing once a newer step has happened. */
  const runSeq = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const answersRef = useRef<Answer[]>([]);
  /** Every teammate the overlap check named during this change (eng S5). */
  const named = useRef(new Map<string, Teammate>());
  /** Where the owner said tracked numbers live, for the access note. */
  const homePick = useRef<HomeChoice | undefined>(undefined);
  /** Back to a fresh change: nothing explained, answered or named. */
  const resetSplit = (): void => {
    setExplainText('');
    setExplanation('');
    named.current.clear();
    homePick.current = undefined;
  };

  const stopRun = (): void => {
    const id = runId.current;
    runId.current = null;
    if (id) void window.cth.workStyleConvertStop?.(id)?.catch(() => undefined);
  };
  // Closing the dialog mid rewrite stops it (eng D9).
  useEffect(() => () => stopRun(), []);

  const start = async (more: string[] = extras, answers: Answer[] = [], expl: string = explanation): Promise<void> => {
    if (!p.autoRun && !typed.trim()) return;
    stopRun();
    const seq = ++runSeq.current;
    const requestId = `revise-${crypto.randomUUID()}`;
    runId.current = requestId;
    answersRef.current = answers;
    if (!answers.length) homePick.current = undefined;
    setFailed(false);
    setState({ at: 'working' });
    // Real steps and the words as they are written, from main (owner,
    // 2026-10-23: a still box for up to a minute read as stuck).
    const off = window.cth.onWorkStyleProgress?.(requestId, (progress) => {
      if (runId.current !== requestId) return;
      setState((s) => (s.at === 'working' ? { at: 'working', progress } : s));
    });
    const from = p.base?.() ?? '';
    const res = await p.run({
      typed: typed.trim(), extras: more, answers, requestId,
      ...(expl ? { explanation: expl, teammates: [...named.current.values()] } : {})
    }).catch((): ReviseResult => ({ kind: 'error', reason: 'failed' }));
    off?.();
    if (runId.current !== requestId) return; // stopped, or a newer run
    runId.current = null;
    if (res.kind === 'error') { setState(res.reason === 'cancelled' ? { at: 'idle' } : { at: 'error' }); return; }
    if (res.kind === 'question') { setState({ at: 'question', q: res }); return; }
    if (res.kind === 'home') { setState(p.homeChoices ? { at: 'home', question: res.question } : { at: 'error' }); return; }
    // An overlap never blocks a job change: the preview names the teammates
    // the change adds, with a way to explain the split, and Apply stays on
    // (owner, 2026-10-24: the check stopped the same change four times that
    // passes fifteen times out of fifteen on a replay).
    let overlap: Overlap | undefined;
    if (res.handles && p.checkOverlap) {
      const found = await p.checkOverlap(res).catch(() => null);
      if (runSeq.current !== seq) return; // stopped or replaced during the check
      if (found?.names.length) {
        for (const m of found.teammates ?? []) named.current.set(m.id, m);
        overlap = { names: found.names, why: found.why, suggestion: found.suggestion };
      }
    }
    setState({ at: 'ok', ok: res, from, ...(overlap ? { overlap } : {}) });
  };
  useEffect(() => { if (p.autoRun) void start([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = (): void => { runSeq.current++; stopRun(); setState({ at: 'idle' }); if (p.autoRun) p.onCancel?.(); };
  const cancel = (): void => { runSeq.current++; setState({ at: 'idle' }); setExtras([]); resetSplit(); if (p.autoRun) p.onCancel?.(); };
  const doApply = async (ok: ReviseOk, from: string): Promise<void> => {
    setApplying(true);
    setFailed(false);
    // The owner's answers and split go with the change, so a pack update that
    // replays the list never asks the same thing again.
    const answered = answersRef.current.map((a) => a.answer.trim()).filter(Boolean).map((a) => `(${a})`);
    const change = [typed.trim(), ...extras, explanation.trim(), ...answered].filter(Boolean).join(' ');
    const r = await p.apply(ok, change, from).catch(() => 'failed' as const);
    setApplying(false);
    if (r === 'moved') { setState({ at: 'moved' }); return; }
    if (r === 'failed') { setFailed(true); return; }
    setTyped('');
    setExtras([]);
    resetSplit();
    setState({ at: 'idle' });
  };

  // Focus follows the state: each new state's heading, the box when back
  // (DR10). Not on opening: the dialog's first field keeps it.
  const shown = useRef(false);
  useEffect(() => {
    if (!shown.current) { shown.current = true; if (state.at === 'idle') return; }
    if (state.at === 'idle') { if (!p.autoRun) box.current?.focus({ preventScroll: true }); return; }
    heading.current?.focus({ preventScroll: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  useEffect(() => { if (p.focusKey) box.current?.focus({ preventScroll: true }); }, [p.focusKey]);
  const draft = !!typed.trim() || state.at !== 'idle';
  useEffect(() => { p.onDraft?.(draft); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = state.at !== 'idle';
  useEffect(() => { p.onBusy?.(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBoxKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start(); }
  };
  const shortcut = window.cth.platform === 'darwin' ? t('jobChange.shortcutMac') : t('jobChange.shortcutOther');

  const head = (text: string, tone: 'ink' | 'coral' = 'ink'): ReactNode => (
    <div ref={heading} tabIndex={-1} style={{ ...headStyle, color: tone === 'coral' ? 'var(--cth-coral-text)' : 'var(--cth-ink)' }}>{text}</div>
  );

  // The language's own list ("Pam, Erin and Dwight").
  const listOf = (items: string[]): string => { try { return new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
  const splitNames = listOf([...named.current.values()].map((m) => m.name));

  let panel: ReactNode = null;
  if (state.at === 'working') {
    panel = <Working who={p.who} progress={state.progress} heading={head(t('jobChange.working', { name: p.who }))} onStop={stop} />;
  } else if (state.at === 'ok') {
    // A split explained but none written (design D6), and a picked tool the
    // member can't use yet (eng re-run D1): white notes above Apply.
    const noSplit = !!explanation && !state.ok.handoffs?.length && named.current.size > 0;
    const pick = homePick.current;
    const { ok, from } = state;
    const overlap = state.overlap;
    const names = overlap ? listOf(overlap.names) : '';
    const count = overlap?.names.length ?? 0;
    panel = <Preview ok={state.ok} who={p.who} lead={p.lead} sendsTask={p.sendsTask ?? true} title={p.previewTitle ?? t('jobChange.previewTitle')} heading={heading}
      applyLabel={p.applyLabel} applying={applying} failed={failed} onCancel={cancel} onApply={() => { void doApply(state.ok, state.from); }}
      nameOf={(id) => p.nameOf?.(id) ?? named.current.get(id)?.name}
      noSplit={noSplit ? t('jobChange.noSplit', { names: splitNames, count: named.current.size }) : undefined}
      noAccess={pick?.noAccess && pick.tool ? t('jobChange.noAccess', { name: p.who, tool: pick.tool }) : undefined}
      onOpenAccess={p.onOpenAccess}
      overlap={overlap ? {
        // The verb agrees with how many (owner, 2026-10-23: "Pam and Erin already does").
        title: t('jobChange.overlapTitle', { names, count }),
        why: overlap.why,
        explainLabel: t('jobChange.explain'),
        onExplain: () => {
          setExplainText((v) => v || explanation || overlap.suggestion || '');
          setState({ at: 'explain', back: { ok, from, overlap } });
        },
        leaveLabel: t('jobChange.leaveWith', { names }),
        onLeave: () => {
          const more = [...extras, t('jobChange.leaveWithChange', { names, count })];
          setExtras(more);
          void start(more, answersRef.current);
        }
      } : undefined} />;
  } else if (state.at === 'question') {
    panel = <Clash q={state.q} who={p.who} heading={heading} onCancel={cancel}
      onAnswer={(answer) => { void start(extras, [...answersRef.current, { question: state.q.question, answer }]); }} />;
  } else if (state.at === 'home') {
    panel = <Home question={state.question} choices={p.homeChoices?.() ?? []} heading={heading} onCancel={cancel}
      onAnswer={(choice) => { homePick.current = choice; void start(extras, [...answersRef.current, { question: state.question, answer: choice.label }]); }} />;
  } else if (state.at === 'explain') {
    // In the card, with the check's reason still in view (design D3); not an
    // alert, so a screen reader doesn't read a text box out as a warning.
    const { back } = state;
    const others = back.overlap.names;
    const see = (): void => {
      const text = explainText.trim();
      if (!text) return;
      setExplanation(text);
      void start(extras, answersRef.current, text);
    };
    const title = t('jobChange.explainTitle', { names: listOf([p.who, ...others]) });
    panel = (
      <div style={panelStyle}>
        {head(title)}
        {back.overlap.why && <span style={noteStyle}>{back.overlap.why}</span>}
        <textarea
          value={explainText}
          onChange={(e) => setExplainText(e.target.value)}
          onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); see(); } }}
          placeholder={t('jobChange.explainPlaceholder', { who: p.who, other: listOf(others) })}
          aria-label={title}
          rows={3}
          className="cth-input"
          dir={rtl ? 'auto' : undefined}
          style={{ width: '100%', minHeight: 74, padding: '7px 10px', background: 'var(--cth-card)', border: 'none', outline: 'none', borderRadius: 'var(--cth-r-md)', boxSizing: 'border-box', fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)', resize: 'vertical' }}
        />
        <div style={{ ...rowEnd, justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setState({ at: 'ok', ...back })} style={{ ...linkStyle, alignSelf: 'center' }}>{t('jobChange.back')}</button>
          <PixelButton variant="primary" size="sm" onClick={see} disabled={!explainText.trim()}>{t('jobChange.see')}</PixelButton>
        </div>
      </div>
    );
  } else if (state.at === 'error') {
    panel = (
      <div role="alert" style={panelStyle}>
        {head(t('jobChange.errorTitle'))}
        <span style={noteStyle}>{t(p.autoRun ? 'jobChange.errorNoteCard' : 'jobChange.errorNote')}</span>
        <div style={rowEnd}>
          <PixelButton variant="secondary" size="sm" onClick={cancel}>{t('jobChange.cancel')}</PixelButton>
          <PixelButton variant="primary" size="sm" onClick={() => { void start(extras, answersRef.current); }}>{t('jobChange.tryAgain')}</PixelButton>
        </div>
      </div>
    );
  } else if (state.at === 'moved') {
    panel = (
      <div role="alert" style={panelStyle}>
        {head(t('jobChange.movedTitle', { name: p.who }))}
        <span style={noteStyle}>{t(p.autoRun ? 'jobChange.movedNoteCard' : 'jobChange.movedNote')}</span>
        {!p.autoRun && <span style={{ ...bodyStyle, padding: '8px 10px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)' }}>{typed}</span>}
        <div style={rowEnd}>
          <PixelButton variant="secondary" size="sm" onClick={cancel}>{t('jobChange.cancel')}</PixelButton>
          <PixelButton variant="primary" size="sm" onClick={() => { void start(extras, answersRef.current); }}>{t('jobChange.seeAgain')}</PixelButton>
        </div>
      </div>
    );
  }

  if (!p.box) return <>{panel}</>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={fieldLabel}>{p.box.label}</span>
          {p.box.info && <InfoTip text={p.box.info} label={p.box.label} />}
        </span>
        {state.at === 'idle' && (
          <textarea
            ref={box}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onBoxKey}
            placeholder={p.box.placeholder}
            aria-label={p.box.label}
            rows={3}
            className="cth-input"
            dir={rtl ? 'auto' : undefined}
            style={{ width: '100%', minHeight: 74, padding: '7px 10px', background: 'var(--cth-card)', border: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)', resize: 'vertical' }}
          />
        )}
      </label>
      {state.at === 'idle' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <span aria-hidden="true" style={{ fontSize: 11.5, color: 'var(--cth-ink-3)' }}>{shortcut}</span>
          <PixelButton variant="secondary" size="sm" onClick={() => { void start(); }} disabled={!typed.trim()}>{p.box.button}</PixelButton>
        </div>
      ) : panel}
      {state.at === 'idle' && p.status && <span role="status" style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>{p.status}</span>}
    </div>
  );
}

/** The three real steps of a run, as main reports them. */
const STEPS = ['starting', 'reading', 'writing'] as const;

/**
 * While a run works: its three real steps, ticked off as main reports them,
 * and what is written so far (the summary lines, then the plain words, or the
 * question). Only the steps are announced; the words would chatter.
 */
function Working({ who, progress, heading, onStop }: { who: string; progress?: Progress; heading: ReactNode; onStop: () => void }) {
  const { t } = useTranslation();
  const at = STEPS.indexOf(progress?.stage ?? 'starting');
  const seen = progress?.preview;
  const any = !!seen && (seen.summary.length > 0 || !!seen.plain || !!seen.question);
  return (
    <div style={panelStyle}>
      {heading}
      <ol role="status" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STEPS.map((step, i) => (
          <li key={step} data-step={step} data-at={i < at ? 'done' : i === at ? 'now' : 'next'} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: '18px', color: i < at ? 'var(--cth-ink-2)' : i === at ? 'var(--cth-ink)' : 'var(--cth-ink-3)', fontWeight: i === at ? 600 : 400 }}>
            <span aria-hidden="true" style={stepMark}>
              {i < at ? <span style={{ color: 'var(--cth-green-text)' }}>✓</span> : i === at ? <Spinner /> : <span style={{ ...dot, background: 'var(--cth-ink-4)', transform: 'none' }} />}
            </span>
            <span>{t(`jobChange.steps.${step}`, { name: who })}</span>
          </li>
        ))}
      </ol>
      {any && seen && (
        <div aria-live="off" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)' }}>
          <span style={hint}>{t('jobChange.soFar')}</span>
          {seen.question && <span style={bodyStyle}>{seen.question}</span>}
          {seen.summary.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {seen.summary.map((l, i) => <li key={i} style={dotLine}><span aria-hidden="true" style={dot} /><span>{l}</span></li>)}
            </ul>
          )}
          {seen.plain && <JobParts plain={seen.plain} />}
        </div>
      )}
      <div style={rowEnd}><PixelButton variant="secondary" size="sm" onClick={onStop}>{t('jobChange.stop')}</PixelButton></div>
    </div>
  );
}

/** The new job: what changes, the new "What X handles", the whole job folded. */
function Preview({ ok, who, lead, sendsTask, title, heading, applyLabel, applying, failed, onCancel, onApply, nameOf, noSplit, noAccess, onOpenAccess, overlap }: {
  ok: ReviseOk; who: string; lead?: boolean; sendsTask: boolean; title: string; heading: React.RefObject<HTMLDivElement>;
  applyLabel: string; applying: boolean; failed: boolean; onCancel: () => void; onApply: () => void;
  nameOf?: (id: string) => string | undefined; noSplit?: string; noAccess?: string; onOpenAccess?: () => void;
  /** Teammates the change adds to the overlap: a note with two optional
   *  ways to settle it; Apply stays on (owner, 2026-10-24). */
  overlap?: { title: string; why: string; explainLabel: string; onExplain: () => void; leaveLabel: string; onLeave: () => void };
}) {
  const { t } = useTranslation();
  const manager = useResolvedGodName();
  const [all, setAll] = useState(false);
  const [whole, setWhole] = useState(false);
  const lines = all ? ok.summary : ok.summary.slice(0, SUMMARY_SHOWN);
  return (
    <div style={panelStyle}>
      <div ref={heading} tabIndex={-1} style={headStyle}>{title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lines.map((l, i) => <li key={i} style={dotLine}><span aria-hidden="true" style={dot} /><span>{l}</span></li>)}
        {sendsTask && ok.oneTimeTask && <li style={dotLine}><span aria-hidden="true" style={dot} /><span>{t('jobChange.oneTimeTask', { task: ok.oneTimeTask, manager })}</span></li>}
      </ul>
      {ok.summary.length > SUMMARY_SHOWN && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} style={linkStyle}>{all ? t('jobChange.showLess') : t('jobChange.showAll')}</button>
      )}
      {!lead && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={fieldLabel}>{t('jobChange.handles', { name: who })}</span>
          {ok.handles
            ? <span style={bodyStyle}>{ok.handles}</span>
            : <span style={unchangedTag}>{t('jobChange.unchanged')}</span>}
        </div>
      )}
      {/* Routing to a teammate is its own kind of change: a labelled group
          under What X handles, + added and − taken back (design D4). The
          marks are for the eye; the words say it. */}
      {!lead && (ok.handoffs?.length || ok.drops?.length) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={fieldLabel}>{t('jobChange.goesToGroup')}</span>
          {(ok.handoffs ?? []).map((h) => (
            <div key={`+${h.toId}${h.scope}`} style={handoffRow}>
              <span aria-hidden="true" style={{ ...handoffMark, background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)' }}>+</span>
              <span>{t('jobChange.goesTo', { name: nameOf?.(h.toId) ?? h.toId, scope: h.scope })}</span>
            </div>
          ))}
          {(ok.drops ?? []).map((h) => (
            <div key={`-${h.toId}${h.scope}`} style={{ ...handoffRow, color: 'var(--cth-ink-2)' }}>
              <span aria-hidden="true" style={{ ...handoffMark, background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-3)' }}>{'\u2212'}</span>
              <span>{t('jobChange.noLongerGoesTo', { name: nameOf?.(h.toId) ?? h.toId, scope: h.scope })}</span>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" aria-expanded={whole} onClick={() => setWhole((v) => !v)} style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
        <Disclosure open={whole} />{t('jobChange.seeWhole')}
      </button>
      {whole && <div style={{ padding: '8px 10px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)' }}><JobParts plain={ok.plain} /></div>}
      {overlap && (
        <Note>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--cth-ink)' }}>{overlap.title}</span>
            {overlap.why && <span>{overlap.why}</span>}
            <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={overlap.onExplain} disabled={applying} style={{ ...linkStyle, color: 'var(--cth-ink)' }}>{overlap.explainLabel}</button>
              <button type="button" onClick={overlap.onLeave} disabled={applying} style={linkStyle}>{overlap.leaveLabel}</button>
            </span>
          </span>
        </Note>
      )}
      {noSplit && <Note>{noSplit}</Note>}
      {noAccess && (
        <Note>
          {noAccess}{' '}
          {onOpenAccess && <button type="button" onClick={onOpenAccess} style={{ ...linkStyle, display: 'inline' }}>{t('jobChange.openAccess')}</button>}
        </Note>
      )}
      {failed && <span role="alert" style={{ fontSize: 12, color: 'var(--cth-coral-text)' }}>{t('jobChange.applyFailed')}</span>}
      {/* The decision stays in reach on a short window (DR11). */}
      <div style={{ ...rowEnd, position: 'sticky', bottom: 0, paddingTop: 6, background: 'var(--cth-indigo-soft)' }}>
        <PixelButton variant="secondary" size="sm" onClick={onCancel} disabled={applying}>{t('jobChange.cancel')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={onApply} disabled={applying}>{applyLabel}</PixelButton>
      </div>
    </div>
  );
}

/** A calm warning in the preview: white on indigo, above Apply, not an alert
 *  (design D6). */
function Note({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)', ...noteStyle }}>
      <span aria-hidden="true" style={infoMark}>i</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

/**
 * Where the member keeps what a change asks them to track (design D5, D8):
 * their own folder first (suggested), then every connector, the ones on in
 * Settings > Connections A to Z, then the ones switched off there, greyed.
 * Four tools show before Show all. Off rows stay in the group, read out as
 * switched off, and the arrow keys pass them by.
 */
function Home({ question, choices, heading, onCancel, onAnswer }: {
  question: string; choices: HomeChoice[]; heading: React.RefObject<HTMLDivElement>;
  onCancel: () => void; onAnswer: (choice: HomeChoice) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState<number | undefined>(undefined);
  const [all, setAll] = useState(false);
  const rows = homeRows(choices, all);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const live = rows.map((r, i) => (r.choice.off ? -1 : i)).filter((i) => i >= 0);
  const send = (): void => { if (pick !== undefined && rows[pick]) onAnswer(rows[pick].choice); };
  const move = (from: number, step: 1 | -1): void => {
    if (!live.length) return;
    const at = live.indexOf(from);
    const next = live[((at < 0 ? (step > 0 ? -1 : 0) : at) + step + live.length) % live.length];
    setPick(next);
    refs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number): void => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !rows[i]?.choice.off) { e.preventDefault(); setPick(i); }
  };
  const first = live[0];
  return (
    <div style={panelStyle}>
      <div ref={heading} tabIndex={-1} style={headStyle}>{t('jobChange.questionTitle')}</div>
      <span style={bodyStyle}>{question}</span>
      <div role="radiogroup" aria-label={question} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => {
          const on = pick === i;
          const off = !!r.choice.off;
          return (
            <div key={`${r.choice.label}${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.toolsStart && <span style={{ ...hint, fontWeight: 600 }}>{t('jobChange.homeTools')}</span>}
              <div ref={(el) => { refs.current[i] = el; }} role="radio" aria-checked={on} aria-disabled={off || undefined}
                aria-label={off ? t('jobChange.homeOffLabel', { tool: r.choice.label }) : undefined}
                tabIndex={off ? -1 : on || (pick === undefined && i === first) ? 0 : -1}
                onClick={() => { if (!off) setPick(i); }} onKeyDown={(e) => onKey(e, i)}
                className={on ? 'cth-askme-opt is-on' : 'cth-askme-opt'}
                style={off ? { color: 'var(--cth-ink-3)', background: 'var(--cth-card-2)', cursor: 'default', boxShadow: 'none' } : undefined}>
                <span className="cth-askme-dot" aria-hidden="true" style={off ? { borderStyle: 'dashed' } : undefined} />
                <span style={{ flex: 1, minWidth: 0 }}>{r.choice.label}</span>
                {i === 0 && !r.choice.tool && <span style={suggestedTag}>{t('jobChange.suggested')}</span>}
                {off && <span aria-hidden="true" style={{ ...unchangedTag, alignSelf: 'center' }}>{t('jobChange.homeOff')}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {!all && rows.hidden > 0 && (
        <button type="button" aria-expanded={false} onClick={() => setAll(true)} style={linkStyle}>{t('jobChange.homeShowAll', { count: rows.tools })}</button>
      )}
      <div style={rowEnd}>
        <PixelButton variant="secondary" size="sm" onClick={onCancel}>{t('jobChange.cancel')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={send} disabled={pick === undefined}>{t('jobChange.continue')}</PixelButton>
      </div>
    </div>
  );
}

/** A clash: two or three answers, one suggested, or the owner's own (DR5). */
function Clash({ q, who, heading, onCancel, onAnswer }: {
  q: Question; who: string; heading: React.RefObject<HTMLDivElement>; onCancel: () => void; onAnswer: (answer: string) => void;
}) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const [pick, setPick] = useState<number | undefined>(undefined);
  const [own, setOwn] = useState('');
  const rows = [...q.choices.map((c) => c.label), t('jobChange.somethingElse')];
  const ownAt = rows.length - 1;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const answer = pick === undefined ? '' : pick === ownAt ? own.trim() : rows[pick];
  const send = (): void => { if (answer) onAnswer(answer); };
  const move = (to: number): void => { const n = (to + rows.length) % rows.length; setPick(n); refs.current[n]?.focus(); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number): void => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPick(i); }
  };
  return (
    <div style={panelStyle}>
      <div ref={heading} tabIndex={-1} style={headStyle}>{t('jobChange.questionTitle')}</div>
      <span style={bodyStyle}>{q.question}</span>
      <div role="radiogroup" aria-label={t('jobChange.questionTitle')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((label, i) => {
          const on = pick === i;
          return (
            <div key={i} ref={(el) => { refs.current[i] = el; }} role="radio" aria-checked={on}
              tabIndex={on || (pick === undefined && i === 0) ? 0 : -1}
              onClick={() => setPick(i)} onKeyDown={(e) => onKey(e, i)}
              className={on ? 'cth-askme-opt is-on' : 'cth-askme-opt'}>
              <span className="cth-askme-dot" aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              {i < ownAt && q.choices[i].suggested && <span style={suggestedTag}>{t('jobChange.suggested')}</span>}
            </div>
          );
        })}
      </div>
      {pick === ownAt && (
        <input value={own} onChange={(e) => setOwn(e.target.value)} autoFocus dir={rtl ? 'auto' : undefined}
          onKeyDown={(e) => { if (!isComposingKey(e) && e.key === 'Enter') { e.preventDefault(); send(); } }}
          placeholder={t('jobChange.somethingElsePlaceholder', { name: who })} aria-label={t('jobChange.somethingElse')}
          className="cth-input" style={{ width: '100%', minHeight: 34, padding: '7px 10px', background: 'var(--cth-card)', border: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink)' }} />
      )}
      <div style={rowEnd}>
        <PixelButton variant="secondary" size="sm" onClick={onCancel}>{t('jobChange.cancel')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={send} disabled={!answer}>{t('jobChange.continue')}</PixelButton>
      </div>
    </div>
  );
}

/** The preview sits on indigo-soft in the box's place: no border, no shadow (DR8). */
const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-indigo-soft)', fontFamily: 'var(--cth-font-ui)'
};
const headStyle: CSSProperties = { fontSize: 13, fontWeight: 600, lineHeight: '18px', outline: 'none' };
const stepMark: CSSProperties = { width: 14, height: 14, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 };
const noteStyle: CSSProperties = { fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' };
const bodyStyle: CSSProperties = { fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)' };
const rowEnd: CSSProperties = { display: 'flex', gap: 7, justifyContent: 'flex-end', alignItems: 'center' };
const dotLine: CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)' };
const dot: CSSProperties = { flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--cth-indigo)', transform: 'translateY(-1px)' };
const linkStyle: CSSProperties = {
  alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-2)', textDecoration: 'underline', textUnderlineOffset: 2
};
const unchangedTag: CSSProperties = {
  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-card)', color: 'var(--cth-ink-3)', fontSize: 11.5, fontWeight: 600
};
const handoffRow: CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)' };
const handoffMark: CSSProperties = {
  flexShrink: 0, width: 16, height: 16, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, lineHeight: 1, transform: 'translateY(2px)'
};
const infoMark: CSSProperties = {
  flexShrink: 0, width: 14, height: 14, marginTop: 2, borderRadius: '50%', border: '1.3px solid var(--cth-ink-3)', boxSizing: 'border-box',
  color: 'var(--cth-ink-3)', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
};
const suggestedTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', flexShrink: 0, height: 18, padding: '0 7px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap'
};
