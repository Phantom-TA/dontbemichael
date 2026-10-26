/**
 * Converts a work style between the owner's plain description and the agent's
 * instructions (src/shared/workStyleText.ts). A hidden model call with no
 * tools does the rewrite; when it can't, the plain-text fallback answers and
 * says so, so hiring never waits on a sign-in problem.
 */
import { runHiddenModel, type HiddenModelEngine } from './hiddenModel';
import { appendOnce, BINDING_LINE_RE, splitBindings } from '../shared/hireTemplates';
import { handoffLine, JOB_CHANGES_MAX } from '../shared/jobChange';
import {
  cleanAnswer,
  focusCheckPrompt,
  instructionsFallback,
  parseFocusCheck,
  instructionsOpening,
  parseRevise,
  revisePreview,
  plainFallback,
  roleLabel,
  toInstructionsPrompt,
  toPlainPrompt,
  toRevisePrompt,
  type ReviseAnswer,
  type ReviseInput,
  type ReviseProgress,
  type WorkStyleContext
} from '../shared/workStyleText';

/** Reading instructions back is a summary: Haiku. Writing them is the part the
 *  team member lives by: Sonnet. */
const PLAIN_MODEL = 'claude-haiku-4-5';
export const INSTRUCTIONS_MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 90_000;
const MAX_TEXT = 8000;

export interface ConvertDeps extends HiddenModelEngine {
  cwd: string;
  command: string;
  env?: Record<string, string>;
  log?: (event: Record<string, unknown>) => void;
}

export interface ConvertRequest {
  to: 'plain' | 'instructions';
  text: string;
  ctx: WorkStyleContext;
  /** For 'instructions': the work style being replaced, to keep its wording. */
  previous?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The renderer's payload, trusted for nothing but short strings. */
export function readConvertRequest(v: unknown): ConvertRequest | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.to !== 'plain' && o.to !== 'instructions') return null;
  const text = str(o.text, MAX_TEXT);
  const c = (o.ctx && typeof o.ctx === 'object' ? o.ctx : {}) as Record<string, unknown>;
  const b = (c.business && typeof c.business === 'object' ? c.business : {}) as Record<string, unknown>;
  const name = str(c.name, 60).trim();
  if (!text.trim() || !name) return null;
  return {
    to: o.to,
    text,
    ctx: { name, title: str(c.title, 120) || undefined, business: { name: str(b.name, 120) || undefined, city: str(b.city, 120) || undefined }, manager: str(c.manager, 60).trim() || undefined },
    previous: str(o.previous, MAX_TEXT) || undefined
  };
}

export async function convertWorkStyle(req: ConvertRequest, deps: ConvertDeps): Promise<{ text: string; source: 'ai' | 'rules' }> {
  const fallback = () => (req.to === 'plain' ? plainFallback(req.text, roleLabel(req.ctx.title)) : instructionsFallback(req.text, req.ctx));
  try {
    const prompt = req.to === 'plain' ? toPlainPrompt(req.text, req.ctx) : toInstructionsPrompt(req.text, req.ctx, req.previous);
    const result = await runHiddenModel(prompt, {
      engine: deps.engine,
      engineModel: deps.engineModel,
      model: req.to === 'plain' ? PLAIN_MODEL : INSTRUCTIONS_MODEL,
      cwd: deps.cwd,
      command: deps.command,
      noTools: true,
      env: deps.env,
      timeoutMs: TIMEOUT_MS
    });
    let text = result.ok && result.text ? cleanAnswer(result.text) : '';
    // Instructions must start with the house opening line: a refusal or a
    // chatty preamble is never saved as an agent's work style.
    if (text && req.to === 'instructions') {
      const opening = instructionsOpening(req.ctx.business);
      const at = text.indexOf(opening);
      text = at >= 0 ? text.slice(at).trim() : '';
    }
    if (text) return { text, source: 'ai' };
    deps.log?.({ kind: 'work-style-fallback', to: req.to, reason: result.ok ? 'empty' : (result.error ?? 'failed') });
  } catch (e) {
    deps.log?.({ kind: 'work-style-fallback', to: req.to, reason: String(e).slice(0, 200) });
  }
  return { text: fallback(), source: 'rules' };
}

/** The renderer's "What should change?" request (work-style-change-request.md). */
export interface ReviseRequest {
  requestId?: string;
  ctx: WorkStyleContext;
  current: { instructions: string; handles: string };
  changes: string[];
  answer?: { question: string; answer: string };
  /** Every answer the owner gave this change, oldest first. */
  answers?: Array<{ question: string; answer: string }>;
  lead?: boolean;
  /** How the owner says the work splits, and with whom (overlap split plan). */
  explanation?: string;
  teammates?: Array<{ id: string; name: string; title?: string }>;
  /** The member's live handoffs with their exact role line sentence, so a
   *  drop takes out exactly that line (eng Arch 2). */
  handoffList?: Array<{ toId: string; scope: string; line: string; toTitle?: string }>;
  askHome?: boolean;
}

export type ReviseResult = ReviseAnswer | { kind: 'error'; reason: 'failed' | 'cancelled' };

