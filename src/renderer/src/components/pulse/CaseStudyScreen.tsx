/**
 * The case study screen (docs/designs/case-study.md; mockup approved in the
 * design review, D15 to D19): the page as it prints on the left, read only,
 * drawn from the same pageHtml main prints; on the right the headline (one
 * of the drafted choices, D24), the words of every other part, the period, name switch, mailbox, permission and Send (D22: nothing is typed on
 * the page itself). Main builds the page and the PDF itself: this screen
 * sends only the edited text, the toggles, the period and the chosen mailbox.
 *
 *   open ─► caseStudyOpen ─► facts ─┬─► caseStudyDraft ─► edits (drafting ─► ready | failed)
 *                                   └─► caseStudyLogo  ─► logo and colour (or Pick your logo)
 *   Send ─► caseStudySend ─► sent | failed (reason) | maybe sent       (Close is off meanwhile)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  builtInHeadline, CAPS, caseLangOf, figureValue, PAGE_W, fmtCount, headlineChoices, namesBusiness, pageHtml, startingEdits, TEAM_ROWS,
  type CaseDraft, type CaseInput, type CaseOpen, type CasePrep, type CasePeriod, type CaseStudyEdits, type HeadlineFigure, type HeroPalette
} from '@shared/caseStudy';
import { Dialog } from '@/shell/Dialog';
import { Field, Panel, hint } from '../fieldText';
import { InfoTip } from '../InfoTip';
import { PixelButton } from '../PixelButton';
import { Toggle } from '../triggers/ui';
import { APP_NAME } from '@shared/appName';

const PERIODS: CasePeriod[] = ['last-30', 'this-month'];
/** The landing page is drawn at its layout width and scaled to the well (D28). */
const PREVIEW_MIN_H = 900;

type Draft = { state: 'drafting' } | { state: 'ready'; draft: CaseDraft } | { state: 'failed' };
type Send = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'maybe' } | { state: 'error'; text: string };


