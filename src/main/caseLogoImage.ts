/**
 * The case study's logo images (docs/designs/case-study.md, D3): a fetched or
 * picked logo decoded and kept as PNG with its main colour, and an SVG logo
 * drawn to PNG first. Electron's own decoders, so this lives apart from the
 * node-testable siteLogo.ts and is tested under Electron.
 */
import { BrowserWindow, nativeImage } from 'electron';
import { logoColour } from '../shared/caseStudy';
import { LOGO_LIMITS, imageKind, imageSize } from './siteLogo';

/** A logo's bytes as a kept PNG and its main colour: PNG, JPEG or WebP only,
 *  its size read from the header before nativeImage decodes it (eng A3, OE6). */
export function decodeCaseLogo(bytes: Buffer): { png: Buffer; colour: string | null } | null {
  const kind = imageKind(bytes);
  if (kind !== 'png' && kind !== 'jpeg' && kind !== 'webp') return null;
  const size = imageSize(bytes, kind);
  if (!size || size.w < 16 || size.h < 16 || size.w > LOGO_LIMITS.maxSide || size.h > LOGO_LIMITS.maxSide) return null;
  const img = nativeImage.createFromBuffer(bytes);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  // Wide header logos stay sharp at the page's size.
  const scale = Math.min(1, 512 / Math.max(width, height));
  const kept = scale < 1 ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : img;
  // toBitmap is BGRA; logoColour reads RGBA.
  const bgra = img.resize({ width: 32, height: 32, quality: 'good' }).toBitmap();
  const rgba = new Uint8Array(bgra.length);
  for (let i = 0; i + 3 < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = bgra[i + 3]; }
  return { png: kept.toPNG(), colour: logoColour(rgba) };
}
/**
 * An SVG logo drawn to PNG bytes (owner, 2026-11-03: many sites have no other
 * logo). It loads as an image in a hidden sandboxed window whose page allows
 * nothing but data images, so the SVG runs no script and loads nothing; its
 * shape comes from its own width and height or viewBox.
 */
export async function drawCaseSvg(svg: Buffer): Promise<Buffer | null> {
  if (svg.length > LOGO_LIMITS.imageBytes) return null;
  const text = svg.toString('utf8');
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const num = (name: string): number => { const m = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*([0-9.]+)`, 'i').exec(root); return m ? Number(m[1]) : 0; };
  const vb = /\bviewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(root);
  const w0 = num('width') || (vb ? Number(vb[1]) : 0) || 300;
  const h0 = num('height') || (vb ? Number(vb[2]) : 0) || 150;
  const k = Math.min(1024 / w0, 256 / h0);
  const w = Math.max(16, Math.round(w0 * k)), h = Math.max(16, Math.round(h0 * k));
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  try {
    const page = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'"><body></body>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`);
    const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;
    const draw = win.webContents.executeJavaScript(`new Promise((done) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; c.getContext('2d').drawImage(i, 0, 0, ${w}, ${h}); done(c.toDataURL('image/png')); }; i.onerror = () => done(null); i.src = ${JSON.stringify(src)}; })`, true) as Promise<string | null>;
    const url = await Promise.race([draw, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    return typeof url === 'string' && url.startsWith('data:image/png;base64,') ? Buffer.from(url.slice(22), 'base64') : null;
  } catch (e) {
    console.error('[case-study] svg logo', e);
    return null;
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
