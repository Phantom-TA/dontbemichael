/**
 * The case study screen (docs/designs/case-study.md; mockup approved in the
 * design review, D15 to D19): the page as it prints on the left, drawn from
 * the same pageHtml main prints, with its drafted parts editable in place;
 * the headline choice, period, name switch, mailbox, permission and Send on
 * the right. Main builds the page and the PDF itself: this screen sends only
 * the edited text, the toggles, the period and the chosen mailbox.
 *
 *   open ─► caseStudyOpen ─► facts ─┬─► caseStudyDraft ─► edits (drafting ─► ready | failed)
 *                                   └─► caseStudyLogo  ─► logo and colour (or Pick your logo)
 *   Send ─► caseStudySend ─► sent | failed (reason) | maybe sent       (Close is off meanwhile)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  builtInHeadline, figureValue, fmtCount, headlineChoices, namesBusiness, pageHtml, startingEdits,
  type CaseDraft, type CaseInput, type CaseLang, type CaseOpen, type CasePeriod, type CaseStudyEdits, type HeadlineFigure, type HeroPalette
} from '@shared/caseStudy';
import { Dialog } from '@/shell/Dialog';
import { Panel, hint } from '../fieldText';
import { InfoTip } from '../InfoTip';
import { PixelButton } from '../PixelButton';
import { Toggle } from '../triggers/ui';
import { APP_NAME } from '@shared/appName';

const PERIODS: CasePeriod[] = ['last-30', 'this-month'];
/** The page at 96 px per inch. */
const PAGE_PX = { letter: { w: 816, h: 1056 }, a4: { w: 794, h: 1123 } } as const;

type Draft = { state: 'drafting' } | { state: 'ready'; draft: CaseDraft } | { state: 'failed' };
type Send = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'maybe' } | { state: 'error'; text: string };

function langOf(code: string): CaseLang {
  return code.startsWith('zh') ? 'zh-CN' : code.startsWith('ar') ? 'ar' : 'en';
}

/** The page's editable parts, read back from the preview's document. */
function readEdits(doc: Document, base: CaseStudyEdits): CaseStudyEdits {
  const text = (part: string): string | null => {
    const el = doc.querySelector(`[data-part="${CSS.escape(part)}"]`);
    return el ? (el.textContent ?? '') : null;
  };
  const team: Record<string, string> = { ...base.team };
  for (const id of Object.keys(team)) { const v = text(`team:${id}`); if (v !== null) team[id] = v; }
  return {
    headline: base.headline ? { ...base.headline, before: text('headline-before') ?? base.headline.before, after: text('headline-after') ?? base.headline.after } : null,
    subtitle: text('subtitle') ?? base.subtitle,
    about: text('about') ?? base.about,
    quote: text('quote') ?? base.quote,
    team,
    why: text('why') ?? base.why
  };
}

