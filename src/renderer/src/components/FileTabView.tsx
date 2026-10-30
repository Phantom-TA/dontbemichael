/**
 * A file opened from a reply or an Ask me card, read inside the office
 * (docs/designs/open-file-tab.md): Markdown rendered, text and JSON as
 * monospace, CSV and TSV as a table (E3), images fitted to the width. Main
 * reads it after the same folder check as Open, and the tab re-reads it within
 * a second of a change on disk while it is shown (E1), keeping the scroll.
 * Copy puts it on the clipboard ready to paste (docs/designs/copy-document.md).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OPEN_EXTENSIONS, extensionOf } from '@shared/askFiles';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { useStore } from '@/store/store';
import type { FileTab } from '@/store/fileTabs';
import { PixelButton } from './PixelButton';
import { EmailTabView } from './EmailTabView';
import { CSV_ROW_LIMIT, parseDelimited } from './delimited';
import { cleanCopy, copyPicture, encodeShownPicture, escapeHtml, tableCopy, type CopyData, type CopyResult } from './fileTabCopy';

type Read =
  | { status: 'reading' }
  | { status: 'not found' | 'too large' | 'unreadable' }
  | { status: 'ok'; kind: 'markdown' | 'text' | 'json' | 'csv' | 'image'; text?: string; url?: string; size: number; place: string; folder: string[] };

export function FileTabView() {
  const tab = useStore((s) => s.fileTabs.find((f) => f.id === s.activeFileTab));
  if (!tab) return null;
  // An email opened from a chip (docs/designs/original-email-view.md).
  if (tab.email) return <EmailTabView key={tab.id} tab={tab} />;
  return <FileTabBody key={tab.id} tab={tab} />;
}

function FileTabBody({ tab }: { tab: FileTab }) {
  const { t } = useTranslation();
  const [read, setRead] = useState<Read>({ status: 'reading' });
  const scroller = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const blobUrl = useRef<string | null>(null);
  const picture = useRef<HTMLImageElement>(null);
  // A file that just took the center from the wide 1:1 (open-file-from-wide-dock.md,
  // decision 3): its title takes the focus and a line says it opened. The next
  // frame, since the office stops being inert in App's effect, after this one.
  const title = useRef<HTMLDivElement>(null);
  const opened = useStore((s) => (s.fileOpened?.id === tab.id ? s.fileOpened.seq : 0));
  const [said, setSaid] = useState('');
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => { title.current?.focus({ preventScroll: true }); setSaid(t('fileTab.opened', { name: tab.title })); useStore.getState().clearFileOpened(); });
    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  const [copy, setCopy] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const agents = useStore((s) => s.agents);
  // Finder is the Mac's; Windows and Linux both say folder.
  const win = window.cth.platform !== 'darwin';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const n = ++seq.current;
      const top = scroller.current?.scrollTop ?? 0;
      const r = await window.cth.readAskFile(tab.id, tab.who).catch(() => ({ ok: false as const, error: 'unreadable' as const }));
      // A later read, or a closed tab, wins over this one.
      if (!alive || n !== seq.current) return;
      if (!r.ok) { setRead({ status: r.error }); return; }
      let url: string | undefined;
      if (r.kind === 'image' && r.bytes) url = URL.createObjectURL(new Blob([new Uint8Array(r.bytes)], { type: r.mime }));
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = url ?? null;
      setRead({ status: 'ok', kind: r.kind, text: r.text, url, size: r.size, place: r.place, folder: r.folder });
      requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = top; });
    };
    void load();
    void window.cth.watchAskFile(tab.id, tab.id, tab.who).catch(() => undefined);
    const off = window.cth.onAskFileChanged((id) => { if (id === tab.id) void load(); });
    return () => {
      alive = false;
      off();
      void window.cth.unwatchAskFile(tab.id).catch(() => undefined);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    };
  }, [tab.id, tab.who]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(copyTimer.current); };
  }, []);

  // Copy reads what the tab shows at the click: the page for Markdown, every
  // row for a CSV, the shown picture (copy-document.md, A1, E2, E3).
  const copyTab = async () => {
    if (read.status !== 'ok') return;
    const kind = read.kind;
    setCopy('busy');
    let result: CopyResult | null;
    try {
      if (kind === 'image') {
        result = await copyPicture(picture.current, {
          encode: encodeShownPicture, isAlive: () => mounted.current, send: (png) => window.cth.copyImage(png)
        });
      } else {
        let data: CopyData = { text: read.text ?? '' };
        if (kind === 'markdown' && scroller.current) data = cleanCopy(scroller.current);
        else if (kind === 'csv') {
          const rows = parseDelimited(read.text ?? '', extensionOf(tab.id) === 'tsv' ? '\t' : ',');
          if (rows && rows.length) data = tableCopy(rows);
        }
        result = await window.cth.copyRich(data);
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    // The tab closed meanwhile: nothing to show.
    if (!result || !mounted.current) return;
    if (!result.ok) console.warn('[copy]', kind, result.error);
    setCopy(result.ok ? 'done' : 'error');
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopy('idle'), 2000);
  };

  // A selected part pastes clean too (E4): no theme colors. Only a selection
  // wholly inside the page; anything else, or a failure, keeps the native copy.
  const copySelection = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (read.status !== 'ok' || read.kind === 'image') return;
    const sel = window.getSelection();
    const page = scroller.current;
    if (!sel || sel.rangeCount !== 1 || sel.isCollapsed || !page) return;
    const range = sel.getRangeAt(0);
    if (!page.contains(range.startContainer) || !page.contains(range.endContainer)) return;
    try {
      const shown = sel.toString();
      const start = range.commonAncestorContainer;
      const inPre = (start instanceof Element ? start : start.parentElement)?.closest('pre');
      let data: CopyData;
      // Text and JSON are a <pre>: the words as shown, no formatting to keep.
      if (read.kind === 'text' || read.kind === 'json') data = { text: shown };
      else if (inPre) data = { text: shown, html: `<pre>${escapeHtml(shown)}</pre>` };
      else data = cleanCopy(range.cloneContents());
      e.clipboardData.setData('text/plain', data.text);
      if (data.html) e.clipboardData.setData('text/html', data.html);
      e.preventDefault();
    } catch (err) {
      console.warn('[copy]', read.kind, err);
    }
  };

  const canOpenInApp = OPEN_EXTENSIONS.has(extensionOf(tab.id));
  const openInApp = () => void window.cth.openAskFile(tab.id, tab.who).catch(() => undefined);
  const reveal = () => void window.cth.revealPath(tab.id).catch(() => undefined);
  const revealLabel = t(win ? 'askMe.fileRevealWindows' : 'askMe.fileReveal');

  // Where it sits, in office words (DD4): "Office / IT" or "Nick / reports".
  const where = read.status === 'ok'
    ? [read.place === 'office' ? t('fileTab.office') : agents.find((a) => a.id === read.place)?.name ?? t('fileTab.office'), ...read.folder].join(' / ')
    : '';
  const quiet = (text: string) => <p style={{ margin: 0, fontSize: 13, color: 'var(--cth-ink-3)' }}>{text}</p>;

  let body: React.ReactNode;
  if (read.status === 'reading') body = quiet(t('fileTab.reading'));
  else if (read.status !== 'ok') {
    body = read.status === 'not found' ? quiet(t('askMe.fileNotFound')) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {quiet(t(read.status === 'too large' ? 'fileTab.tooLarge' : 'fileTab.unreadable'))}
        {canOpenInApp
          ? <PixelButton variant="secondary" size="sm" onClick={openInApp}>{t('fileTab.openInApp')}</PixelButton>
          : <PixelButton variant="secondary" size="sm" onClick={reveal}>{revealLabel}</PixelButton>}
      </div>
    );
  } else if (read.size === 0) body = quiet(t('fileTab.empty'));
  else if (read.kind === 'image') {
    body = <img ref={picture} src={read.url} alt={tab.title} style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 'var(--cth-r-md)' }} />;
  } else if (read.kind === 'markdown') {
    // Pictures beside the report show, read inside its own folder; links to
    // local files stay inert (E2 not taken).
    const slash = Math.max(tab.id.lastIndexOf('/'), tab.id.lastIndexOf('\\'));
    body = <MarkdownPreview source={read.text ?? ''} root={tab.id.slice(0, slash)} baseRel={tab.id.slice(slash + 1)} />;
  } else if (read.kind === 'csv') {
    const rows = parseDelimited(read.text ?? '', extensionOf(tab.id) === 'tsv' ? '\t' : ',');
    body = rows && rows.length ? <CsvTable rows={rows} /> : <Mono text={read.text ?? ''} />;
  } else body = <Mono text={read.text ?? ''} />;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
        borderBottom: '1px solid var(--cth-line)', background: 'var(--cth-card)'
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div ref={title} tabIndex={-1} dir="auto" style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', outline: 'none' }}>{tab.title}</div>
          {where && (
            <div dir="auto" title={`⁨${tab.id}⁩`} style={{ fontSize: 12, color: 'var(--cth-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where}</div>
          )}
        </div>
        {read.status === 'ok' && read.size > 0 && (
          <PixelButton variant="secondary" size="sm" onClick={() => void copyTab()} disabled={copy === 'busy'}>
            {/* All three words share one cell, so the button keeps the widest one's width. */}
            <span style={{ display: 'inline-grid' }}>
              {[t('fileTab.copy'), t('fileTab.copied'), t('fileTab.copyFailed')].map((w, i) => (
                <span key={i} style={{ gridArea: '1 / 1', visibility: i === (copy === 'done' ? 1 : copy === 'error' ? 2 : 0) ? 'visible' : 'hidden' }}>{w}</span>
              ))}
            </span>
          </PixelButton>
        )}
        <span className="cth-sr-only" aria-live="polite">{copy === 'done' ? t('fileTab.copied') : copy === 'error' ? t('fileTab.copyFailed') : said}</span>
        {/* A file that is gone has nothing to open or show. */}
        {read.status !== 'not found' && canOpenInApp && <PixelButton variant="secondary" size="sm" onClick={openInApp}>{t('fileTab.openInApp')}</PixelButton>}
        {read.status !== 'not found' && <PixelButton variant="secondary" size="sm" onClick={reveal}>{revealLabel}</PixelButton>}
      </div>
      {/* cth-file-tab lifts the Markdown reading cap: a report fills the pane. */}
      <div ref={scroller} className="cth-file-tab" onCopy={copySelection} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: read.status === 'ok' && read.kind === 'markdown' && read.size > 0 ? 0 : '16px 20px' }}>
        {body}
      </div>
    </div>
  );
}

function Mono({ text }: { text: string }) {
  return (
    <pre dir="auto" style={{
      margin: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 12, lineHeight: '18px',
      color: 'var(--cth-ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'
    }}>{text}</pre>
  );
}

function CsvTable({ rows }: { rows: string[][] }) {
  const { t } = useTranslation();
  const [head, ...rest] = rows;
  const shown = rest.slice(0, CSV_ROW_LIMIT);
  const cell = { padding: '6px 10px', borderBottom: '1px solid var(--cth-line)', textAlign: 'start' as const, whiteSpace: 'nowrap' as const };
  return (
    <div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, color: 'var(--cth-ink)' }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={i} dir="auto" style={{ ...cell, position: 'sticky', top: 0, background: 'var(--cth-card)', fontWeight: 600, color: 'var(--cth-ink-2)' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} dir="auto" style={cell}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rest.length > CSV_ROW_LIMIT && (
        <p data-copy="skip" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cth-ink-3)' }}>
          {t('fileTab.rows', { shown: CSV_ROW_LIMIT.toLocaleString(), total: rest.length.toLocaleString() })}
        </p>
      )}
    </div>
  );
}
