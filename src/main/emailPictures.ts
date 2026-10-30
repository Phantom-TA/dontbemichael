/**
 * Show pictures for the owner's email tab (docs/designs/original-email-view.md,
 * R2 and R6): main fetches the email's pictures from the web and hands them to
 * the tab as `data:` URIs, so the tab's frame never reaches the network.
 *
 * An email is written by anyone, so its addresses are untrusted. Each request
 * checks the address it actually connects to (a `lookup` that refuses anything
 * but global unicast), so a name that resolves to this Mac or the local
 * network, a redirect there, or DNS answering differently the second time
 * never reaches it. Redirects are followed by hand, each hop through the same
 * check. No cookies, no Referer. Only real pictures are kept, judged by their
 * first bytes, never by the type the server claims.
 */
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { PICTURES_MAX } from '../shared/emailFrame';

export const PICTURE_MAX_BYTES = 5 * 1024 * 1024;
export const PICTURES_TOTAL_BYTES = 15 * 1024 * 1024;
export const PICTURE_TIMEOUT_MS = 5_000;
export const PICTURES_TOTAL_MS = 15_000;
export const PICTURES_AT_ONCE = 4;
export const PICTURE_REDIRECTS = 3;

/** True for an address on the open internet: not this Mac, the local
 *  network, link local (cloud metadata included), shared, multicast or reserved. */
export function isGlobalAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || ip.startsWith('192.0.0.') || ip.startsWith('192.0.2.'))) return false;
    if (a === 198 && (b === 18 || b === 19 || ip.startsWith('198.51.100.'))) return false;
    if (ip.startsWith('203.0.113.')) return false;
    return true;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isGlobalAddress(mapped[1]);
    if (s === '::' || s === '::1') return false;
    if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff') || s.startsWith('2001:db8') || s.startsWith('64:ff9b')) return false;
    return true;
  }
  return false;
}

/** A DNS lookup that answers only when every address is allowed (global). */
export function guardedLookup(base: typeof dnsLookup = dnsLookup, allowed: (ip: string) => boolean = isGlobalAddress): LookupFunction {
  return ((host: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    base(host, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err, '', 0);
      const list = (Array.isArray(addrs) ? addrs : []) as LookupAddress[];
      if (!list.length || list.some((a) => !allowed(a.address))) {
        const e = new Error(`Refused a picture from a private address (${host}).`) as NodeJS.ErrnoException;
        e.code = 'EPRIVATE';
        return cb(e, '', 0);
      }
      if ((options as { all?: boolean }).all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  }) as LookupFunction;
}

/** The picture type its first bytes show, or null for anything else (SVG included). */
export function pictureType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  return null;
}

export interface PictureDeps {
  /** The DNS lookup the guard wraps (tests answer names themselves). */
  dnsLookup?: typeof dnsLookup;
  /** Which addresses may be reached: global ones in the app; a test adds its
   *  own local server. */
  allowed?: (ip: string) => boolean;
}

/** One picture, or null when it is refused, fails, is too big or is not a picture. */
export async function fetchPicture(url: string, budget: { bytes: number; until: number }, deps: PictureDeps = {}): Promise<string | null> {
  let at = url;
  for (let hop = 0; hop <= PICTURE_REDIRECTS; hop++) {
    let u: URL;
    try { u = new URL(at); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !(deps.allowed ?? isGlobalAddress)(host)) return null;
    const left = Math.min(PICTURE_TIMEOUT_MS, budget.until - Date.now());
    if (left <= 0) return null;
    const res = await getOnce(u, left, Math.min(PICTURE_MAX_BYTES, budget.bytes), deps).catch(() => null);
    if (!res) return null;
    if (res.redirect) { at = new URL(res.redirect, u).toString(); continue; }
    const type = pictureType(res.body);
    if (!type) return null;
    budget.bytes -= res.body.length;
    return `data:${type};base64,${res.body.toString('base64')}`;
  }
  return null;
}

function getOnce(u: URL, timeoutMs: number, maxBytes: number, deps: PictureDeps): Promise<{ redirect?: string; body: Buffer } | null> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
      lookup: guardedLookup(deps.dnsLookup ?? dnsLookup, deps.allowed ?? isGlobalAddress),
      timeout: timeoutMs
    }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) { res.resume(); resolve({ redirect: res.headers.location, body: Buffer.alloc(0) }); return; }
      if (code !== 200) { res.resume(); resolve(null); return; }
      const parts: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(); resolve(null); return; }
        parts.push(c);
      });
      res.on('end', () => resolve({ body: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Every picture of one email, at most PICTURES_AT_ONCE at a time, within the
 *  total size and time. Keyed by the address as the email wrote it. */
export async function fetchPictures(urls: Array<{ raw: string; url: string }>, deps: PictureDeps = {}): Promise<{ pictures: Record<string, string>; failed: number }> {
  const list = urls.slice(0, PICTURES_MAX);
  const budget = { bytes: PICTURES_TOTAL_BYTES, until: Date.now() + PICTURES_TOTAL_MS };
  const pictures: Record<string, string> = {};
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const item = list[next++];
      const data = budget.bytes > 0 ? await fetchPicture(item.url, budget, deps) : null;
      if (data) pictures[item.raw] = data; else failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PICTURES_AT_ONCE, list.length) }, worker));
  return { pictures, failed };
}
