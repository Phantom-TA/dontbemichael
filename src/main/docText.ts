/**
 * An owner's documents → plain text the knowledge store can index.
 *
 * WHY THIS EXISTS. kg-core only understands text. Handed a Word, Excel or
 * PowerPoint file, it read the zip container as UTF-8 and indexed the raw bytes:
 * the upload reported success and nothing in the file was ever searchable. PDFs
 * depended on a `pdftotext` binary that a typical owner's Mac does not have. This
 * reads the formats owners actually keep, using pure-JS code that ships inside
 * the app plus what the computer already has (`textutil` and the Vision OCR on a
 * Mac, via macOcr.ts; Windows' own OCR, via winOcr.ts) — nothing to install —
 * and says plainly when a file can't be read, instead of storing junk that looks
 * like it worked.
 *
 * Runs in two places, both from inside the app bundle: the main process (the
 * knowledge store's ingest) and `docTextCli.ts`, the `doc-text` command agents
 * use to read Word/Excel/PowerPoint files in their own folders.
 */

import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { extname, posix } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { macOcr, MAX_OCR_PAGES, type OcrResult } from './macOcr';
import { winOcr } from './winOcr';
import { ownValue } from '../shared/ownValue';

/** Scans and photos go to the OCR this computer has: Windows' own, or the Mac's (which reports `unsupported` elsewhere). */
function ocrFile(srcPath: string, kind: 'image' | 'pdf'): Promise<OcrResult> {
  return process.platform === 'win32' ? winOcr(srcPath, kind) : macOcr(srcPath, kind);
}

export type DocExtraction =
  /** Converted here; index this text. */
  | { kind: 'text'; text: string; extractor: string; modality: string; mime: string }
  /** A format kg-core already reads well (plain text, code, CSV, images). */
  | { kind: 'passthrough' }
  /** Could not be read. `reason` is shown to the owner as-is, so it is plain English. */
  | { kind: 'unreadable'; reason: string };

/** Anything larger is almost certainly not a document an agent should read whole. */
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
/** Per zip entry, uncompressed. A zip bomb declares a tiny file that inflates hugely. */
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
/** Across every entry we would inflate. Many entries just under the per entry guard add up. */
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 5000;
/** A longer PDF is read up to here, one page at a time, so a huge one never
 *  holds every page's text at once. */
export const MAX_PDF_PAGES = 500;

const WORD = new Set(['docx', 'docm', 'dotx', 'dotm']);
const SLIDES = new Set(['pptx', 'pptm', 'ppsx', 'potx']);
const SHEETS = new Set(['xlsx', 'xlsm', 'xltx', 'xltm']);
/** Converted by macOS's built-in `textutil` — present on every Mac, nothing to install. */
const TEXTUTIL = new Set(['doc', 'rtf', 'odt', 'wordml', 'webarchive']);
export const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic']);

/** True for images, which an agent should open directly (Claude can see them) rather than convert. */
export function isImagePath(path: string): boolean {
  return IMAGES.has(extname(path).slice(1).toLowerCase());
}

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  doc: 'application/msword',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text'
};

/** Formats we know we can't read yet, with what the owner should do instead. */
const EXPORT_ADVICE: Record<string, string> = {
  pages: 'Apple Pages files can\'t be read yet. In Pages, choose File → Export To → Word or PDF, and add that instead.',
  numbers: 'Apple Numbers files can\'t be read yet. In Numbers, choose File → Export To → Excel, and add that instead.',
  key: 'Apple Keynote files can\'t be read yet. In Keynote, choose File → Export To → PowerPoint or PDF, and add that instead.',
  xls: 'Old Excel (.xls) files can\'t be read yet. Open it and save it as .xlsx, then add that instead.',
  ppt: 'Old PowerPoint (.ppt) files can\'t be read yet. Open it and save it as .pptx or PDF, then add that instead.'
};

