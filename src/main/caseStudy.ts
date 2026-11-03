/**
 * The case study service (docs/designs/case-study.md): gathers the office's
 * facts, drafts the words, reads the logo, makes the PDF and sends it as the
 * owner's own action. Main builds the page and the PDF itself and fixes the
 * recipient (outside voice O4): the screen hands over only the edited text,
 * the toggles, the period and the chosen mailbox.
 *
 *   screen ─ caseStudy:open  ─► open()   ─► facts + fonts + mailboxes
 *          ─ caseStudy:draft ─► draft()  ─► one hidden model call, a second
 *                                            for parts the first left out
 *          ─ caseStudy:logo  ─► logo()   ─► kept logo, or a read of the site
 *          ─ caseStudy:pdf   ─► savePdf()─► page ─► PDF ─► where the owner picks
 *          ─ caseStudy:send  ─► send()   ─► page ─► PDF ─► MailService.send
 *                                            as 'owner:case-study' ─► office log
 *
 * No Electron import: the PDF window, the image decoder and the dialogs come
 * in as deps, so the rules here test as a node module.
 */
import {
  CASE_STUDY_TO, caseStudyEmail, cleanEdits, draftPrompt, fontFaceCss, hasWork, heroPalette, memberFigure, mergeDrafts, missingParts, pageHtml, parseDraft,
  type CaseDraft, type CaseDraftResult, type CaseFont, type CaseInput, type CaseLang, type CaseLogo, type CaseMember, type CaseOpen, type CasePeriod,
  type CaseSendOutcome, type CaseStudyFacts, type HeroPalette, type Paper
} from '../shared/caseStudy';
import { dayKey, type DayRange, type PulseSnapshot } from '../shared/teamPerformance';
import { splitAgentRole } from '../shared/agentRole';
import type { CompanyProfile } from '../shared/companyProfile';
import { MailError } from './mail';
import type { LogoResult } from './siteLogo';

export const CASE_PERIODS: readonly CasePeriod[] = ['last-30', 'this-month'];
export const CASE_LANGS: readonly CaseLang[] = ['en', 'ar', 'zh-CN'];
/** The screen's draft gives up after this long (eng C4). */
export const CASE_DRAFT_TIMEOUT_MS = 60_000;
/** A picked logo file is read up to this size. */
export const PICKED_LOGO_MAX_BYTES = 5_000_000;

