/**
 * The case study's logo read (docs/designs/case-study.md, D3, eng A3): the
 * one time the app itself, not Research, reads a web page, so it reads only
 * the business's own site and refuses anything that isn't the public internet.
 *
 *   readSiteLogo(site)
 *     https only (an http:// site is tried once over https)
 *     home page ─► same site redirects only, at most 3, each hop checked
 *       └─ icon links in its head: touch icon, icon, Open Graph image
 *     image ─► any public https host, redirects checked the same way
 *     every connection: the address is checked in the socket's own lookup,
 *       so a name can't resolve public for the check and private for the connect
 *     PNG, JPEG or WebP only (never SVG), size read from the header before
 *       decoding, then decoded and re-encoded to PNG by the caller's `decode`
 *
 * Plain node:https with no proxy: behind a proxy the read fails and the owner
 * picks a file (a recorded limit). No Electron import, so it tests as a node module.
 */
import { request } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

export type LogoFail = 'no-site' | 'private' | 'timeout' | 'too-big' | 'not-found' | 'not-image' | 'svg' | 'failed';
export type LogoResult = { ok: true; png: Buffer; colour: string | null } | { ok: false; reason: LogoFail };

export interface LogoLimits {
  /** The home page is read up to this many bytes, then stopped. */
  pageBytes: number;
  imageBytes: number;
  /** One time limit for the page and the image together. */
  totalMs: number;
  maxRedirects: number;
  /** Widest or tallest image side accepted, read from its header. */
  maxSide: number;
}
export const LOGO_LIMITS: LogoLimits = { pageBytes: 1_000_000, imageBytes: 2_000_000, totalMs: 10_000, maxRedirects: 3, maxSide: 4096 };

export interface LogoDeps {
  /** Decodes, re-encodes to PNG and samples the main colour; null when it isn't an image. */
  decode: (bytes: Buffer) => { png: Buffer; colour: string | null } | null;
  /** For tests: the name lookup and the request. */
  lookup?: typeof dnsLookup;
  get?: (url: URL, maxBytes: number, deadline: number, lookup: GuardedLookup) => Promise<Fetched>;
  now?: () => number;
}

export interface Fetched { status: number; headers: IncomingHttpHeaders; body: Buffer }
type GuardedLookup = (hostname: string, options: unknown, cb: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void) => void;

class LogoError extends Error { constructor(readonly reason: LogoFail) { super(reason); } }

// ---------------------------------------------------------------- addresses

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64]] as const) blocked.addSubnet(net, bits, 'ipv6');

