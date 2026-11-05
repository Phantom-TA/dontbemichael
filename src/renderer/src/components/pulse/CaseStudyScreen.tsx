/**
 * The case study, in its own tab (docs/designs/case-study-tab.md): the page as
 * it prints on the left, read only, drawn from the same pageHtml main prints;
 * on the right only what sending needs, the mailbox, the permission tick, Send
 * and Save. The owner can't change the page (owner, 2026-11-04, D2 and D3): its
 * words are the app's draft, its period the last 30 days, the business name
 * always shown, the logo the website's or none. Main builds the page and the
 * PDF itself from the draft it holds, so this screen sends no words at all.
 *
 *   open ─► caseStudyOpen ─► facts ─► caseStudyPrepare ─► draft and logo (drafting ─► ready | failed ─► Try again)
 *   Send ─► caseStudySend ─► sent | failed (reason) | maybe sent       (the tab's X waits meanwhile)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  caseLangOf, PAGE_W, pageHtml, startingEdits,
  type CaseDraft, type CaseInput, type CaseOpen, type CasePrep, type HeroPalette
} from '@shared/caseStudy';
import { useStore } from '@/store/store';
import { Panel, hint } from '../fieldText';
import { InfoTip } from '../InfoTip';
import { PixelButton } from '../PixelButton';
import { APP_NAME } from '@shared/appName';

/** The landing page is drawn at its layout width and scaled to the well (D28). */
const PREVIEW_MIN_H = 900;

type Draft = { state: 'drafting' } | { state: 'ready'; draft: CaseDraft } | { state: 'failed' };
type Send = { state: 'idle' } | { state: 'sending' } | { state: 'sent' } | { state: 'maybe' } | { state: 'error'; text: string };