export async function extractDocumentText(srcPath: string): Promise<DocExtraction> {
  const ext = extname(srcPath).slice(1).toLowerCase();

  let size: number;
  try {
    size = statSync(srcPath).size;
  } catch {
    return { kind: 'unreadable', reason: 'The file could not be opened. It may have been moved or deleted.' };
  }
  if (size > MAX_SOURCE_BYTES) {
    return { kind: 'unreadable', reason: 'This file is larger than 100 MB, which is too big to read.' };
  }

  const advice = ownValue(EXPORT_ADVICE, ext);
  if (advice) return { kind: 'unreadable', reason: advice };
  if (WORD.has(ext)) return fromOoxml(srcPath, 'docx', readWord);
  if (SLIDES.has(ext)) return fromOoxml(srcPath, 'pptx', readSlides);
  if (SHEETS.has(ext)) return fromOoxml(srcPath, 'xlsx', readSheets);
  if (ext === 'pdf') return readPdf(srcPath);
  if (TEXTUTIL.has(ext)) return await readWithTextutil(srcPath, ext);
  if (IMAGES.has(ext)) return readImage(srcPath, ext);

  // Everything else kg-core reads as UTF-8. Only safe if it really is text: a
  // binary file read that way is exactly the junk this module exists to stop.
  return looksBinary(srcPath)
    ? { kind: 'unreadable', reason: 'This isn\'t a document the app can read. Add it as Word, Excel, PowerPoint, PDF or plain text.' }
    : { kind: 'passthrough' };
}

// ─── Office Open XML (Word / PowerPoint / Excel are zips of XML) ──────────────

type OoxmlReader = (files: Record<string, Uint8Array>) => string;

function fromOoxml(srcPath: string, kind: 'docx' | 'pptx' | 'xlsx', read: OoxmlReader): DocExtraction {
  let files: Record<string, Uint8Array>;
  try {
    const zip = new Uint8Array(readFileSync(srcPath));
    // Only the XML we read — never the embedded images or media — and never
    // an entry that would inflate past the guard. `.rels` too: Excel's map
    // from sheet name to sheet file is `xl/_rels/workbook.xml.rels`, and
    // without it no sheet is found and every workbook reads as empty.
    const wanted = (f: { name: string; originalSize: number }) =>
      /\.(xml|rels)$/.test(f.name) && f.originalSize <= MAX_ENTRY_BYTES;

    // Add up what the wanted entries declare before inflating any of them: a
    // filter that returns false reads the zip's directory and nothing else.
    let entries = 0;
    let bytes = 0;
    unzipSync(zip, {
      filter: (f) => {
        if (wanted(f)) { entries += 1; bytes += f.originalSize; }
        return false;
      }
    });
    if (entries > MAX_ENTRIES || bytes > MAX_TOTAL_BYTES) {
      return { kind: 'unreadable', reason: 'This file holds more than the app can read. Split it into smaller files and add those instead.' };
    }

    files = unzipSync(zip, { filter: wanted });
  } catch {
    // A password-protected Office file is not a zip at all (it's an encrypted
    // compound file), so this is what that case looks like too.
    return { kind: 'unreadable', reason: 'This file is protected by a password or damaged. Remove the password (or save it again) and add it again.' };
  }

  let text: string;
  try {
    text = tidy(read(files));
  } catch {
    return { kind: 'unreadable', reason: 'This file is damaged or missing parts. Save it again and add it again.' };
  }
  if (!text) {
    return {
      kind: 'unreadable',
      reason: kind === 'pptx'
        ? 'This presentation has no text to read. Its slides are probably images.'
        : 'This file has no text in it to read.'
    };
  }
  return { kind: 'text', text, extractor: `${kind}-xml@1`, modality: MODALITY[kind], mime: MIME[kind] };
}

const MODALITY = { docx: 'doc', pptx: 'slides', xlsx: 'sheet' } as const;

function readWord(files: Record<string, Uint8Array>): string {
  // Body first, then the parts an owner still expects to be searchable: notes,
  // and the letterhead (address, phone) that lives in headers and footers.
  const order = (name: string) =>
    name === 'word/document.xml' ? 0
      : /^word\/(foot|end)notes\.xml$/.test(name) ? 1
        : /^word\/(header|footer)\d*\.xml$/.test(name) ? 2
          : -1;
  const shape: WordShape = { headings: wordHeadings(files['word/styles.xml']), ordered: wordListKinds(files['word/numbering.xml']) };
  return Object.keys(files)
    .filter((n) => order(n) >= 0)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((n) => wordMarkdown(strFromU8(files[n]), shape))
    .join('\n\n');
}