/** The IPv4 address inside an IPv4 mapped or NAT64 IPv6 address, if any. */
function embeddedV4(ip: string): string | null {
  const m = /^(?:::ffff:|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True only for an address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return !blocked.check(ip, 'ipv4');
  if (v === 6) {
    const inner = embeddedV4(ip.toLowerCase());
    if (inner) return isPublicAddress(inner);
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

/** A lookup that refuses a name when any address it gives is not public,
 *  used as the socket's own lookup so the checked address is the one used. */
export function guardedLookup(base: typeof dnsLookup = dnsLookup): GuardedLookup {
  return (hostname, _options, cb) => {
    base(hostname, { all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = (addresses as unknown as LookupAddress[]) ?? [];
      if (!list.length || list.some((a) => !isPublicAddress(a.address))) return cb(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
      const options = _options as { all?: boolean } | undefined;
      if (options?.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

// ---------------------------------------------------------------- sites

/** The site's https URL, or null when the profile's text isn't a web address. */
export function siteUrl(site: string | undefined): URL | null {
  const t = (site ?? '').trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t.replace(/^http:/i, 'https:') : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u : null;
  } catch { return null; }
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc', 'or', 'ne', 'go']);
/** The registrable domain, closely enough for "the same site": www and the
 *  bare domain are one site; country second levels (co.uk) keep three labels. */
export function siteOf(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const n = labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-n).join('.');
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/** The page's own icon declarations, best first: touch icons, icons (largest
 *  first, SVG left out), then the Open Graph image. Read from the head only. */
export function iconUrls(html: string, base: URL): URL[] {
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)) || html.length);
  const touch: string[] = [], icons: Array<{ href: string; size: number }> = [], og: string[] = [];
  for (const tag of head.match(/<(link|meta)\b[^>]*>/gi) ?? []) {
    if (/^<link/i.test(tag)) {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase();
      const href = attr(tag, 'href');
      if (!href) continue;
      if ((attr(tag, 'type') ?? '').includes('svg') || /\.svg(\?|#|$)/i.test(href)) continue;
      if (rel.includes('apple-touch-icon')) touch.push(href);
      else if (/\bicon\b/.test(rel)) {
        const size = Math.max(0, ...((attr(tag, 'sizes') ?? '').match(/\d+/g) ?? ['0']).map(Number));
        icons.push({ href, size });
      }
    } else {
      const p = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
      const c = attr(tag, 'content');
      if (c && (p === 'og:image' || p === 'og:image:secure_url' || p === 'og:logo')) og.push(c);
    }
  }
  const all = [...touch, ...icons.sort((a, b) => b.size - a.size).map((i) => i.href), ...og];
  const out: URL[] = [];
  for (const h of all) {
    try {
      const u = new URL(h.replace(/&amp;/g, '&'), base);
      if (u.protocol === 'http:') u.protocol = 'https:';
      if (u.protocol === 'https:' && !out.some((o) => o.href === u.href)) out.push(u);
    } catch { /* a broken href */ }
  }
  return out;
}

// ---------------------------------------------------------------- images

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg' | null;
/** What the bytes are, by their signature (never by the server's word). */
export function imageKind(b: Buffer): ImageKind {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const start = b.toString('utf8', 0, Math.min(b.length, 512)).trimStart().toLowerCase();
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return 'svg';
  return null;
}

/** Width and height from the header, without decoding; null when unreadable. */
export function imageSize(b: Buffer, kind: ImageKind): { w: number; h: number } | null {
  try {
    if (kind === 'png' && b.length >= 24) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (kind === 'webp' && b.length >= 30) {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch { /* short or broken header */ }
  return null;
}

// ---------------------------------------------------------------- the read

function defaultGet(url: URL, maxBytes: number, deadline: number, lookup: GuardedLookup): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new LogoError('timeout'));
    const req = request(url, {
      method: 'GET', agent: false, lookup: lookup as never, timeout: left,
      headers: { 'user-agent': "Don't Be Michael case study logo", accept: 'text/html,image/png,image/jpeg,image/webp;q=0.9,*/*;q=0.1' }
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => { req.destroy(); reject(new LogoError('timeout')); }, Math.max(1, deadline - Date.now()));
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { clearTimeout(timer); req.destroy(); reject(new LogoError('too-big')); return; }
        chunks.push(c);
      });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }); });
      res.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    req.on('timeout', () => { req.destroy(); reject(new LogoError('timeout')); });
    req.on('error', (e) => reject((e as { code?: string }).code === 'EPRIVATE' ? new LogoError('private') : e));
    req.end();
  });
}

/**
 * Reads the business's logo from its own site. Never throws: every failure is
 * a reason the screen turns into "Pick your logo".
 */
export async function readSiteLogo(site: string | undefined, deps: LogoDeps, limits: LogoLimits = LOGO_LIMITS): Promise<LogoResult> {
  const start = siteUrl(site);
  if (!start) return { ok: false, reason: 'no-site' };
  const now = deps.now ?? Date.now;
  const deadline = now() + limits.totalMs;
  const lookup = guardedLookup(deps.lookup);
  const get = deps.get ?? defaultGet;
  const home = siteOf(start.hostname);

  const fetchUrl = async (first: URL, maxBytes: number, sameSite: boolean): Promise<{ url: URL; res: Fetched }> => {
    let url = first;
    for (let hop = 0; ; hop++) {
      if (url.protocol !== 'https:') throw new LogoError('not-found');
      if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) throw new LogoError('private');
      if (sameSite && siteOf(url.hostname) !== home) throw new LogoError('not-found');
      const res = await get(url, maxBytes, deadline, lookup);
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (hop >= limits.maxRedirects) throw new LogoError('not-found');
        url = new URL(String(res.headers.location), url);
        continue;
      }
      if (res.status !== 200) throw new LogoError('not-found');
      return { url, res };
    }
  };

  try {
    const page = await fetchUrl(start, limits.pageBytes, true);
    const candidates = iconUrls(page.res.body.toString('utf8'), page.url);
    if (!candidates.length) return { ok: false, reason: 'not-found' };
    let last: LogoFail = 'not-found';
    for (const u of candidates.slice(0, 4)) {
      try {
        const img = await fetchUrl(u, limits.imageBytes, false);
        const kind = imageKind(img.res.body);
        if (kind === 'svg') { last = 'svg'; continue; }
        if (!kind) { last = 'not-image'; continue; }
        const size = imageSize(img.res.body, kind);
        if (!size || size.w < 16 || size.h < 16) { last = 'not-image'; continue; }
        if (size.w > limits.maxSide || size.h > limits.maxSide) { last = 'too-big'; continue; }
        const done = deps.decode(img.res.body);
        if (!done) { last = 'not-image'; continue; }
        return { ok: true, ...done };
      } catch (e) {
        if (e instanceof LogoError && (e.reason === 'timeout' || e.reason === 'private')) return { ok: false, reason: e.reason };
        last = e instanceof LogoError ? e.reason : 'failed';
      }
    }
    return { ok: false, reason: last };
  } catch (e) {
    return { ok: false, reason: e instanceof LogoError ? e.reason : 'failed' };
  }
}