export function CaseStudyScreen() {
  const { t, i18n } = useTranslation();
  const lang = caseLangOf(i18n.language);
  // Fixed (D3): the last 30 days, the business name shown.
  const input: CaseInput = useMemo(() => ({ lang, period: 'last-30', showName: true }), [lang]);
  const [open, setOpen] = useState<CaseOpen | null | 'failed'>(null);
  const [draft, setDraft] = useState<Draft>({ state: 'drafting' });
  const [logo, setLogo] = useState<{ logo: string; palette: HeroPalette } | null>(null);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [permission, setPermission] = useState(false);
  const [send, setSend] = useState<Send>({ state: 'idle' });
  // The page's full height: a landing page scrolls (D28).
  const [pageH, setPageH] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>('');
  const frame = useRef<HTMLIFrameElement | null>(null);
  const well = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.7);
  const alive = useRef(true);
  // Set true again on every mount: StrictMode mounts, unmounts and mounts
  // once in development, and a flag left false drops every answer from main.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const openRef = useRef<CaseOpen | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  /** A prepared case study for this input: its draft and logo. */
  const takePrepared = useCallback((p: CasePrep) => {
    const o = openRef.current;
    if (!o || p.state !== 'ready' || JSON.stringify(p.input) !== JSON.stringify(inputRef.current)) return;
    if (p.logo?.ok) setLogo({ logo: p.logo.logo, palette: p.logo.palette });
    if (!p.hasWork) return;
    setDraft(p.draft ? { state: 'ready', draft: p.draft } : { state: 'failed' });
  }, []);

  // The facts at once, the page drawn from them at once (built in words), and
  // the draft and the logo from main's background preparation (owner,
  // 2026-11-03: never an empty frame).
  useEffect(() => {
    let stop = false;
    void (async () => {
      const o = await window.cth.caseStudyOpen(input).catch(() => null);
      if (stop || !alive.current) return;
      if (!o) { setOpen('failed'); return; }
      openRef.current = o;
      setOpen(o);
      setMailbox((m) => m ?? o.senders.find((s) => s.canSend)?.id ?? null);
      if (!o.hasWork) return;
      const p = await window.cth.caseStudyPrepare(input).catch(() => null);
      if (stop || !alive.current || !p) return;
      if (p.state === 'ready') takePrepared(p); else setDraft({ state: 'drafting' });
    })();
    return () => { stop = true; };
  }, [input, takePrepared]);

  // Main says a preparation finished: take it if it is this screen's.
  useEffect(() => window.cth.onCaseStudyReady(() => {
    void window.cth.caseStudyStatus().then((p) => { if (alive.current) takePrepared(p); }).catch(() => undefined);
  }), [takePrepared]);

  /** Draft again after a failure (E3): recovery only, nothing else changes. */
  const retryDraft = async (): Promise<void> => {
    setDraft({ state: 'drafting' });
    const r = await window.cth.caseStudyDraft(input).catch(() => null);
    if (!alive.current) return;
    setDraft(r?.ok ? { state: 'ready', draft: r.draft } : { state: 'failed' });
  };

  const facts = open && open !== 'failed' ? { ...open.facts, ...(logo ? { logo: logo.logo, palette: logo.palette } : {}) } : null;
  // The words main prints: its draft, built in words where the draft gives none.
  const words = useMemo(() => (facts && open && open !== 'failed' && open.hasWork
    ? startingEdits(facts, draft.state === 'ready' ? draft.draft : { headlines: {}, team: {} })
    : null), [open, logo, draft]);
  const html = useMemo(() => (facts && words ? pageHtml(facts, words, { fontCss: '' }) : ''), [open, logo, words]);
  const htmlRef = useRef(html);
  htmlRef.current = html;
  // The frame loads its first page once; later pages replace its contents in
  // place, so a new draft never reloads the frame, flickers or drops its fonts.
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

  // The page scaled to the well's width; a longer page scrolls in the well.
  // The tab may be hidden (another tab shown): a zero width keeps the last scale.
  useEffect(() => {
    const el = well.current;
    if (!el) return;
    const fit = (): void => { const r = el.getBoundingClientRect(); if (r.width > 0) setScale(Math.max(0.3, Math.min(1, (r.width - 48) / PAGE_W))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const senders = open && open !== 'failed' ? open.senders : [];
  const anySender = senders.some((s) => s.canSend);
  const busy = send.state === 'sending' || saving;
  // The tab's X waits while a send or save runs (case-study-tab.md, 4).
  const setBusy = useStore((s) => s.setCaseStudyBusy);
  useEffect(() => { setBusy(busy); }, [busy, setBusy]);
  useEffect(() => () => setBusy(false), [setBusy]);
  const ready = !!facts && !!words && draft.state !== 'drafting';

  const doSend = async (): Promise<void> => {
    if (!mailbox) return;
    setSend({ state: 'sending' });
    const r = await window.cth.caseStudySend(input, mailbox, permission).catch(() => null);
    if (!alive.current) return;
    if (!r) { setSend({ state: 'error', text: t('caseStudy.failedNoReason') }); return; }
    if (r.ok) { setSend({ state: 'sent' }); return; }
    if (r.kind === 'maybe-sent') setSend({ state: 'maybe' });
    else if (r.kind === 'failed' && r.reason) setSend({ state: 'error', text: t('caseStudy.failed', { reason: r.reason }) });
    else setSend({ state: 'error', text: t('caseStudy.failedNoReason') });
  };

  const doSave = async (openMailApp: boolean): Promise<void> => {
    setSaving(true); setSaved('');
    const r = await window.cth.caseStudySavePdf(input, openMailApp).catch(() => null);
    if (!alive.current) return;
    setSaving(false);
    if (r?.ok) setSaved(t('caseStudy.saved'));
    else if (r?.kind !== 'cancelled') setSaved(t('caseStudy.pdfFailed'));
  };

  const status: CSSProperties = { fontSize: 12, lineHeight: '17px' };
  const empty = open && open !== 'failed' && !open.hasWork;

  return (
    <div role="region" aria-label={t('caseStudy.title')} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
      <div ref={well} style={{ background: 'var(--cth-floor)', position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 0' }}>
        {open === null && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loading')}</div>}
        {open === 'failed' && <div style={{ ...hint, marginTop: 40 }}>{t('caseStudy.loadFailed')}</div>}
        {empty && (
          <div style={{ marginTop: 80, maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t('caseStudy.noWork')}</div>
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

      <div style={{ borderInlineStart: '1px solid var(--cth-line)', background: 'var(--cth-card)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('caseStudy.title')}</span>
          <InfoTip text={t('caseStudy.info')} align="end" />
        </div>

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
    </div>
  );
}
