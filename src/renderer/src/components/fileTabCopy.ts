/**
 * What the file tab's Copy puts on the clipboard (docs/designs/copy-document.md).
 *
 * A Markdown document goes as clean HTML (only plain tags, no app classes,
 * colors or fonts, so the dark theme never pastes white text) plus clean text
 * with no Markdown marks. Both come from one walk of the rendered page, so the
 * whole document (the Copy button) and a selected part (Cmd+C, E4) paste the
 * same way. A CSV goes as a table and tab separated rows (E3); a picture as a
 * PNG drawn from the picture the tab shows (E2).
 *
 * The walk reads a small node interface, not the DOM types, so tests run it on
 * plain fake nodes.
 */
import { isBareLink } from '../markdown/mdLinks';

export interface CopyNode {
  /** 1 element, 3 text, 11 fragment. */
  nodeType: number;
  nodeName: string;
  childNodes: ArrayLike<CopyNode>;
  textContent: string | null;
  getAttribute?(name: string): string | null;
  /** An input's checkedness; a Range clone carries it over. */
  checked?: boolean;
}

export interface CopyData { text: string; html?: string }

/** Tags written as they are; every other element is unwrapped. No img: a
 *  picture pastes as its alt text, never as an address (P1). */
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'A', 'UL', 'OL', 'LI',
  'BLOCKQUOTE', 'CODE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'BR', 'HR']);
const VOID = new Set(['BR', 'HR']);
const DROP = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'NOSCRIPT']);
/** Containers whose whitespace-only text is layout, not words. */
const BLOCKISH = new Set(['#document-fragment', 'DIV', 'SECTION', 'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'BLOCKQUOTE']);
const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD',
  'TBODY', 'TFOOT', 'TR', 'HR', 'DIV', 'SECTION']);
const ROWS = new Set(['THEAD', 'TBODY', 'TFOOT', 'TR']);
const CELLS = new Set(['TD', 'TH']);

