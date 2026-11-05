/**
 * One safe folder name, for the main process and the hire wizard alike.
 *
 * The wizard works out a new hire's folder path in the renderer and the main
 * process checks and makes it, so both clean a name with this one function:
 * two cleaners drifted apart once ("A  B" and "CON" came out differently), and
 * the folder the wizard made was not the one main looked for.
 *
 * Pure: no fs, no electron.
 */

import { clipUnits } from './cutText';

/** The longest folder name, in UTF-16 units. */
export const FOLDER_NAME_MAX = 60;
/** Names Windows reserves for devices; a folder by one of these can't be opened
 *  there. Windows reads only the part before the first dot, so `CON.txt` is one. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * One safe folder name from anything a person or a pack might supply.
 *
 * "A/B Consulting" → "A-B Consulting", "../../x" → "x", "  Café  " → "Café".
 * Returns `fallback` when nothing usable is left.
 */
export function cleanFolderName(raw: string, fallback: string): string {
  let name = String(raw ?? '')
    // Path separators and characters Windows forbids become a dash; control
    // characters disappear.
    .replace(/[\\/:*?"<>|]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot makes a hidden folder (and ".." climbs out); Windows strips
    // trailing dots and spaces, which would make two names collide.
    .replace(/^[.\s-]+/, '')
    .replace(/[.\s]+$/, '');

  // The trailing strip runs again after the cut: a name cut mid word can end in
  // a '.' or ' ' that Windows drops, so the folder on disk would not match.
  if (name.length > FOLDER_NAME_MAX) name = clipUnits(name, FOLDER_NAME_MAX).replace(/[.\s]+$/, '');
  if (!name) return fallback;
  // The suffix goes before the first dot, so `CON.txt` becomes `CON-folder.txt`.
  if (WINDOWS_RESERVED.test(name)) name = name.replace(/^[^.]*/, (device) => `${device}-folder`);
  return name;
}

/**
 * `base` with `suffix` after it, as one clean folder name that keeps the whole
 * suffix: the base is shortened to make room, so `<a long role>_Jim` and
 * `<a long role>_Jim_2` stay two folders instead of both being cut back to
 * `<a long role>`.
 */
export function suffixedFolderName(base: string, suffix: string): string {
  const room = Math.max(1, FOLDER_NAME_MAX - suffix.length);
  return cleanFolderName(`${clipUnits(base, room).replace(/[.\s]+$/, '')}${suffix}`, suffix);
}