export function CaseStudyScreen({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = caseLangOf(i18n.language);
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
  // The page's full height: a landing page scrolls (D28).
  const [pageH, setPageH] = useState(0);
  const [askRedraft, setAskRedraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>('');
  const frame = useRef<HTMLIFrameElement | null>(null);
  const well = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.7);
  const alive = useRef(true);
  // Set true again on every mount: StrictMode mounts, unmounts and mounts
  // once in development, and a flag left false drops every answer from main.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const touchedRef = useRef(false);
  useEffect(() => { touchedRef.current = touched; }, [touched]);
  const openRef = useRef<CaseOpen | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  /** Edits from a draft (or none yet): built in headline words and role
   *  descriptions fill what the draft leaves out, so the page is never empty. */
  const applyDraft = useCallback((o: CaseOpen, d: CaseDraft | null) => {
    const e = startingEdits(o.facts, d ?? { headlines: {}, team: {} }, editsRef.current?.headline?.figure);
    editsRef.current = e; setEdits(e); setTouched(false);
  }, []);

  /** A prepared case study for this input: its draft and logo, unless the
   *  owner has started editing meanwhile. */
  const takePrepared = useCallback((p: CasePrep) => {
    const o = openRef.current;
    if (!o || p.state !== 'ready' || JSON.stringify(p.input) !== JSON.stringify(inputRef.current)) return;
    if (p.logo?.ok) { setLogo({ logo: p.logo.logo, palette: p.logo.palette }); setLogoFailed(false); } else if (p.logo && inputRef.current.showName) setLogoFailed(true);
    if (!p.hasWork) return;
    setDraft(p.draft ? { state: 'ready', draft: p.draft } : { state: 'failed' });
    if (!touchedRef.current) applyDraft(o, p.draft);
  }, [applyDraft]);

  // The facts at once, the page drawn from them at once, and the draft and the
  // logo from main's background preparation (owner, 2026-11-03: never an empty
  // frame). A period or name change prepares again while the page stays up.
  useEffect(() => {
    let stop = false;
    void (async () => {
      const o = await window.cth.caseStudyOpen(input).catch(() => null);
      if (stop || !alive.current) return;
      if (!o) { setOpen('failed'); return; }
      openRef.current = o;
      setOpen(o);
      setMailbox((m) => m ?? o.senders.find((s) => s.canSend)?.id ?? null);
      if (!o.hasWork) { editsRef.current = null; setEdits(null); return; }
      if (!editsRef.current || !touchedRef.current) applyDraft(o, null);
      const p = await window.cth.caseStudyPrepare(input).catch(() => null);
      if (stop || !alive.current || !p) return;
      if (p.state === 'ready') takePrepared(p); else setDraft({ state: 'drafting' });
    })();
    return () => { stop = true; };
  }, [input, applyDraft, takePrepared]);

  // Main says a preparation finished: take it if it is this screen's.
  useEffect(() => window.cth.onCaseStudyReady(() => {
    void window.cth.caseStudyStatus().then((p) => { if (alive.current) takePrepared(p); }).catch(() => undefined);
  }), [takePrepared]);

  const retryDraft = async (): Promise<void> => {
    const o = openRef.current;
    if (!o) return;
    setDraft({ state: 'drafting' });
    const r = await window.cth.caseStudyDraft(input).catch(() => null);
    if (!alive.current) return;
    setDraft(r?.ok ? { state: 'ready', draft: r.draft } : { state: 'failed' });
    if (r?.ok) applyDraft(o, r.draft);
  };

  const facts = open && open !== 'failed' ? { ...open.facts, ...(logo && showName ? { logo: logo.logo, palette: logo.palette } : {}) } : null;
  const choices = facts ? headlineChoices(facts.figures) : [];

  // The preview: read only, redrawn from the panel's words as the owner types.
  const html = useMemo(() => (facts && edits ? pageHtml(facts, edits, { fontCss: '' }) : ''),
    [open, logo, showName, edits]);
  const htmlRef = useRef(html);
  htmlRef.current = html;
  // The frame loads its first page once; later pages replace its contents in
  // place, so typing never reloads the frame, flickers or drops its fonts.
  const [srcDoc, setSrcDoc] = useState('');
  const frameReady = useRef(false);
  useEffect(() => { if (html && !srcDoc) setSrcDoc(html); }, [html, srcDoc]);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const page = doc?.querySelector('.page') as HTMLElement | null;
    setPageH(page ? Math.ceil(page.getBoundingClientRect().height) : 0);
  }, []);

  const paint = useCallback((next: string) => {
    const doc = frame.current?.contentDocument;
    if (!doc || !next || !frameReady.current) return;
    const parsed = new DOMParser().parseFromString(next, 'text/html');
    doc.documentElement.lang = parsed.documentElement.lang;
    doc.documentElement.dir = parsed.documentElement.dir;
    doc.head.innerHTML = parsed.head.innerHTML;
    doc.body.innerHTML = parsed.body.innerHTML;
    measure();
  }, [measure]);
  useEffect(() => { paint(html); }, [html, paint]);

  const onFrameLoad = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow as (Window & { FontFace: typeof FontFace }) | null;
    if (!doc) return;
    frameReady.current = true;
    paint(htmlRef.current);
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
    measure();
  }, [measure, open, paint]);

  /** One change from the panel: the page follows, and a failed Send note clears. */
  const change = (next: (e: CaseStudyEdits) => CaseStudyEdits): void => {
    const base = editsRef.current;
    if (!base) return;
    const e = next(base);
    editsRef.current = e; setEdits(e); setTouched(true);
    setSend((st) => (st.state === 'error' ? { state: 'idle' } : st));
  };

  // The page scaled to the well's width; a longer page scrolls in the well.
  useEffect(() => {
    const el = well.current;
    if (!el) return;
    const fit = (): void => { const r = el.getBoundingClientRect(); setScale(Math.max(0.3, Math.min(1, (r.width - 48) / PAGE_W))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** A drafted headline's words for a figure, or the built in ones. */
  const wordsFor = (k: HeadlineFigure): { before: string; after: string } =>
    (draft.state === 'ready' ? draft.draft.headlines[k] : undefined) ?? (facts ? builtInHeadline(facts, k) : { before: '', after: '' });
  // Only a drafted headline: no free words beside Pulse's number (D24).
  const pickFigure = (k: HeadlineFigure): void => change((e) => ({ ...e, headline: { figure: k, ...wordsFor(k) } }));

  const flipName = (): void => {
    if (touched) { setAskRedraft(true); return; }
    setShowName((v) => !v);
  };

  const current = edits;
  const nameWarn = !!facts && !showName && !!current && [current.subtitle, current.about, current.quote, current.why, current.headline?.before ?? '', current.headline?.after ?? '', ...Object.values(current.team)]
    .some((x) => namesBusiness(x, { businessName: open && open !== 'failed' ? open.facts.businessName : undefined, website: open && open !== 'failed' ? open.facts.website : undefined }));

  const senders = open && open !== 'failed' ? open.senders : [];
  const anySender = senders.some((s) => s.canSend);
  const busy = send.state === 'sending' || saving;
  const ready = !!facts && !!current && (open as CaseOpen).hasWork && draft.state !== 'drafting';

  const doSend = async (): Promise<void> => {
    if (!mailbox || !current) return;
    setSend({ state: 'sending' });
    const r = await window.cth.caseStudySend(input, current, mailbox, permission).catch(() => null);
    if (!alive.current) return;
    if (!r) { setSend({ state: 'error', text: t('caseStudy.failedNoReason') }); return; }
    if (r.ok) { setSend({ state: 'sent' }); return; }
    if (r.kind === 'maybe-sent') setSend({ state: 'maybe' });
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
      <div ref={well} style={{ background: 'var(--cth-floor)', position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 0' }}>
        {open === null && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loading')}</div>}
        {open === 'failed' && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loadFailed')}</div>}
        {empty && (
          <div style={{ marginTop: 80, maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{period === 'this-month' ? t('caseStudy.noWorkMonth') : t('caseStudy.noWork')}</div>
            <div style={hint}>{t('caseStudy.noWorkAny')}</div>
          </div>
        )}
        {!empty && srcDoc && (
          <div style={{ width: PAGE_W * scale, height: Math.max(PREVIEW_MIN_H, pageH) * scale, flex: 'none', position: 'relative', boxShadow: '0 2px 10px rgba(30,27,46,.16)', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            {/* Read only: the page's links stay put in the preview (D22). */}
            <iframe ref={frame} title={t('caseStudy.pageLabel')} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={onFrameLoad} tabIndex={-1}
              style={{ width: PAGE_W, height: Math.max(PREVIEW_MIN_H, pageH), border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block', pointerEvents: 'none' }} />
          </div>
        )}
      </div>

      <div style={{ borderInlineStart: '1px solid var(--cth-line)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        {facts && current && choices.length > 0 && (
          <Panel title={t('caseStudy.headline')} info={t('caseStudy.headlineTip')}>
            <div role="radiogroup" aria-label={t('caseStudy.headline')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {choices.map((k) => {
                const w = wordsFor(k);
                return (
                  <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: '17px', cursor: 'pointer' }}>
                    <input type="radio" name="cs-headline" checked={current.headline?.figure === k} onChange={() => pickFigure(k)} style={{ marginTop: 2 }} />
                    <span>{w.before} <b style={{ fontWeight: 700 }}>{fmtCount(figureValue(facts.figures, k))}</b> {w.after}</span>
                  </label>
                );
              })}
            </div>
          </Panel>
        )}

        {facts && current && (() => {
          const caps = CAPS[facts.lang];
          const area: CSSProperties = { resize: 'vertical', minHeight: 64, padding: '6px 8px', fontSize: 13, lineHeight: '18px' };
          return (
            <Panel title={t('caseStudy.words')} info={t('caseStudy.wordsTip')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label={t('caseStudy.subtitle')}>
                  <input className="cth-input" value={current.subtitle} maxLength={caps.subtitle} style={{ height: 32 }}
                    onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, subtitle: v })); }} />
                </Field>
                <Field label={t('caseStudy.about')}>
                  <textarea className="cth-input" value={current.about} maxLength={caps.about} rows={4} style={area}
                    onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, about: v })); }} />
                </Field>
                <Field label={t('caseStudy.quote')} note={t('caseStudy.quoteNote')}>
                  <textarea className="cth-input" value={current.quote} maxLength={caps.quote} rows={3} style={area}
                    onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, quote: v })); }} />
                </Field>
                <div role="group" aria-label={t('caseStudy.team')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 13, lineHeight: '18px', fontWeight: 600 }}>{t('caseStudy.team')}</span>
                  {facts.members.slice(0, TEAM_ROWS).map((m) => (
                    <Field key={m.id} label={<span style={{ fontWeight: 500 }}>{m.name}</span>}>
                      <textarea className="cth-input" aria-label={m.name} value={current.team[m.id] ?? ''} maxLength={caps.teamLine} rows={2} style={{ ...area, minHeight: 48 }}
                        onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, team: { ...x.team, [m.id]: v } })); }} />
                    </Field>
                  ))}
                </div>
                <Field label={t('caseStudy.why')}>
                  <textarea className="cth-input" value={current.why} maxLength={caps.why} rows={3} style={area}
                    onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, why: v })); }} />
                </Field>
              </div>
            </Panel>
          );
        })()}

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
            <div><PixelButton size="sm" variant="secondary" onClick={() => void retryDraft()}>{t('caseStudy.retry')}</PixelButton></div>
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


        <div aria-live="polite" style={status}>
          {send.state === 'sent' && <span style={{ color: 'var(--cth-green-text)' }}>{t('caseStudy.sent')}</span>}
          {send.state === 'maybe' && <span>{t('caseStudy.maybeSent')}</span>}
          {send.state === 'error' && <span>{send.text}</span>}
          {saved && <span>{saved}</span>}
        </div>

        <div style={{ marginTop: 'auto', position: 'sticky', bottom: -16, background: 'var(--cth-card)', borderTop: '1px solid var(--cth-line)', padding: '14px 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