/** What turns Word paragraphs into markdown: a style's heading level, and
 *  whether a list level is numbered. */
type WordShape = { headings: Map<string, number>; ordered: (numId: string, level: number) => boolean };

/** Style id to heading level, read from the style's name ("heading 1", "Title")
 *  because Word in another language translates the id but not the name. */
function wordHeadings(styles: Uint8Array | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!styles) return out;
  for (const m of strFromU8(styles).matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(m[1], 'w:styleId');
    const name = m[2].match(/<w:name w:val="([^"]*)"/)?.[1]?.toLowerCase();
    const level = name === 'title' ? 1 : Number(name?.match(/^heading ([1-6])$/)?.[1]);
    if (id && level >= 1) out.set(id, level);
  }
  return out;
}

/** Whether a list's level is numbered (1. 2. 3.) rather than bulleted. */
function wordListKinds(numbering: Uint8Array | undefined): WordShape['ordered'] {
  if (!numbering) return () => false;
  const xml = strFromU8(numbering);
  const abstracts = new Map<string, Map<number, boolean>>();
  for (const a of xml.matchAll(/<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g)) {
    const id = attr(a[1], 'w:abstractNumId');
    if (id === null) continue;
    const levels = new Map<number, boolean>();
    for (const l of a[2].matchAll(/<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/g)) {
      const format = l[2].match(/<w:numFmt w:val="([^"]*)"/)?.[1];
      levels.set(Number(attr(l[1], 'w:ilvl')), !!format && format !== 'bullet' && format !== 'none');
    }
    abstracts.set(id, levels);
  }
  const nums = new Map<string, string>();
  for (const n of xml.matchAll(/<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g)) {
    const id = attr(n[1], 'w:numId');
    const abstract = n[2].match(/<w:abstractNumId w:val="([^"]*)"/)?.[1];
    if (id !== null && abstract !== undefined) nums.set(id, abstract);
  }
  return (numId, level) => abstracts.get(nums.get(numId) ?? '')?.get(level) ?? false;
}

/** A Word part as markdown: headings, bulleted and numbered lists, and tables
 *  keep their shape, so a copy an agent makes reads like the original instead
 *  of one run of text (owner, 2026-11-05). Plain paragraphs are separated by a
 *  blank line, list items by a line break. */
function wordMarkdown(xml: string, shape: WordShape): string {
  const blocks: { text: string; list: boolean }[] = [];
  let listLevel = -1;
  const paragraphs = (part: string): void => {
    for (const p of part.split('</w:p>')) {
      const text = wordRuns(p);
      if (!text.trim()) continue;
      const style = p.match(/<w:pStyle w:val="([^"]*)"/)?.[1] ?? '';
      const heading = shape.headings.get(style) ?? Number(style.match(/^Heading([1-6])$/i)?.[1] ?? 0);
      const numPr = p.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
      const numId = numPr?.match(/<w:numId w:val="([^"]*)"/)?.[1];
      if (heading) {
        blocks.push({ text: `${'#'.repeat(heading)} ${oneLine(text)}`, list: false });
        listLevel = -1;
      } else if (numId && numId !== '0') {
        // A level deeper than one past the last would read as code in markdown.
        const level = Math.min(Number(numPr?.match(/<w:ilvl w:val="(\d)"/)?.[1] ?? 0), listLevel + 1);
        listLevel = level;
        blocks.push({ text: `${'    '.repeat(level)}${shape.ordered(numId, level) ? '1.' : '-'} ${oneLine(text)}`, list: true });
      } else {
        blocks.push({ text, list: false });
        listLevel = -1;
      }
    }
  };
  const tables = /<w:tbl[\s>]/g;
  let at = 0;
  for (let m = tables.exec(xml); m; m = tables.exec(xml)) {
    paragraphs(xml.slice(at, m.index));
    at = tableEnd(xml, m.index);
    const table = wordTable(xml.slice(m.index, at));
    if (table) blocks.push({ text: table, list: false });
    listLevel = -1;
    tables.lastIndex = at;
  }
  paragraphs(xml.slice(at));
  return blocks.map((b, i) => (i === 0 ? '' : b.list && blocks[i - 1].list ? '\n' : '\n\n') + b.text).join('');
}