export function CaseStudyScreen({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const [period, setPeriod] = useState<CasePeriod>('last-30');
  const [showName, setShowName] = useState(true);
  const input: CaseInput = useMemo(() => ({ lang, period, showName }), [lang, period, showName]);
  const [open, setOpen] = useState<CaseOpen | null | 'failed'>(null);
  const [draft, setDraft] = useState<Draft>({ state: 'drafting' });
  const [edits, setEdits] = useState<CaseStudyEdits | null>(null);
  const editsRef = useRef<CaseStudyEdits | null>(null);
  const [touched, setTouched] = useState(false);
  const [logo, setLogo] = useState<{ logo: string; palette: HeroPalette } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [permission, setPermission] = useState(false);
  const [send, setSend] = useState<Send>({ state: 'idle' });
  const [overflow, setOverflow] = useState(false);
  const [askRedraft, setAskRedraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>('');
  const frame = useRef<HTMLIFrameElement | null>(null);
  const well = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.7);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The facts, then the draft (none with no work: D19) and the kept or read logo.
  const loadDraft = useCallback(async (inp: CaseInput, facts: CaseOpen) => {
    setDraft({ state: 'drafting' });
    const r = await window.cth.caseStudyDraft(inp).catch(() => null);
    if (!alive.current) return;
    const d: CaseDraft = r?.ok ? r.draft : { headlines: {}, team: {} };
    setDraft(r?.ok ? { state: 'ready', draft: d } : { state: 'failed' });
    const e = startingEdits(facts.facts, d, editsRef.current?.headline?.figure);
    editsRef.current = e; setEdits(e); setTouched(false);
  }, []);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const o = await window.cth.caseStudyOpen(input).catch(() => null);
      if (stop || !alive.current) return;
      if (!o) { setOpen('failed'); return; }
      setOpen(o);
      setMailbox((m) => m ?? o.senders.find((s) => s.canSend)?.id ?? null);
      if (o.hasWork && (!editsRef.current || !touched)) void loadDraft(input, o);
      else if (!o.hasWork) { editsRef.current = null; setEdits(null); }
    })();
    return () => { stop = true; };
    // The draft is redrafted on a period or name change only when the owner
    // hasn't edited yet; with edits, the name switch asks first.
  }, [input, loadDraft]);

  useEffect(() => {
    if (!showName) return;
    let stop = false;
    void window.cth.caseStudyLogo(false).then((r) => {
      if (stop) return;
      if (r.ok) { setLogo({ logo: r.logo, palette: r.palette }); setLogoFailed(false); } else setLogoFailed(true);
    }).catch(() => { if (!stop) setLogoFailed(true); });
    return () => { stop = true; };
  }, [showName]);

  const facts = open && open !== 'failed' ? { ...open.facts, ...(logo && showName ? { logo: logo.logo, palette: logo.palette } : {}) } : null;
  const paper = facts ? PAGE_PX[facts.paper] : PAGE_PX.letter;
  const choices = facts ? headlineChoices(facts.figures) : [];

  // The preview is redrawn only when its structure changes; typing stays in
  // the iframe and is read back on each input.
  const html = useMemo(() => (facts && edits ? pageHtml(facts, editsRef.current ?? edits, { editable: true, fontCss: '' }) : ''),
    [open, logo, showName, draft, edits?.headline?.figure]);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const body = doc?.querySelector('.body') as HTMLElement | null;
    setOverflow(!!body && body.scrollHeight > body.clientHeight + 1);
  }, []);

  const onFrameLoad = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow as (Window & { FontFace: typeof FontFace }) | null;
    if (!doc) return;
    // The page's faces as bytes: FontFace from bytes isn't a font fetch, so the
    // app's font-src 'self' stays as it is, and the preview measures with the
    // same fonts as the PDF.
    if (win && open && open !== 'failed') {
      const loads = open.fonts.map((f) => {
        try {
          const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
          const face = new win.FontFace(f.family, bytes, { weight: f.weight });
          doc.fonts.add(face);
          return face.load().catch(() => face);
        } catch { return Promise.resolve(null); }
      });
      void Promise.all(loads).then(() => measure());
    }
    doc.addEventListener('input', () => {
      if (!editsRef.current) return;
      editsRef.current = readEdits(doc, editsRef.current);
      setTouched(true);
      setSend((s) => (s.state === 'error' ? { state: 'idle' } : s));
      measure();
    });
    // Plain text only, on one line, as main keeps it.
    doc.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') e.preventDefault(); });
    measure();
  }, [measure, open]);

  // The page scaled to the room the well has.
  useEffect(() => {
    const el = well.current;
    if (!el) return;
    const fit = (): void => { const r = el.getBoundingClientRect(); setScale(Math.max(0.3, Math.min(1, (r.height - 48) / paper.h, (r.width - 48) / paper.w))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paper.h, paper.w]);

  const pickFigure = (k: HeadlineFigure): void => {
    if (!facts || !editsRef.current) return;
    const d = draft.state === 'ready' ? draft.draft : { headlines: {}, team: {} };
    const e = { ...editsRef.current, headline: { figure: k, ...(d.headlines[k] ?? builtInHeadline(facts, k)) } };
    editsRef.current = e; setEdits(e);
  };

  const flipName = (): void => {
    if (touched) { setAskRedraft(true); return; }
    setShowName((v) => !v);
  };

  const current = editsRef.current;
  const nameWarn = !!facts && !showName && !!current && [current.subtitle, current.about, current.quote, current.why, current.headline?.before ?? '', current.headline?.after ?? '', ...Object.values(current.team)]
    .some((x) => namesBusiness(x, { businessName: open && open !== 'failed' ? open.facts.businessName : undefined, website: open && open !== 'failed' ? open.facts.website : undefined }));

  const senders = open && open !== 'failed' ? open.senders : [];
  const anySender = senders.some((s) => s.canSend);
  const busy = send.state === 'sending' || saving;
  const ready = !!facts && !!current && (open as CaseOpen).hasWork && draft.state !== 'drafting' && !overflow;

  const doSend = async (): Promise<void> => {
    if (!mailbox || !current) return;
    setSend({ state: 'sending' });
    const r = await window.cth.caseStudySend(input, current, mailbox, permission).catch(() => null);
    if (!alive.current) return;
    if (!r) { setSend({ state: 'error', text: t('caseStudy.failedNoReason') }); return; }
    if (r.ok) { setSend({ state: 'sent' }); return; }
    if (r.kind === 'maybe-sent') setSend({ state: 'maybe' });
    else if (r.kind === 'overflow') { setOverflow(true); setSend({ state: 'idle' }); }
    else if (r.kind === 'headline-number') setSend({ state: 'error', text: t('caseStudy.headlineNumber') });
    else if (r.kind === 'failed' && r.reason) setSend({ state: 'error', text: t('caseStudy.failed', { reason: r.reason }) });
    else setSend({ state: 'error', text: t('caseStudy.failedNoReason') });
  };

  const doSave = async (openMailApp: boolean): Promise<void> => {
    if (!current) return;
    setSaving(true); setSaved('');
    const r = await window.cth.caseStudySavePdf(input, current, openMailApp).catch(() => null);
    if (!alive.current) return;
    setSaving(false);
    if (r?.ok) setSaved(t('caseStudy.saved'));
    else if (r?.kind === 'headline-number') setSaved(t('caseStudy.headlineNumber'));
    else if (r?.kind === 'overflow') setOverflow(true);
    else if (r?.kind !== 'cancelled') setSaved(t('caseStudy.pdfFailed'));
  };

  const changeLogo = async (fresh: boolean): Promise<void> => {
    const r = fresh ? await window.cth.caseStudyLogo(true) : await window.cth.caseStudyPickLogo();
    if (r.ok) { setLogo({ logo: r.logo, palette: r.palette }); setLogoFailed(false); } else if (r.reason !== 'cancelled') setLogoFailed(true);
  };

  const status: CSSProperties = { fontSize: 12, lineHeight: '17px' };
  const empty = open && open !== 'failed' && !open.hasWork;

  return (
    <Dialog title={t('caseStudy.title')} onClose={onClose} busy={busy} fill width={1120} label={t('caseStudy.title')}
      actions={<InfoTip text={t('caseStudy.info')} />} bodyStyle={{ padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 330px', minHeight: 0, flex: 1 }}>
      <div ref={well} style={{ background: 'var(--cth-floor)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 24 }}>
        {open === null && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loading')}</div>}
        {open === 'failed' && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loadFailed')}</div>}
        {empty && (
          <div style={{ marginTop: 80, maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{period === 'this-month' ? t('caseStudy.noWorkMonth') : t('caseStudy.noWork')}</div>
            <div style={hint}>{t('caseStudy.noWorkAny')}</div>
          </div>
        )}
        {!empty && html && (
          <div style={{ width: paper.w * scale, height: paper.h * scale, flex: 'none', boxShadow: '0 2px 10px rgba(30,27,46,.16)', background: '#fff' }}>
            <iframe ref={frame} title={t('caseStudy.pageLabel')} srcDoc={html} sandbox="allow-same-origin" onLoad={onFrameLoad}
              style={{ width: paper.w, height: paper.h, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block' }} />
          </div>
        )}
      </div>

      <div style={{ borderInlineStart: '1px solid var(--cth-line)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        {facts && choices.length > 0 && (
          <Panel title={t('caseStudy.headline')} info={t('caseStudy.headlineTip')}>
            <div role="radiogroup" aria-label={t('caseStudy.headline')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {choices.map((k) => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: '17px', cursor: 'pointer' }}>
                  <input type="radio" name="cs-headline" checked={edits?.headline?.figure === k} onChange={() => pickFigure(k)} />
                  <span>{t(`caseStudy.figure.${k}`, { n: fmtCount(figureValue(facts.figures, k)) })}</span>
                </label>
              ))}
            </div>
          </Panel>
        )}

        <Panel>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
            {t('caseStudy.period')}
            <select className="cth-input" value={period} onChange={(e) => setPeriod(e.target.value as CasePeriod)} style={{ height: 32 }}>
              {PERIODS.map((p) => <option key={p} value={p}>{t(`caseStudy.periods.${p}`)}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Toggle on={showName} onClick={flipName} label={t('caseStudy.showName')} />
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t('caseStudy.showName')}</span>
            <InfoTip text={t('caseStudy.showNameTip')} align="end" />
          </div>
          {askRedraft && (
            <div role="alert" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={status}>{t('caseStudy.redraftAsk')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <PixelButton size="sm" onClick={() => { setAskRedraft(false); setTouched(false); setShowName((v) => !v); }}>{t('caseStudy.replace')}</PixelButton>
                <PixelButton size="sm" variant="secondary" onClick={() => { setAskRedraft(false); setShowName((v) => !v); }}>{t('caseStudy.keep')}</PixelButton>
              </div>
            </div>
          )}
          {nameWarn && <div style={{ ...status, marginTop: 8, color: 'var(--cth-amber-text)' }}>{t('caseStudy.nameWarn')}</div>}
          {showName && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <PixelButton size="sm" variant="secondary" onClick={() => void changeLogo(false)}>{logoFailed ? t('caseStudy.logoPick') : t('caseStudy.logoChange')}</PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => void changeLogo(true)}>{t('caseStudy.logoReadAgain')}</PixelButton>
            </div>
          )}
          {showName && logoFailed && <div style={{ ...hint, marginTop: 6 }}>{t('caseStudy.logoFailed')}</div>}
        </Panel>

        {draft.state === 'drafting' && !empty && <div style={hint} aria-live="polite">{t('caseStudy.drafting')}</div>}
        {draft.state === 'failed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={status}>{t('caseStudy.draftFailed')}</div>
            <div><PixelButton size="sm" variant="secondary" onClick={() => { if (open && open !== 'failed') void loadDraft(input, open); }}>{t('caseStudy.retry')}</PixelButton></div>
          </div>
        )}

        <Panel title={t('caseStudy.sendFrom')}>
          {senders.length === 0 && <div style={hint}>{t('caseStudy.noMailbox', { to: open && open !== 'failed' ? open.to : '' })}</div>}
          <div role="radiogroup" aria-label={t('caseStudy.sendFrom')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {senders.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: s.canSend ? 1 : 0.45, cursor: s.canSend ? 'pointer' : 'default' }}>
                  <input type="radio" name="cs-mailbox" disabled={!s.canSend} checked={mailbox === s.id} onChange={() => setMailbox(s.id)} />
                  <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12 }}>{s.address}</span>
                </label>
                {!s.canSend && s.reason && <InfoTip text={s.reason} align="end" />}
              </div>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 12, lineHeight: '17px', cursor: 'pointer' }}>
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{t('caseStudy.permission', { app: APP_NAME })}</span>
          </label>
        </Panel>

        <div style={hint}>{t('caseStudy.editHint')}</div>
        {overflow && <div role="alert" style={{ ...status, color: 'var(--cth-amber-text)' }}>{t('caseStudy.overflow')}</div>}

        <div aria-live="polite" style={status}>
          {send.state === 'sent' && <span style={{ color: 'var(--cth-green-text)' }}>{t('caseStudy.sent')}</span>}
          {send.state === 'maybe' && <span>{t('caseStudy.maybeSent')}</span>}
          {send.state === 'error' && <span>{send.text}</span>}
          {saved && <span>{saved}</span>}
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--cth-line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {anySender ? (
            <PixelButton size="lg" fullWidth disabled={!ready || !permission || !mailbox || busy || send.state === 'sent'} onClick={() => void doSend()}>
              {send.state === 'sending' ? t('caseStudy.sending') : t('caseStudy.send', { app: APP_NAME })}
            </PixelButton>
          ) : (
            <PixelButton size="lg" fullWidth disabled={!ready || !permission || busy} onClick={() => void doSave(true)}>{t('caseStudy.saveAndMail')}</PixelButton>
          )}
          <PixelButton size="lg" variant="secondary" fullWidth disabled={!ready || busy} onClick={() => void doSave(false)}>{t('caseStudy.savePdf')}</PixelButton>
        </div>
      </div>
    </Dialog>
  );
}
