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
 *          ─ caseStudy:pdf   ─► savePdf()─► web page + PDF copy ─► where the owner picks
 *          ─ caseStudy:send  ─► send()   ─► web page + PDF copy ─► MailService.send
 *                                            as 'owner:case-study' ─► office log
 *
 * No Electron import: the PDF window, the image decoder and the dialogs come
 * in as deps, so the rules here test as a node module.
 */
import {
  builtInHeadline, CASE_STUDY_TO, caseStudyEmail, caseWhen, cleanEdits, draftPrompt, fontFaceCss, hasWork, heroPalette, memberFigure, mergeDrafts, missingParts, pageHtml, parseDraft,
  type CaseDraft, type CaseDraftResult, type CaseFont, type CasePrep, type CaseInput, type CaseLang, type CaseLogo, type CaseMember, type CaseOpen, type CasePeriod,
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
  missions: () => Array<{ to?: string; label?: string; enabled?: boolean; kind?: string; intervalMs?: number; weekly?: unknown; times?: unknown }>;
  /** What a member is connected to, in the page's words ("Email", "QuickBooks"),
   *  by the Access tab's rules; never an address (D28). */
  tools: (agentId: string) => string[];
  figures: (r: DayRange) => { snapshot: PulseSnapshot; days: Array<{ day: string; ms: number; awayMs: number }> } | null;
  runModel: (prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** The kept logo and its colour, from the office's private folder. */
  readLogo: () => { png: Buffer; colour: string | null } | null;
  writeLogo: (png: Buffer, colour: string | null) => void;
  fetchLogo: (site: string | undefined) => Promise<LogoResult>;
  decodeLogo: (bytes: Buffer) => { png: Buffer; colour: string | null } | null;
  /** Draws an SVG logo to PNG bytes. */
  drawSvg?: (svg: Buffer) => Promise<Buffer | null>;
  readFile: (path: string, maxBytes: number) => Buffer | null;
  /** Renders the page in a hidden window, across as many pages as it needs. */
  makePdf: (html: string, paper: Paper) => Promise<{ ok: true; pdf: Buffer } | { ok: false; reason: 'failed' }>;
  mailSend: (mailbox: string, input: { to: string; subject: string; body: string; files: Array<{ filename: string; content: Buffer; contentType: string }> }) => Promise<{ sent: boolean }>;
  senders: () => Array<{ id: string; address: string; canSend: boolean; reason?: string }>;
  log: (entry: Record<string, unknown>) => void;
  inviteDone: () => void;
  fonts: () => CaseFont[];
  paper: () => Paper;
  appVersion: string;
  /** The open office, so a case study prepared for one never opens in another. */
  office: () => string | null;
  /** A prepared case study is ready: main tells the screen, and the desktop
   *  when the window is in the background. */
  onReady: () => void;
  /** Whether a prepared case study waits for the owner changed (Ask me). */
  onWaitingChange?: () => void;
  now?: () => number;
}


/**
 * Where Save writes the PDF and the web page beside it (ship review): the PDF
 * goes exactly where the save dialog confirmed, and the page takes the same
 * name ending in .html. Saving over an earlier pair (the dialog asked about
 * its PDF) replaces its page too; a page with that name but no PDF beside it
 * is someone else's file, so the page takes a numbered name instead.
 */
export function savePaths(picked: string, exists: (path: string) => boolean, now: () => number = Date.now): { pdf: string; html: string } {
  const base = picked.replace(/\.pdf$/i, '');
  const pair = `${base}.html`;
  if (!exists(pair) || exists(picked)) return { pdf: picked, html: pair };
  for (let n = 2; n < 1000; n++) {
    const html = `${base} (${n}).html`;
    if (!exists(html)) return { pdf: picked, html };
  }
  return { pdf: picked, html: `${base} ${now()}.html` };
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
  /** At most one case study is prepared at a time; a new office, period,
   *  language or name choice starts over. */
  private prep: { key: string; office: string | null; input: CaseInput; state: 'preparing' | 'ready'; draft: CaseDraft | null; logo: CaseLogo | null; hasWork: boolean; waiting?: boolean } | null = null;
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
    // Members turned off are left out, as the floor hides them; Michael first.
    const team = this.d.roster().filter((a) => !a.isAssistant && !a.closedByOwner)
      .sort((a, b) => Number(!!b.isGod) - Number(!!a.isGod));
    const godId = team.find((a) => a.isGod)?.id;
    // Each member's running jobs (the owner's own, never heartbeats or
    // compaction); Michael's say 'god' (shared/missions ownerOf).
    const jobs = new Map<string, Array<{ label: string; when: string }>>();
    for (const m of this.d.missions()) {
      if (!m.to || !m.label?.trim() || m.enabled === false || (m.kind ?? 'dispatch') !== 'dispatch') continue;
      const owner = (m.to === 'god' || m.to === 'broadcast') && godId ? godId : m.to;
      jobs.set(owner, [...(jobs.get(owner) ?? []), { label: m.label.trim(), when: caseWhen({ intervalMs: m.intervalMs ?? 0, weekly: m.weekly, times: m.times }, input.lang) }]);
    }
    const members: CaseMember[] = team.map((a) => {
      const { role, roleDescription } = splitAgentRole(a.role);
      const c = counts.get(a.id);
      const figure = a.isGod
        ? memberFigure({ email: 0, sent: 0, task: 0, check: 0 }, s.michael?.routed ?? 0)
        : memberFigure({ email: c?.counts.email ?? 0, sent: c?.counts.sent ?? 0, task: c?.counts.task ?? 0, check: (c?.counts.check ?? 0) + (c?.checksNothing ?? 0) }, null);
      const mine = jobs.get(a.id) ?? [];
      return { id: a.id, name: a.name, role, ...(roleDescription ? { roleDescription } : {}), jobs: mine.map((j) => j.label), schedules: mine, tools: this.d.tools(a.id), figure, isMichael: !!a.isGod };
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
    // The owner is looking at it: Michael's ready card leaves Ask me.
    this.seen();
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
    // A retried draft becomes the one main holds, so the headline it offers is
    // the one main prints (D24).
    if (this.prep?.key === this.keyOf(input) && this.prep.state === 'ready') this.prep.draft = out;
    return { ok: true, draft: out };
  }

  /**
   * Prepares a case study in the background (owner, 2026-11-03): the draft and
   * the logo read run here while the owner works on, and onReady fires when
   * both are done, so the screen opens complete. A period with no work needs
   * no draft and is ready at once (D19). Asking again for the same case study
   * returns where it stands.
   */
  prepare(input: CaseInput): CasePrep {
    const office = this.d.office();
    const key = this.keyOf(input);
    if (this.prep?.key === key) return this.status();
    const facts = this.facts(input);
    const work = !!facts && hasWork(facts.figures);
    const job = { key, office, input, state: 'preparing' as 'preparing' | 'ready', draft: null as CaseDraft | null, logo: null as CaseLogo | null, hasWork: work, waiting: false };
    const waited = !!this.prep?.waiting;
    this.prep = job;
    // A new one replaces the one that waited on Ask me.
    if (waited) this.d.onWaitingChange?.();
    if (!work) { job.state = 'ready'; return this.status(); }
    void (async () => {
      const [d, l] = await Promise.all([
        this.draft(input).catch((): CaseDraftResult => ({ ok: false, reason: 'failed' })),
        input.showName ? this.logo(false).catch((): CaseLogo => ({ ok: false, reason: 'failed' })) : Promise.resolve(null)
      ]);
      if (this.prep !== job) return;
      job.draft = d.ok ? d.draft : null;
      job.logo = l;
      job.state = 'ready';
      // It waits on Ask me until the owner opens it or chooses Later.
      job.waiting = true;
      this.d.onReady();
      this.d.onWaitingChange?.();
    })();
    return this.status();
  }

  private keyOf(input: CaseInput): string {
    return JSON.stringify([this.d.office(), input.lang, input.period, input.showName]);
  }

  /** The draft main holds for this case study, if any (prepared or retried). */
  private heldDraft(input: CaseInput): CaseDraft | null {
    return this.prep?.key === this.keyOf(input) ? this.prep.draft : null;
  }

  /** Where the prepared case study stands, for the open office only. */
  status(): CasePrep {
    const p = this.prep;
    if (!p || p.office !== this.d.office()) return { state: 'idle' };
    if (p.state === 'preparing') return { state: 'preparing', input: p.input };
    return { state: 'ready', input: p.input, draft: p.draft, logo: p.logo, hasWork: p.hasWork, ...(p.waiting ? { waiting: true } : {}) };
  }

  /** The prepared case study no longer waits on Ask me: the owner opened it,
   *  chose Later, or had the screen open when it got ready. */
  seen(): void {
    if (!this.prep?.waiting) return;
    this.prep.waiting = false;
    this.d.onWaitingChange?.();
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

  /** A logo the owner picked: PNG, JPEG, WebP or SVG, decoded and kept (D3). */
  async pickedLogo(path: string): Promise<{ ok: true; logo: string; palette: HeroPalette } | { ok: false; reason: 'not-image' }> {
    const bytes = this.d.readFile(path, PICKED_LOGO_MAX_BYTES);
    const isSvg = !!bytes && /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(bytes.toString('utf8', 0, 2048));
    const png = bytes && isSvg && this.d.drawSvg ? await this.d.drawSvg(bytes).catch(() => null) : bytes;
    const done = png ? this.d.decodeLogo(png) : null;
    if (!done) return { ok: false, reason: 'not-image' };
    this.d.writeLogo(done.png, done.colour);
    return { ok: true, logo: toDataUrl(done.png), palette: heroPalette(done.colour) };
  }

  /** The page from the owner's edits, checked the way Send checks them: the
   *  web page we publish, standalone with its fonts, and its PDF copy (D28). */
  async pdf(input: CaseInput, rawEdits: unknown): Promise<{ ok: true; pdf: Buffer; html: Buffer; facts: CaseStudyFacts } | { ok: false; kind: 'headline-number' | 'no-work' | 'failed' }> {
    const facts = this.facts(input);
    if (!facts || !hasWork(facts.figures)) return { ok: false, kind: 'no-work' };
    const { edits: typed, headlineNumber } = cleanEdits(facts, rawEdits);
    if (headlineNumber) return { ok: false, kind: 'headline-number' };
    // The headline is one of the drafted choices only (D24): main takes the
    // figure the owner picked and fills in its words itself, from the draft it
    // holds or the built in ones, so no words from the screen sit beside the
    // number.
    const held = this.heldDraft(input);
    const edits = typed.headline
      ? { ...typed, headline: { figure: typed.headline.figure, ...(held?.headlines[typed.headline.figure] ?? builtInHeadline(facts, typed.headline.figure)) } }
      : typed;
    const fontCss = fontFaceCss(this.d.fonts());
    // The owner's brand colour, when picked, over the logo's (never with the name hidden, D8).
    const branded = facts.showName && edits.brand ? { ...facts, palette: heroPalette(edits.brand) } : facts;
    const out = await this.d.makePdf(pageHtml(branded, edits, { fontCss, mode: 'print' }), facts.paper).catch(() => ({ ok: false as const, reason: 'failed' as const }));
    this.d.log({ kind: 'case-study-pdf', ok: out.ok });
    return out.ok ? { ok: true, pdf: out.pdf, html: Buffer.from(pageHtml(branded, edits, { fontCss }), 'utf8'), facts } : { ok: false, kind: out.reason };
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
      await this.d.mailSend(box.id, { to: CASE_STUDY_TO, subject: mail.subject, body: mail.body, files: [
        { filename: 'case-study.html', content: page.html, contentType: 'text/html' },
        { filename: 'case-study.pdf', content: page.pdf, contentType: 'application/pdf' }
      ] });
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
    // Sent: the next Get featured prepares a fresh one.
    const waited = !!this.prep?.waiting;
    this.prep = null;
    if (waited) this.d.onWaitingChange?.();
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