/** Where the table that opens at `from` closes, counting tables inside its cells. */
function tableEnd(xml: string, from: number): number {
  const tags = /<w:tbl[\s>]|<\/w:tbl>/g;
  tags.lastIndex = from;
  let depth = 0;
  for (let m = tags.exec(xml); m; m = tags.exec(xml)) {
    depth += m[0] === '</w:tbl>' ? -1 : 1;
    if (depth === 0) return tags.lastIndex;
  }
  return xml.length;
}

/** A Word table as a markdown table, its first row as the header. A table
 *  inside a cell comes through as that cell's text. */
function wordTable(xml: string): string {
  const rows = xml.split('</w:tr>')
    .map((r) => r.split('</w:tc>').slice(0, -1).map((c) =>
      c.split('</w:p>').map((p) => oneLine(wordRuns(p))).filter(Boolean).join(' ').replace(/\|/g, '\\|')))
    .filter((cells) => cells.some((c) => c));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

/** A paragraph's text, keeping tabs and line breaks. `<w:t>` is a run of text;
 *  `<w:tab w:val=...>` (a tab STOP, not a tab character) and `<w:delText>`
 *  (tracked deletions) never match. */
function wordRuns(p: string): string {
  let line = '';
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g)) {
    if (m[1] !== undefined) line += decodeXml(m[1]);
    else line += m[0].startsWith('<w:tab') ? '\t' : '\n';
  }
  return line;
}

const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

function readSlides(files: Record<string, Uint8Array>): string {
  const numbered = (re: RegExp) =>
    Object.keys(files)
      .map((n) => ({ n, i: Number(n.match(re)?.[1]) }))
      .filter((x) => Number.isFinite(x.i))
      .sort((a, b) => a.i - b.i); // numeric: slide2 before slide10

  let ordered = numbered(/^ppt\/slides\/slide(\d+)\.xml$/);
  if (files['ppt/presentation.xml']) {
    // Part names survive a reorder in PowerPoint. The presentation's slide-id
    // list, not slide1.xml/slide2.xml, defines the owner's displayed sequence.
    const targets = new Map<string, string>();
    const rels = files['ppt/_rels/presentation.xml.rels'];
    for (const m of (rels ? strFromU8(rels) : '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = attr(m[1], 'Id');
      const target = attr(m[1], 'Target');
      if (!id || !target || !attr(m[1], 'Type')?.endsWith('/slide') || attr(m[1], 'TargetMode') === 'External') continue;
      const path = decodeXml(target);
      // ZIP entry paths always use '/', including when the app runs on Windows.
      targets.set(id, posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join('ppt', path)));
    }
    ordered = [];
    const seen = new Set<string>();
    let position = 0;
    for (const m of strFromU8(files['ppt/presentation.xml']).matchAll(/<p:sldId\b([^>]*)\/?>/g)) {
      position++;
      const n = targets.get(attr(m[1], 'r:id') ?? '');
      // A broken manifest must not silently fall back to a guessed order.
      if (!n || !files[n]) throw new Error('Missing presentation slide');
      // Untrusted slide lists can repeat one part thousands of times. Read it
      // only at its first position, even if different relationships name it.
      if (seen.has(n)) continue;
      seen.add(n);
      ordered.push({ n, i: position });
    }
  }

  const slides = ordered
    .map(({ n, i }) => {
      const t = drawingParagraphs(strFromU8(files[n]));
      return t ? `Slide ${i}\n${t}` : '';
    })
    .filter(Boolean);

  const notes = numbered(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/)
    .map(({ n }) => drawingParagraphs(strFromU8(files[n])))
    .filter(Boolean);

  return [...slides, ...(notes.length ? [`Speaker notes\n${notes.join('\n\n')}`] : [])].join('\n\n');
}

