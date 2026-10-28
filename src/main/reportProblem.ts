/**
 * Report a problem, from the top bar button or Help ▸ Report a problem…
 * (docs/designs/report-problem-top-bar.md). One click takes a picture of the
 * app window, opens the prefilled bug report, then saves the picture to
 * Downloads and shows it, ready to drag into the form.
 *
 *   report(win) ── a report already starting? ──> { ok, ignored }
 *      │ capture(win), in memory, at most CAPTURE_LIMIT_MS (late: dropped)
 *      │ openExternal(report URL) ── rejects ──> { ok: false } (the button says so)
 *      │   the in flight mark clears here: the save below never blocks a new report
 *      └ saving: write Downloads/<name>.png (never overwrites) ──> showItemInFolder
 *
 * The report opens before anything is written, so the Mac's Downloads
 * permission prompt or a capture that never settles cannot hold it up. The
 * Electron parts are passed in, so tests drive this with fakes.
 */
import { join } from 'node:path';
import { reportProblemUrl } from '../shared/reportProblem';

export const CAPTURE_LIMIT_MS = 3000;

export interface ReporterDeps<W> {
  /** PNG bytes of the window, or null with no window or an empty image. */
  capture: (win: W | null) => Promise<Uint8Array | null>;
  wait: (ms: number) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  downloads: () => string;
  exists: (path: string) => boolean;
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
  showItemInFolder: (path: string) => void;
  now: () => Date;
  urlInputs: () => { appVersion: string; platform: string; arch: string; osVersion?: string; fingerprints?: readonly string[] };
  warn: (step: 'capture' | 'open' | 'save', error: unknown) => void;
}

export type ReportResult =
  | { ok: true; ignored?: true; saving?: Promise<string | null> }
  | { ok: false; error: string };

const two = (n: number) => String(n).padStart(2, '0');

/** "Don't Be Michael report 2026-10-26 20.15.png", " 2" and on when taken.
 *  Local time; no colons, which Windows refuses in a file name. */
export function pictureName(d: Date, n = 1): string {
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}`;
  return `Don't Be Michael report ${stamp}${n > 1 ? ` ${n}` : ''}.png`;
}

export function createReporter<W>(deps: ReporterDeps<W>) {
  let inFlight = false;

  const save = async (png: Uint8Array): Promise<string | null> => {
    try {
      const dir = deps.downloads();
      const at = deps.now();
      let n = 1;
      while (deps.exists(join(dir, pictureName(at, n)))) n++;
      // Two reports in the same minute can pick the same name; wx refuses the
      // second, which takes the next name (review, 2026-10-27).
      for (let tries = 0; ; tries++, n++) {
        const path = join(dir, pictureName(at, n));
        try {
          await deps.writeFile(path, png);
        } catch (e) {
          if ((e as { code?: string })?.code === 'EEXIST' && tries < 20) continue;
          throw e;
        }
        deps.showItemInFolder(path);
        return path;
      }
    } catch (e) {
      deps.warn('save', e);
      return null;
    }
  };

  return {
    async report(win: W | null): Promise<ReportResult> {
      if (inFlight) return { ok: true, ignored: true };
      inFlight = true;
      let png: Uint8Array | null = null;
      try {
        const shot = deps.capture(win).catch((e) => { deps.warn('capture', e); return null; });
        png = await Promise.race([shot, deps.wait(CAPTURE_LIMIT_MS).then(() => null)]);
        try {
          await deps.openExternal(reportProblemUrl(deps.urlInputs()));
        } catch (e) {
          deps.warn('open', e);
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      } finally {
        inFlight = false;
      }
      return png && png.byteLength ? { ok: true, saving: save(png) } : { ok: true };
    }
  };
}