export interface CaseStudyDeps {
  config: () => { businessName?: string; businessCity?: string; businessType?: string; companyProfile?: CompanyProfile };
  /** The pack's display name for a business type id. */
  typeName: (businessType: string | undefined) => string | undefined;
  /** The foundations offer answer; never the customers answer. */
  offer: () => string | undefined;
  roster: () => Array<{ id: string; name: string; role?: string; isGod?: boolean; isAssistant?: boolean; closedByOwner?: boolean }>;
  missions: () => Array<{ to?: string; label?: string; enabled?: boolean }>;
  figures: (r: DayRange) => { snapshot: PulseSnapshot; days: Array<{ day: string; ms: number; awayMs: number }> } | null;
  runModel: (prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** The kept logo and its colour, from the office's private folder. */
  readLogo: () => { png: Buffer; colour: string | null } | null;
  writeLogo: (png: Buffer, colour: string | null) => void;
  fetchLogo: (site: string | undefined) => Promise<LogoResult>;
  decodeLogo: (bytes: Buffer) => { png: Buffer; colour: string | null } | null;
  readFile: (path: string, maxBytes: number) => Buffer | null;
  /** Renders the page in a hidden window: null when it ran past one page. */
  makePdf: (html: string, paper: Paper) => Promise<{ ok: true; pdf: Buffer } | { ok: false; reason: 'overflow' | 'failed' }>;
  mailSend: (mailbox: string, input: { to: string; subject: string; body: string; files: Array<{ filename: string; content: Buffer; contentType: string }> }) => Promise<{ sent: boolean }>;
  senders: () => Array<{ id: string; address: string; canSend: boolean; reason?: string }>;
  log: (entry: Record<string, unknown>) => void;
  inviteDone: () => void;
  fonts: () => CaseFont[];
  paper: () => Paper;
  appVersion: string;
  now?: () => number;
}


/** The screen's input from IPC, or null when it isn't one. */
export function caseInput(v: unknown): CaseInput | null {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const lang = (CASE_LANGS as readonly unknown[]).includes(r.lang) ? r.lang as CaseLang : null;
  const period = (CASE_PERIODS as readonly unknown[]).includes(r.period) ? r.period as CasePeriod : null;
  return lang && period ? { lang, period, showName: r.showName !== false } : null;
}

/** The period's local days: the last 30 up to today, or this month so far. */
export function caseRange(period: CasePeriod, now: number): DayRange {
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  const start = period === 'this-month' ? new Date(end.getFullYear(), end.getMonth(), 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  const toMs = new Date(end); toMs.setHours(23, 59, 59, 999);
  return { from: dayKey(start.getTime()), to: dayKey(end.getTime()), fromMs: start.getTime(), toMs: toMs.getTime() };
}

const toDataUrl = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`;

export class CaseStudyService {
  constructor(private readonly d: CaseStudyDeps) {}
  private now(): number { return this.d.now ? this.d.now() : Date.now(); }

  /** Every fact the page and the prompt may use (red flag 8). */
  facts(input: CaseInput): CaseStudyFacts | null {
    const range = caseRange(input.period, this.now());
    const fig = this.d.figures(range);
    if (!fig) return null;
    const s = fig.snapshot;
    const cfg = this.d.config();
    const p = cfg.companyProfile ?? {};
    const total = (k: 'email' | 'sent' | 'task' | 'check'): number => s.outcomes.find((o) => o.kind === k)?.total ?? 0;
    const counts = new Map(s.members.map((m) => [m.agentId, m]));
    const jobs = new Map<string, string[]>();
    for (const m of this.d.missions()) {
      if (!m.to || !m.label || m.enabled === false) continue;
      jobs.set(m.to, [...(jobs.get(m.to) ?? []), m.label]);
    }
    // Members turned off are left out, as the floor hides them; Michael first.
    const team = this.d.roster().filter((a) => !a.isAssistant && !a.closedByOwner)
      .sort((a, b) => Number(!!b.isGod) - Number(!!a.isGod));
    const members: CaseMember[] = team.map((a) => {
      const { role, roleDescription } = splitAgentRole(a.role);
      const c = counts.get(a.id);
      const figure = a.isGod
        ? memberFigure({ email: 0, sent: 0, task: 0, check: 0 }, s.michael?.routed ?? 0)
        : memberFigure({ email: c?.counts.email ?? 0, sent: c?.counts.sent ?? 0, task: c?.counts.task ?? 0, check: (c?.counts.check ?? 0) + (c?.checksNothing ?? 0) }, null);
      return { id: a.id, name: a.name, role, ...(roleDescription ? { roleDescription } : {}), jobs: jobs.get(a.id) ?? [], figure, isMichael: !!a.isGod };
    });
    const kept = input.showName ? this.d.readLogo() : null;
    const ran = s.running ?? { ms: 0, awayMs: 0 };
    return {
      lang: input.lang,
      paper: this.d.paper(),
      showName: input.showName,
      businessName: cfg.businessName,
      website: p.website,
      businessType: p.industry || this.d.typeName(cfg.businessType),
      city: cfg.businessCity || p.address?.city,
      industry: p.industry,
      serviceArea: p.serviceArea,
      hours: p.hours,
      languages: p.languages,
      offer: this.d.offer(),
      ceoName: p.ceo,
      members,
      figures: { email: total('email'), sent: total('sent'), task: total('task'), check: total('check'), routed: s.michael?.routed ?? 0, ranMs: ran.ms, awayMs: ran.awayMs, spendUsd: s.totalUsd },
      days: fig.days,
      range: { from: range.from, to: range.to, days: fig.days.length },
      appVersion: this.d.appVersion,
      ...(kept ? { logo: toDataUrl(kept.png), palette: heroPalette(kept.colour) } : {})
    };
  }

  open(input: CaseInput): CaseOpen | null {
    const facts = this.facts(input);
    if (!facts) return null;
    return { facts, fonts: this.d.fonts(), senders: this.d.senders(), hasWork: hasWork(facts.figures), to: CASE_STUDY_TO };
  }

  /** The drafted words (D5): one call, a second for the parts the first left
   *  out, then whatever is still missing opens empty with Retry. None at all
   *  when the period has no work (D19, EP-O7). */
  async draft(input: CaseInput): Promise<CaseDraftResult> {
    const facts = this.facts(input);
    if (!facts || !hasWork(facts.figures)) return { ok: false, reason: 'no-work' };
    const prompt = draftPrompt(facts);
    const once = async (): Promise<CaseDraft | null> => {
      const r = await this.d.runModel(prompt).catch(() => null);
      return r?.ok && r.text ? parseDraft(r.text, facts) : null;
    };
    const first = await once();
    if (!first) { this.d.log({ kind: 'case-study-draft', ok: false }); return { ok: false, reason: 'failed' }; }
    const out = missingParts(first, facts).length ? mergeDrafts(first, (await once()) ?? { headlines: {}, team: {} }) : first;
    this.d.log({ kind: 'case-study-draft', ok: true, missing: missingParts(out, facts).length });
    return { ok: true, draft: out };
  }

  /** The kept logo, or one read from the site; `fresh` reads the site again. */
  async logo(fresh: boolean): Promise<CaseLogo> {
    if (!fresh) {
      const kept = this.d.readLogo();
      if (kept) return { ok: true, logo: toDataUrl(kept.png), palette: heroPalette(kept.colour) };
    }
    const r = await this.d.fetchLogo(this.d.config().companyProfile?.website);
    this.d.log({ kind: 'case-study-logo', ok: r.ok, ...(r.ok ? {} : { reason: r.reason }) });
    if (!r.ok) return { ok: false, reason: r.reason };
    this.d.writeLogo(r.png, r.colour);
    return { ok: true, logo: toDataUrl(r.png), palette: heroPalette(r.colour) };
  }

  /** A logo the owner picked: PNG, JPEG or WebP, decoded and kept (D3). */
  pickedLogo(path: string): { ok: true; logo: string; palette: HeroPalette } | { ok: false; reason: 'not-image' } {
    const bytes = this.d.readFile(path, PICKED_LOGO_MAX_BYTES);
    const done = bytes ? this.d.decodeLogo(bytes) : null;
    if (!done) return { ok: false, reason: 'not-image' };
    this.d.writeLogo(done.png, done.colour);
    return { ok: true, logo: toDataUrl(done.png), palette: heroPalette(done.colour) };
  }

  /** The page as a PDF from the owner's edits, checked the way Send checks them. */
  async pdf(input: CaseInput, rawEdits: unknown): Promise<{ ok: true; pdf: Buffer; facts: CaseStudyFacts } | { ok: false; kind: 'overflow' | 'headline-number' | 'no-work' | 'failed' }> {
    const facts = this.facts(input);
    if (!facts || !hasWork(facts.figures)) return { ok: false, kind: 'no-work' };
    const { edits, headlineNumber } = cleanEdits(facts, rawEdits);
    if (headlineNumber) return { ok: false, kind: 'headline-number' };
    const out = await this.d.makePdf(pageHtml(facts, edits, { editable: false, fontCss: fontFaceCss(this.d.fonts()) }), facts.paper).catch(() => ({ ok: false as const, reason: 'failed' as const }));
    this.d.log({ kind: 'case-study-pdf', ok: out.ok });
    return out.ok ? { ok: true, pdf: out.pdf, facts } : { ok: false, kind: out.reason };
  }

  /**
   * Sends the page to us as the owner's own action (D1, D9): from the chosen
   * mailbox, to the fixed address, with the publish permission ticked. Not a
   * member's send: it never counts in Pulse, and the office log gets its own
   * kind (eng A2). A timeout or an interrupted earlier send may have gone out,
   * and says so in the screen's words, never the mail text that names Michael.
   */
  async send(input: CaseInput, rawEdits: unknown, mailbox: unknown, permission: unknown): Promise<CaseSendOutcome> {
    if (permission !== true) return { ok: false, kind: 'no-permission' };
    const box = this.d.senders().find((s) => s.id === mailbox && s.canSend);
    if (!box) return { ok: false, kind: 'no-mailbox' };
    const page = await this.pdf(input, rawEdits);
    if (!page.ok) return page.kind === 'failed' ? { ok: false, kind: 'failed', reason: '' } : { ok: false, kind: page.kind };
    const mail = caseStudyEmail(page.facts);
    try {
      await this.d.mailSend(box.id, { to: CASE_STUDY_TO, subject: mail.subject, body: mail.body, files: [{ filename: 'case-study.pdf', content: page.pdf, contentType: 'application/pdf' }] });
    } catch (e) {
      if (e instanceof MailError && (e.uncertain || e.interrupted)) {
        this.d.log({ kind: 'case-study-send', ok: false, maybe: true });
        return { ok: false, kind: 'maybe-sent' };
      }
      this.d.log({ kind: 'case-study-send', ok: false });
      return { ok: false, kind: 'failed', reason: e instanceof Error ? e.message.replace(/^Not sent\.\s*/, '') : '' };
    }
    // The owner's own line in the office log; never 'mail-sent', which Pulse
    // counts as a member's work (index.ts logObserver, pulseBackfill.ts).
    this.d.log({ kind: 'case-study-sent', mailbox: box.id, to: CASE_STUDY_TO, text: "You sent a case study to Don't Be Michael" });
    this.d.inviteDone();
    return { ok: true };
  }

  /** The mail app fallback with no mailbox (D1): our address, the subject and
   *  the permission line; the owner attaches the saved file. */
  mailto(input: CaseInput): string | null {
    const facts = this.facts(input);
    if (!facts) return null;
    const mail = caseStudyEmail(facts);
    const full = `mailto:${CASE_STUDY_TO}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
    // Mail apps refuse very long links: the subject alone rather than a cut body.
    return full.length <= 2000 ? full : `mailto:${CASE_STUDY_TO}?subject=${encodeURIComponent(mail.subject)}`;
  }
}