/** Paragraph text from DrawingML (PowerPoint shapes). */
function drawingParagraphs(xml: string): string {
  return xml
    .split('</a:p>')
    .map((p) => {
      let line = '';
      for (const m of p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<a:br(?:\s[^>]*)?\/>/g)) {
        line += m[1] !== undefined ? decodeXml(m[1]) : '\n';
      }
      return line;
    })
    .filter((l) => l.trim())
    .join('\n');
}

function readSheets(files: Record<string, Uint8Array>): string {
  // Excel writes SpreadsheetML as the default namespace (<row>), but the Open
  // XML SDK and ClosedXML, which many business systems export with, write the
  // same elements with a prefix (<x:row>). The patterns below match bare names,
  // so without this a workbook from those systems reads as having no text.
  const xml = (name: string) => (files[name] ? localNames(strFromU8(files[name])) : '');

  // Shared strings: most text cells hold an index into this table. Phonetic
  // guides (<rPh>) are furigana, not content.
  const shared = [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)]
      .map((t) => decodeXml(t[1]))
      .join('')
  );

  // Sheet names live in workbook.xml; which file each one is lives in its rels.
  const targets = new Map<string, string>();
  for (const m of xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const out: string[] = [];
  for (const m of xml('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(attr(m[1], 'name') ?? 'Sheet');
    const path = targets.get(attr(m[1], 'r:id') ?? '');
    if (!path || !files[path]) continue;
    const rows = sheetRows(xml(path), shared);
    if (rows.length) out.push(`Sheet: ${name}\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}

/** Rows as tab-separated values, with empty cells kept so columns stay aligned. */
function sheetRows(xml: string, shared: string[]): string[] {
  const rows: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    // `<c\b` does not match `<col` or `<cols`: the letter after `c` breaks the boundary.
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = columnIndex(attr(c[1], 'r'));
      const value = cellValue(attr(c[1], 't'), c[2] ?? '', shared);
      if (col === null) cells.push(value);
      else cells[col] = value;
    }
    const line = Array.from(cells, (v) => v ?? '').join('\t');
    if (line.trim()) rows.push(line.replace(/\t+$/, ''));
  }
  return rows;
}

function cellValue(type: string | null, inner: string, shared: string[]): string {
  if (type === 'inlineStr') {
    return [...inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => decodeXml(t[1])).join('');
  }
  const v = inner.match(/<v>([^<]*)<\/v>/)?.[1];
  if (v === undefined) return '';
  if (type === 's') return shared[Number(v)] ?? '';
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  // 'str' (a formula's text result), 'e' (an error like #DIV/0!), numbers.
  // Dates are stored as serial numbers; telling them apart needs styles.xml,
  // which isn't worth it for search.
  return decodeXml(v);
}

/** "C7" → 2. Null when the cell carries no reference (then it's appended in order). */
function columnIndex(ref: string | null): number | null {
  const letters = ref?.match(/^([A-Z]+)/)?.[1];
  if (!letters) return null;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function readPdf(srcPath: string): Promise<DocExtraction> {
  const pages: string[] = [];
  let total: number;
  try {
    // unpdf is ESM-only; main already loads ESM packages this way (tunnelmole,
    // electron-updater). It bundles a Node-ready PDF.js — no pdftotext needed.
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(srcPath)));
    total = pdf.numPages;
    // Each page's text the way unpdf's extractText joins it.
    for (let i = 1; i <= Math.min(total, MAX_PDF_PAGES); i++) {
      const { items } = await (await pdf.getPage(i)).getTextContent();
      pages.push(items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join(''));
    }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    return {
      kind: 'unreadable',
      reason: /password/i.test(msg)
        ? 'This PDF is protected by a password. Remove the password and add it again.'
        : 'This PDF could not be read. It may be damaged.'
    };
  }

  const text = tidy(
    pages
      .map((p, i) => (p.trim() ? (pages.length > 1 ? `Page ${i + 1}\n${p}` : p) : ''))
      .filter(Boolean)
      .join('\n\n')
  );
  if (text) {
    const note = total > MAX_PDF_PAGES ? `\n\n[Only the first ${MAX_PDF_PAGES} pages of this PDF were read.]` : '';
    return { kind: 'text', text: text + note, extractor: 'pdfjs@1', modality: 'pdf', mime: MIME.pdf };
  }

  // No text layer: common for a small business — a scanned receipt, a signed
  // contract. Read the page images with the computer's built-in OCR.
  const ocr = await ocrFile(srcPath, 'pdf');
  if (ocr.ok) {
    const read = tidy(
      ocr.pages
        .map((p, i) => (p.trim() ? (ocr.pages.length > 1 ? `Page ${i + 1}\n${p}` : p) : ''))
        .filter(Boolean)
        .join('\n\n')
    );
    if (read) {
      const note = ocr.truncated ? `\n\n[Only the first ${MAX_OCR_PAGES} pages of this scan were read.]` : '';
      return { kind: 'text', text: read + note, extractor: ocr.extractor, modality: 'pdf', mime: MIME.pdf };
    }
  }
  return {
    kind: 'unreadable',
    reason: ocr.ok
      ? 'This PDF is a scan or a photo, and no writing could be read from it. It may be too faint or blurry.'
      : ocr.reason === 'timeout'
        ? 'This scanned PDF took too long to read. Try a shorter one, or split it.'
        : ocr.reason === 'no-language'
          ? 'This PDF is a scan or a photo, and Windows can\'t read text in your language yet. In Windows Settings, open Time & language, then Language & region, and add the language it is written in.'
          : ocr.reason === 'failed'
            ? 'This PDF is a scan or a photo, and it could not be read. Try a clearer scan, or save it as a picture and add that.'
            : 'This PDF has no text in it. It\'s probably a scan or a photo, and scans can only be read on a Mac or a Windows PC for now.'
  };
}

// ─── Images, via the computer's built-in OCR ─────────────────────────────────

/**
 * A photo of a menu or a receipt has text worth finding. One without writing
 * (a product photo) is still stored — kg-core keeps the file and indexes its
 * name and caption — so it falls back to passthrough rather than a refusal.
 */
async function readImage(srcPath: string, ext: string): Promise<DocExtraction> {
  const ocr = await ocrFile(srcPath, 'image');
  if (!ocr.ok) return { kind: 'passthrough' };
  const text = tidy(ocr.pages.join('\n'));
  return text
    ? { kind: 'text', text, extractor: ocr.extractor, modality: 'image', mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` }
    : { kind: 'passthrough' };
}

// ─── Older formats, via macOS's built-in converter ───────────────────────────

async function readWithTextutil(srcPath: string, ext: string): Promise<DocExtraction> {
  if (process.platform !== 'darwin') {
    return {
      kind: 'unreadable',
      reason: `.${ext} files can only be read on a Mac for now. Save it as Word (.docx) or PDF, and add that instead.`
    };
  }
  // Async: this runs in the main process during knowledge ingest, and a sync
  // call would freeze every window for as long as textutil takes (up to 30s).
  let out: string;
  try {
    out = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/textutil', ['-convert', 'txt', '-stdout', srcPath], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024
      }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
  } catch {
    return { kind: 'unreadable', reason: 'This file could not be read. It may be damaged or protected by a password.' };
  }
  const text = tidy(out);
  if (!text) return { kind: 'unreadable', reason: 'This file has no text in it to read.' };
  return { kind: 'text', text, extractor: 'textutil@1', modality: 'doc', mime: ownValue(MIME, ext) ?? 'text/plain' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A NUL byte in the first 8 KB means binary. Real text files never contain one. */
function looksBinary(srcPath: string): boolean {
  try {
    // Read only the first 8 KB: a text file here can be up to 100 MB.
    const fd = openSync(srcPath, 'r');
    try {
      const head = Buffer.alloc(8192);
      const n = readSync(fd, head, 0, 8192, 0);
      return head.subarray(0, n).includes(0);
    } finally {
      closeSync(fd);
    }
  } catch {
    return true;
  }
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Every tag reduced to its local name: `<x:row>` reads as `<row>`. Only the
 *  name right after `<` or `</` changes, so attributes such as `r:id` keep
 *  their prefix, and text is untouched because it cannot hold a raw `<`. */
function localNames(xml: string): string {
  return xml.replace(/<(\/?)[\w.-]+:/g, '<$1');
}

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, e: string) => {
    switch (e) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return '\'';
    }
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