const CHANGE_MAX = 1500;

/** The renderer's payload, trusted for nothing but short strings. */
export function readReviseRequest(v: unknown): ReviseRequest | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.to !== 'revise') return null;
  const c = (o.ctx && typeof o.ctx === 'object' ? o.ctx : {}) as Record<string, unknown>;
  const b = (c.business && typeof c.business === 'object' ? c.business : {}) as Record<string, unknown>;
  const cur = (o.current && typeof o.current === 'object' ? o.current : {}) as Record<string, unknown>;
  const a = (o.answer && typeof o.answer === 'object' ? o.answer : null) as Record<string, unknown> | null;
  const name = str(c.name, 60).trim();
  const changes = (Array.isArray(o.changes) ? o.changes : []).slice(-JOB_CHANGES_MAX).map((x) => str(x, CHANGE_MAX).trim()).filter(Boolean);
  if (!name || changes.length === 0) return null;
  const answer = a ? { question: str(a.question, 400).trim(), answer: str(a.answer, CHANGE_MAX).trim() } : undefined;
  // The newest four: the latest answer is the one the rewrite must see.
  const answers = (Array.isArray(o.answers) ? o.answers : []).slice(-4)
    .map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {}))
    .map((x) => ({ question: str(x.question, 400).trim(), answer: str(x.answer, CHANGE_MAX).trim() }))
    .filter((x) => x.question && x.answer);
  const teammates = (Array.isArray(o.teammates) ? o.teammates : []).slice(0, 20)
    .map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {}))
    .map((x) => ({ id: str(x.id, 80).trim(), name: str(x.name, 60).trim(), title: str(x.title, 120).trim() || undefined }))
    .filter((x) => x.id && x.name);
  // Only real handoff sentences: a drop removes the line word for word.
  const handoffList = (Array.isArray(o.handoffList) ? o.handoffList : []).slice(0, 20)
    .map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {}))
    .map((x) => ({ toId: str(x.toId, 80).trim(), scope: str(x.scope, 200).trim(), line: str(x.line, 400).trim(), toTitle: str(x.toTitle, 120).trim() || undefined }))
    .filter((x) => x.toId && x.scope && x.line.startsWith('Not for ') && (x.line.match(BINDING_LINE_RE) ?? [])[0] === x.line);
  const explanation = str(o.explanation, CHANGE_MAX).trim();
  return {
    requestId: str(o.requestId, 80) || undefined,
    ctx: { name, title: str(c.title, 120) || undefined, business: { name: str(b.name, 120) || undefined, city: str(b.city, 120) || undefined }, manager: str(c.manager, 60).trim() || undefined },
    // The whole role line: its binding lines are split off later and must not be cut.
    current: { instructions: str(cur.instructions, MAX_TEXT), handles: str(cur.handles, MAX_TEXT) },
    changes,
    answer: answer?.question && answer.answer ? answer : undefined,
    ...(answers.length ? { answers } : {}),
    lead: o.lead === true,
    ...(explanation ? { explanation } : {}),
    ...(teammates.length ? { teammates } : {}),
    ...(handoffList.length ? { handoffList } : {}),
    ...(o.askHome === true ? { askHome: true } : {})
  };
}

/**
 * Apply the owner's change requests to a job, or write a new one (no current
 * instructions). Sonnet on Michael's engine, stoppable. There is no rules
 * fallback: a free text change can't be applied by rules, so a failure saves
 * nothing (plan A1). The binding lines a hire wrote into "What X handles" are
 * kept out of the call and put back word for word after it (finding 1).
 */
export async function reviseWorkStyle(
  req: ReviseRequest,
  deps: ConvertDeps & { foundations?: () => string[]; onProgress?: (p: ReviseProgress) => void },
  signal?: AbortSignal
): Promise<ReviseResult> {
  const progress = (p: ReviseProgress): void => { try { deps.onProgress?.(p); } catch { /* a step never breaks the call */ } };
  progress({ stage: 'starting' });
  const bound = splitBindings(req.current.handles);
  let foundations: string[] = [];
  try { foundations = deps.foundations?.() ?? []; } catch { /* checked without them */ }
  const input: ReviseInput = {
    ctx: req.ctx,
    instructions: req.current.instructions,
    handles: bound.text,
    changes: req.changes,
    answer: req.answer,
    answers: req.answers,
    lead: req.lead,
    foundations,
    explanation: req.explanation,
    teammates: req.teammates,
    handoffList: req.handoffList,
    askHome: req.askHome
  };
  try {
    const result = await runHiddenModel(toRevisePrompt(input), {
      engine: deps.engine,
      engineModel: deps.engineModel,
      model: INSTRUCTIONS_MODEL,
      cwd: deps.cwd,
      command: deps.command,
      noTools: true,
      // The job and the saved answers stay with the app: only the owner's
      // own user settings, no hook of theirs or the office folder's sees the
      // prompt, and no transcript stays (Codex adversarial, 2026-10-23).
      settingSources: 'user',
      settingsJson: JSON.stringify({ disableAllHooks: true }),
      dropTranscript: true,
      env: deps.env,
      timeoutMs: TIMEOUT_MS,
      // No hidden thinking (owner, 2026-10-23): measured on a real change, the
      // model took 7s without it against 12 to 35s with it, and the owner waits.
      thinking: false,
      onPromptSent: () => progress({ stage: 'reading' }),
      onScreenText: (text) => progress({ stage: 'writing', preview: revisePreview(text) }),
      signal
    });
    if (result.error === 'cancelled' || signal?.aborted) return { kind: 'error', reason: 'cancelled' };
    const answer = result.ok && result.text
      ? parseRevise(result.text, req.ctx, req.lead, { askHome: req.askHome, teammates: req.teammates, handoffList: req.handoffList })
      : null;
    if (answer?.kind === 'ok') return withHandoffLines(answer, req, bound, deps.log);
    if (answer) return answer;
    deps.log?.({ kind: 'work-style-revise-failed', reason: result.ok ? 'unreadable' : (result.error ?? 'failed') });
  } catch (e) {
    deps.log?.({ kind: 'work-style-revise-failed', reason: String(e).slice(0, 200) });
  }
  return { kind: 'error', reason: 'failed' };
}