const FOOTNOTE_REF = '#user-content-fn-';
const FOOTNOTE_BACK = '#user-content-fnref-';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One cell of tab separated text: quoted, inner quotes doubled, when it holds
 *  a tab, a line break or a quote (Excel's rule), so a row stays a row. */
export function tsvCell(s: string): string {
  return /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const tag = (n: CopyNode) => n.nodeName.toUpperCase();
const attr = (n: CopyNode, name: string) => n.getAttribute?.(name) ?? null;
const classes = (n: CopyNode) => (attr(n, 'class') ?? '').split(/\s+/);
const kids = (n: CopyNode) => Array.from(n.childNodes);

/** A link address that works outside the app. */
function keptHref(href: string | null): string | null {
  return href && /^(https?:|mailto:)/i.test(href) ? href : null;
}

/** Elements that never reach a paste, with everything inside them. */
function dropped(n: CopyNode): boolean {
  const t = tag(n);
  // A button marked data-copy="words" (a place in Settings named in the
  // text) pastes as its words; any other button is the app's own control.
  if ((DROP.has(t) && attr(n, 'data-copy') !== 'words') || attr(n, 'data-copy') === 'skip') return true;
  const c = classes(n);
  // GFM's hidden "Footnotes" heading and the app's screen reader words.
  if (c.includes('sr-only') || c.includes('cth-sr-only')) return true;
  return t === 'A' && (attr(n, 'href') ?? '').startsWith(FOOTNOTE_BACK);
}

/** A picture or the app's picture chip: the author's alt, never the chip's
 *  visible words or a file path. */
function isPicture(n: CopyNode): boolean {
  return tag(n) === 'IMG' || (tag(n) === 'SPAN' && classes(n).includes('cth-md-img'));
}

function virtual(nodeName: string, childNodes: CopyNode[]): CopyNode {
  return { nodeType: 1, nodeName, childNodes, textContent: childNodes.map((c) => c.textContent ?? '').join('') };
}

/** A selection can clone list items without their list, or cells and rows
 *  without their table: give them their parent back. */
function children(n: CopyNode): CopyNode[] {
  const t = tag(n);
  let list = kids(n);
  const group = (items: CopyNode[], match: (c: CopyNode) => boolean, wrap: string): CopyNode[] => {
    const out: CopyNode[] = [];
    let run: CopyNode[] = [];
    const end = () => { if (run.length) out.push(virtual(wrap, run)); run = []; };
    for (const c of items) {
      if (c.nodeType === 1 && match(c)) run.push(c);
      else if (c.nodeType === 3 && !(c.textContent ?? '').trim() && run.length) continue;
      else { end(); out.push(c); }
    }
    end();
    return out;
  };
  if (t !== 'UL' && t !== 'OL') list = group(list, (c) => tag(c) === 'LI', 'UL');
  if (t !== 'TR') list = group(list, (c) => CELLS.has(tag(c)), 'TR');
  if (t !== 'TABLE' && !ROWS.has(t)) list = group(list, (c) => ROWS.has(tag(c)), 'TABLE');
  return list;
}

// ─── HTML ────────────────────────────────────────────────────────────────────

function html(n: CopyNode, parent: string): string {
  if (n.nodeType === 3) {
    const s = n.textContent ?? '';
    return !s.trim() && BLOCKISH.has(parent) ? '' : escapeHtml(s);
  }
  if (n.nodeType !== 1 && n.nodeType !== 11) return '';
  const t = n.nodeType === 11 ? '#document-fragment' : tag(n);
  const inner = () => children(n).map((c) => html(c, t)).join('');
  if (n.nodeType === 11) return inner();
  if (dropped(n)) return '';
  if (isPicture(n)) return escapeHtml(attr(n, 'data-alt') ?? '');
  if (t === 'INPUT') return attr(n, 'type') === 'checkbox' ? (n.checked ? '☑ ' : '☐ ') : '';
  if (t === 'A') {
    const href = attr(n, 'href') ?? '';
    if (href.startsWith(FOOTNOTE_REF)) return `[${escapeHtml(kids(n).map(text).join('').trim())}]`;
    const kept = keptHref(href);
    return kept ? `<a href="${escapeHtml(kept)}">${inner()}</a>` : inner();
  }
  if (!KEEP.has(t)) return inner();
  const lower = t.toLowerCase();
  let attrs = '';
  const dir = attr(n, 'dir');
  if (dir) attrs += ` dir="${escapeHtml(dir)}"`;
  const start = attr(n, 'start');
  if (t === 'OL' && start && /^\d+$/.test(start)) attrs += ` start="${start}"`;
  if (VOID.has(t)) return `<${lower}${attrs}>`;
  return `<${lower}${attrs}>${inner()}</${lower}>`;
}

// ─── Plain text ──────────────────────────────────────────────────────────────

const strip = (s: string) => s.replace(/^mailto:/i, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

/** The words of inline content: whitespace collapsed, a line break kept. */
function text(n: CopyNode): string {
  if (n.nodeType === 3) return (n.textContent ?? '').replace(/[ \t\r\n]+/g, ' ');
  if (n.nodeType !== 1 && n.nodeType !== 11) return '';
  if (n.nodeType === 1) {
    const t = tag(n);
    if (dropped(n)) return '';
    if (isPicture(n)) return attr(n, 'data-alt') ?? '';
    if (t === 'BR') return '\n';
    if (t === 'INPUT') return attr(n, 'type') === 'checkbox' ? (n.checked ? '☑ ' : '☐ ') : '';
    if (t === 'A') {
      const href = attr(n, 'href') ?? '';
      const words = kids(n).map(text).join('');
      if (href.startsWith(FOOTNOTE_REF)) return `[${words.trim()}]`;
      const kept = keptHref(href);
      if (!kept || !words.trim()) return words || (kept ? kept.replace(/^mailto:/i, '') : '');
      return isBareLink(words, kept) || strip(words.trim()) === strip(kept) ? words : `${words} (${kept.replace(/^mailto:/i, '')})`;
    }
  }
  return kids(n).map(text).join('');
}

// A task box's mark and its words' own leading space meet as two spaces.
const tidy = (s: string) => s.split('\n').map((l) => l.trim().replace(/ {2,}/g, ' ')).join('\n').trim();

/** Each block of a container as its own string; blank lines go between them. */
function blocks(n: CopyNode, depth: number): string[] {
  const out: string[] = [];
  let run: CopyNode[] = [];
  const endRun = () => {
    const words = tidy(run.map(text).join(''));
    if (words) out.push(words);
    run = [];
  };
  for (const c of children(n)) {
    const t = c.nodeType === 1 ? tag(c) : '';
    if (c.nodeType === 1 && dropped(c)) continue;
    if (!BLOCK.has(t)) { run.push(c); continue; }
    endRun();
    if (t === 'UL' || t === 'OL') { const l = listText(c, depth); if (l) out.push(l); }
    else if (t === 'PRE') { const code = (c.textContent ?? '').replace(/\n$/, ''); if (code) out.push(code); }
    else if (t === 'TABLE' || ROWS.has(t)) { const rows = tableText(c); if (rows) out.push(rows); }
    // A rule: the blank line between blocks already separates them.
    else if (t === 'HR') continue;
    else if (t === 'P' || /^H[1-6]$/.test(t)) { const words = tidy(text(c)); if (words) out.push(words); }
    else out.push(...blocks(c, depth));
  }
  endRun();
  return out;
}

function listText(list: CopyNode, depth: number): string {
  const ordered = tag(list) === 'OL';
  const start = Number.parseInt(attr(list, 'start') ?? '', 10);
  let n = Number.isFinite(start) ? start : 1;
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const item of children(list)) {
    if (item.nodeType !== 1 || tag(item) !== 'LI') continue;
    const mark = ordered ? `${n++}. ` : '• ';
    const parts = blocks(item, depth + 1);
    const [first = '', ...rest] = parts;
    lines.push(pad + mark + first.split('\n').join(`\n${pad}${' '.repeat(mark.length)}`));
    // A nested list comes back indented already; a later paragraph does not.
    for (const part of rest) lines.push(/^\s/.test(part) ? part : pad + '  ' + part);
  }
  return lines.join('\n');
}

function tableText(table: CopyNode): string {
  const rows: string[] = [];
  const visit = (n: CopyNode) => {
    for (const c of children(n)) {
      if (c.nodeType !== 1 || dropped(c)) continue;
      if (tag(c) === 'TR') {
        rows.push(children(c).filter((d) => d.nodeType === 1 && CELLS.has(tag(d))).map((d) => tsvCell(tidy(text(d)))).join('\t'));
      } else visit(c);
    }
  };
  if (tag(table) === 'TR') visit(virtual('TABLE', [table]));
  else visit(table);
  return rows.join('\n');
}

/** The rendered page or a selection's clone as clean HTML and clean text. */
export function cleanCopy(root: CopyNode): CopyData {
  const container = root.nodeType === 1 || root.nodeType === 11 ? root : virtual('#document-fragment', [root]);
  return {
    html: html(container, '#document-fragment'),
    text: blocks(container, 0).join('\n\n')
  };
}

/** Every row of a CSV or TSV, not only the rows the tab shows: an HTML table
 *  with the first row as headers, and tab separated text. */
export function tableCopy(rows: string[][]): CopyData {
  if (!rows.length) return { text: '' };
  const [head, ...rest] = rows;
  const row = (cells: string[], cell: 'th' | 'td') => `<tr>${cells.map((c) => `<${cell}>${escapeHtml(c)}</${cell}>`).join('')}</tr>`;
  const body: string[] = [];
  for (const r of rest) body.push(row(r, 'td'));
  return {
    html: `<table><thead>${row(head, 'th')}</thead><tbody>${body.join('')}</tbody></table>`,
    text: rows.map((r) => r.map(tsvCell).join('\t')).join('\n')
  };
}

// ─── Pictures ────────────────────────────────────────────────────────────────

export type CopyResult = { ok: boolean; error?: string };

export interface ShownPicture { complete: boolean; naturalWidth: number }

export interface PictureDeps<I> {
  /** Draws the picture now and resolves to its PNG bytes (null on failure). */
  encode: (img: I) => Promise<Uint8Array | null>;
  /** False once the tab is gone: nothing is sent then. */
  isAlive: () => boolean;
  send: (png: Uint8Array) => Promise<CopyResult>;
}

/** Copies the picture the tab shows. It is already decoded when shown, so the
 *  draw happens at the click and a reload after it cannot change what is
 *  copied; only the PNG encode is awaited. Null when the tab closed meanwhile. */
export async function copyPicture<I extends ShownPicture>(img: I | null, deps: PictureDeps<I>): Promise<CopyResult | null> {
  if (!img || !img.complete || !img.naturalWidth) return { ok: false, error: 'picture not shown' };
  const png = await deps.encode(img);
  if (!deps.isAlive()) return null;
  if (!png || !png.byteLength) return { ok: false, error: 'picture not encoded' };
  return deps.send(png);
}

/** The real encoder: draws synchronously, then encodes. Renderer only. */
export function encodeShownPicture(img: HTMLImageElement): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), () => resolve(null));
    }, 'image/png');
  });
}
