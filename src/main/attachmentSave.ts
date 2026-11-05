/**
 * Writes an email attachment into a team member's folder
 * (docs/designs/agent-save-attachment.md). The file comes from outside the
 * business, so nothing here trusts its name: it lands in one known subfolder,
 * never replaces anything, is never executable, and carries the mark the
 * operating system puts on a download. The app never launches it by itself.
 */

import { execFile } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, rmSync, writeFileSync, type Stats } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { attachmentKind } from '../shared/attachmentKind';
import { cleanFolderName } from '../shared/folderName';

/** The biggest attachment a member saves, about what email carries at all. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** The subfolder saved attachments go to, inside the member's own folder. */
export const ATTACHMENTS_FOLDER = 'Email attachments';

const COPIES_MAX = 50;

export class AttachmentSaveError extends Error {}

/** The files the app saved since it opened, known by identity and not by path.
 *  A member's shell can swap a folder for a link at any moment, and no path
 *  check holds against that, so only these go on to a teammate. */
const savedFiles = new Set<string>();
const fileId = (st: Stats): string => `${st.dev}:${st.ino}:${st.birthtimeMs}`;

/** What the operating system marks a download with. Best effort: a file with
 *  no mark is still not executable and is still never opened by the app. */
export function markFromOutside(path: string): void {
  if (process.platform === 'darwin') {
    const value = `0081;${Math.floor(Date.now() / 1000).toString(16)};Don't Be Michael;`;
    execFile('xattr', ['-w', 'com.apple.quarantine', value, path], (e) => { if (e) console.warn('[mail] attachment mark:', e.message); });
  } else if (process.platform === 'win32') {
    try { writeFileSync(`${path}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n'); } catch (e) { console.warn('[mail] attachment mark:', e); }
  }
}

/** The file's name without its ending, safe on every system. */
export function attachmentStem(name: string): string {
  const base = basename(name.replace(/\\/g, '/')).replace(/\.[^.]*$/, '');
  return cleanFolderName(base, 'attachment');
}

/** The subfolder when it is a plain folder of the member's own, else null. A
 *  member's shell writes its folder, so a link here could lead anywhere. */
function plainAttachmentsDir(realFolder: string): string | null {
  const dir = join(realFolder, ATTACHMENTS_FOLDER);
  const st = lstatSync(dir);
  return st.isDirectory() && !st.isSymbolicLink() && realpathSync(dir) === dir ? dir : null;
}

/** The subfolder, made if need be. Refused when anything on the way is a link
 *  that leads out of the member's folder. */
function attachmentsDir(folder: string): string {
  let real: string;
  try { real = realpathSync(folder); } catch { throw new AttachmentSaveError('Your folder could not be found.'); }
  const dir = join(real, ATTACHMENTS_FOLDER);
  try {
    mkdirSync(dir, { recursive: true });
    if (plainAttachmentsDir(real)) return dir;
  } catch (e) {
    throw new AttachmentSaveError(`The ${ATTACHMENTS_FOLDER} folder could not be made: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}.`);
  }
  throw new AttachmentSaveError(`${ATTACHMENTS_FOLDER} in your folder is not a plain folder, so nothing was saved.`);
}

/** Saves the bytes under a name of their own and returns its path. The same
 *  file saved again returns the first copy, so a retry leaves no duplicates. */
export function saveAttachmentFile(
  input: { folder: string; name: string; ending: string; bytes: Buffer },
  mark: (path: string) => void = markFromOutside
): string {
  const dir = attachmentsDir(input.folder);
  const stem = attachmentStem(input.name);
  for (let n = 1; n <= COPIES_MAX; n++) {
    const path = join(dir, `${stem}${n === 1 ? '' : ` (${n})`}.${input.ending}`);
    let fd: number;
    try {
      // Exclusive and no following a link: nothing already there is touched.
      fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw new AttachmentSaveError(`The file could not be saved: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}.`);
      try {
        const same = readPlainFile(path);
        if (same?.bytes.equals(input.bytes)) {
          savedFiles.add(fileId(same.st));
          return path;
        }
      } catch { /* try the next name */ }
      continue;
    }
    let failed: NodeJS.ErrnoException | undefined;
    try {
      writeFileSync(fd, input.bytes);
      savedFiles.add(fileId(fstatSync(fd)));
    } catch (e) { failed = e as NodeJS.ErrnoException; } finally { closeSync(fd); }
    if (failed) {
      // Half a file under this name would pass for the attachment.
      rmSync(path, { force: true });
      throw new AttachmentSaveError(`The file could not be saved: ${failed.code ?? 'unknown error'}.`);
    }
    mark(path);
    return path;
  }
  throw new AttachmentSaveError('Too many files with this name in your Email attachments folder.');
}

/** A file's bytes and identity through one open handle. Null when it is not a
 *  plain file with one name. Never blocks: a named pipe with no writer would
 *  otherwise stop the whole app. */
function readPlainFile(path: string): { bytes: Buffer; st: Stats } | null {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) return null;
    if (st.size > ATTACHMENT_MAX_BYTES) throw new AttachmentSaveError('That file is too big to send on.');
    const bytes = Buffer.alloc(st.size);
    let got = 0;
    while (got < st.size) {
      const n = readSync(fd, bytes, got, st.size - got, got);
      if (n === 0) break;
      got += n;
    }
    return { bytes: bytes.subarray(0, got), st };
  } finally { closeSync(fd); }
}

/**
 * A file one member asked another for: the file the sender saved travels with
 * the sender's message and lands in the asker's own folder. Neither member
 * opens the other's folder (owner, 2026-10-31): the app does the copying, and
 * only of a file the app saved, checked again as it leaves. Returns where it
 * landed.
 */
export function handOverAttachment(
  input: { file: string; fromFolder: string; toFolder: string },
  mark: (path: string) => void = markFromOutside
): string {
  let real: string;
  let own: string | null;
  try {
    own = plainAttachmentsDir(realpathSync(input.fromFolder));
    real = realpathSync(input.file);
  } catch { throw new AttachmentSaveError('That file could not be found. Save it with save_attachment first.'); }
  // Saves are flat, so nothing below the folder is the app's.
  const file = own && relative(own, real) === basename(real) ? readPlainFile(real) : null;
  if (!file) throw new AttachmentSaveError(`Only a file from your own ${ATTACHMENTS_FOLDER} folder can go with a message.`);
  if (!savedFiles.has(fileId(file.st))) throw new AttachmentSaveError('The app does not know that file. Save it with save_attachment again, then send it.');
  const { bytes } = file;
  const kind = attachmentKind(bytes, basename(real));
  if (!kind) throw new AttachmentSaveError('That is not a kind of file the office takes in, so it was not sent on.');
  return saveAttachmentFile({ folder: input.toFolder, name: basename(real), ending: kind.ending, bytes }, mark);
}