/**
 * The role line after a rewrite: the binding lines kept word for word, the
 * live handoffs the owner took back taken out, and a "Not for X; that goes to
 * Name." line for each new handoff. Written here, before the overlap check
 * runs on it, so the check and the preview both see them (eng SC1). With
 * handoffs but no new duties, the current line carries them.
 */
function withHandoffLines(
  answer: Extract<ReviseResult, { kind: 'ok' }>,
  req: ReviseRequest,
  bound: { text: string; lines: string[] },
  log?: (event: Record<string, unknown>) => void
): Extract<ReviseResult, { kind: 'ok' }> {
  const drops = answer.drops ?? [];
  const adds = answer.handoffs ?? [];
  if (!drops.length && !adds.length) {
    return answer.handles ? { ...answer, handles: bound.lines.reduce((h, l) => appendOnce(h, l), answer.handles) } : answer;
  }
  const gone = new Set(drops.flatMap((d) => (req.handoffList ?? [])
    .filter((h) => h.toId === d.toId && h.scope.toLowerCase() === d.scope.toLowerCase()).map((h) => h.line)));
  const names = new Map((req.teammates ?? []).map((m) => [m.id, m.name]));
  const lines = [
    ...bound.lines.filter((l) => !gone.has(l)),
    ...adds.flatMap((h) => { const name = names.get(h.toId); return name ? [handoffLine(h.scope, name)] : []; })
  ];
  const handles = lines.reduce((h, l) => appendOnce(h, l), answer.handles ?? bound.text);
  log?.({ kind: 'work-style-handoff-written', added: adds.length, dropped: drops.length });
  return { ...answer, handles };
}

export interface FocusCheckRequest {
  name: string;
  job: string;
  focus: string;
  workStyle: string;
  others: Array<{ job: string; focus: string }>;
  /** How the agent's email may leave, from its Sending setting (main fills it). */
  sending?: string;
}

/** The renderer's payload, trusted for nothing but short strings. */
export function readFocusCheckRequest(v: unknown): FocusCheckRequest | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = str(o.name, 60).trim();
  const focus = str(o.focus, 1000).trim();
  if (!name || !focus) return null;
  const others = Array.isArray(o.others)
    ? o.others.slice(0, 20).map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {}))
      .map((x) => ({ job: str(x.job, 120).trim(), focus: str(x.focus, 1000).trim() }))
      .filter((x) => x.job && x.focus)
    : [];
  return { name, job: str(o.job, 120).trim() || 'this job', focus, workStyle: str(o.workStyle, MAX_TEXT), others };
}

/**
 * Check a job's focus area against the Work style and the other jobs' focus
 * areas (schedule-focus-areas.md, FA3). `checked: false` when the check could
 * not run: the save goes ahead, as hiring does when the rewrite can't run.
 */
export async function checkFocusArea(req: FocusCheckRequest, deps: ConvertDeps): Promise<{ checked: boolean; conflict?: string }> {
  try {
    const result = await runHiddenModel(focusCheckPrompt(req), {
      engine: deps.engine,
      engineModel: deps.engineModel,
      model: PLAIN_MODEL,
      cwd: deps.cwd,
      command: deps.command,
      noTools: true,
      // A quick judgment, like the hire check: no extended thinking.
      thinking: false,
      env: deps.env,
      timeoutMs: TIMEOUT_MS
    });
    const verdict = result.ok && result.text ? parseFocusCheck(result.text) : null;
    if (verdict) return verdict.ok ? { checked: true } : { checked: true, conflict: verdict.conflict };
    deps.log?.({ kind: 'focus-check-skipped', reason: result.ok ? 'unreadable' : (result.error ?? 'failed') });
  } catch (e) {
    deps.log?.({ kind: 'focus-check-skipped', reason: String(e).slice(0, 200) });
  }
  return { checked: false };
}
