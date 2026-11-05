/**
 * The page the email tab's frame shows (docs/designs/original-email-view.md,
 * DD2, R2): the email as sent, on a white sheet, with nothing able to run,
 * navigate or reach the network.
 *
 * Three controls, the release drop's set (shared/releaseDrop.ts): the frame's
 * `sandbox="allow-popups"` (no scripts, no same origin, no forms, no top
 * navigation), the CSP below (`default-src 'none'`, pictures only as `data:`),
 * and main refusing every navigation of a frame (index.ts). The rewriting here
 * is the fourth, cheap one: tags that navigate (`<meta http-equiv>`, `<base>`)
 * go, and a link opens in a new window, which main hands to the browser.
 *
 * Pictures from the web are never loaded by the frame. Until the owner clicks
 * Show pictures each one is a blank; after it, main has fetched them (R6) and
 * each address is swapped for its `data:` copy.
 */

/** At most this many pictures from the web are fetched for one email. */
export const PICTURES_MAX = 40;

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const CSP = [
  "default-src 'none'",
  'img-src data:',
  "style-src 'unsafe-inline'",
  'font-src data:'
].join('; ');

// The address in src="…", background="…" and CSS url(…), quoted or not.
const ATTR_URL = /\b(src|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/gi;

const isRemote = (u: string): boolean => /^(https?:)?\/\//i.test(u.trim());

/** Each picture address from the web the email uses, as written, first seen
 *  first, at most PICTURES_MAX. */
export function remotePictureUrls(html: string): string[] {
  const out: string[] = [];
  const add = (u: string | undefined) => {
    const v = (u ?? '').trim();
    if (v && isRemote(v) && !out.includes(v) && out.length < PICTURES_MAX) out.push(v);
  };
  for (const m of html.matchAll(ATTR_URL)) add(m[3] ?? m[4] ?? m[5]);
  for (const m of html.matchAll(CSS_URL)) add(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** The address as written, made fetchable: HTML entities for `&` undone and a
 *  scheme added to `//host/...`. */
export function fetchableUrl(raw: string): string {
  const u = raw.trim().replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&').replace(/&#x0*26;/gi, '&');
  return u.startsWith('//') ? `https:${u}` : u;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function swapAddresses(html: string, swap: (u: string) => string | null): string {
  const one = (u: string): string => swap(u.trim()) ?? u;
  return html
    .replace(ATTR_URL, (all, name: string, _q, d?: string, s?: string, bare?: string) => {
      const u = d ?? s ?? bare ?? '';
      const next = one(u);
      return next === u ? all : `${name}="${next}"`;
    })
    .replace(CSS_URL, (all, d?: string, s?: string, bare?: string) => {
      const u = d ?? s ?? bare ?? '';
      const next = one(u);
      return next === u ? all : `url("${next}")`;
    });
}

export interface FrameInput {
  html: string | null;
  text: string;
  /** `cid:` pictures inside the email, by content id. */
  inline: Record<string, string>;
  /** Fetched web pictures by address as written, once the owner chose Show
   *  pictures; null before. */
  pictures: Record<string, string> | null;
}

/** The whole document for the frame's `srcdoc`. */
export function buildEmailFrame(input: FrameInput): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank">`
    + '<style>html,body{margin:0;background:#fff;color:#222}body{padding:20px 24px;font:14px/1.5 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;margin:0;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style>';
  if (input.html === null || !input.html.trim()) return `<!doctype html>${head}<pre>${escapeHtml(input.text)}</pre>`;
  const body = swapAddresses(
    input.html
      // A refresh or a base address could move the frame or its links.
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, ''),
    (u) => {
      const cid = /^cid:(.+)$/i.exec(u);
      if (cid) return input.inline[cid[1].replace(/^<|>$/g, '')] ?? BLANK;
      if (!isRemote(u)) return null;
      return input.pictures?.[u] ?? BLANK;
    }
  );
  // Before the email's own <html>: the parser puts these in its head first, so
  // the CSP is in force before any of the email is read.
  return `${head}${body}`;
}

/** Whether a frame inside the app window may go to `url` (main's
 *  `will-frame-navigate`). The window's own page is ruled by `will-navigate`;
 *  a frame (the email tab, a release drop) only ever shows its own `srcdoc`,
 *  so a link, a form or a refresh inside one never loads a page there. */
export function frameNavigationAllowed(url: string, isMainFrame: boolean): boolean {
  if (isMainFrame) return true;
  return url === 'about:srcdoc' || url === 'about:blank';
}
