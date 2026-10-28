/**
 * The file tab's Copy (docs/designs/copy-document.md): a document goes on the
 * clipboard as formatted HTML and clean text in one write, so Gmail or Docs
 * keep the formatting and a plain box gets the words; a picture goes on as a
 * picture. Electron's clipboard and nativeImage are passed in, so tests drive
 * these with fakes.
 */

export type CopyResult = { ok: true } | { ok: false; error: string };

export interface RichClipboard {
  write(data: { text?: string; html?: string }): void;
  writeImage(image: unknown): void;
}

export interface ImageMaker {
  createFromBuffer(buffer: Buffer): { isEmpty(): boolean };
}

const fail = (error: unknown): CopyResult => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

/** Text, and HTML when given, in one clipboard write. */
export function copyRich(clipboard: RichClipboard, input: unknown): CopyResult {
  const { text, html } = (input ?? {}) as { text?: unknown; html?: unknown };
  if (typeof text !== 'string') return { ok: false, error: 'invalid text' };
  if (html !== undefined && typeof html !== 'string') return { ok: false, error: 'invalid html' };
  if (!text && !html) return { ok: false, error: 'nothing to copy' };
  try {
    // The charset keeps accented and non Latin words intact where a paste
    // target reads the HTML flavor without assuming UTF-8.
    clipboard.write(html ? { text, html: `<meta charset="utf-8">${html}` } : { text });
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** A PNG the renderer drew from the picture it shows. */
export function copyImage(clipboard: RichClipboard, nativeImage: ImageMaker, bytes: unknown): CopyResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return { ok: false, error: 'invalid image' };
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    if (image.isEmpty()) return { ok: false, error: 'unreadable image' };
    clipboard.writeImage(image);
    return { ok: true };
  } catch (e) { return fail(e); }
}
