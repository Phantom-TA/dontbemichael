/**
 * The letter a Ctrl or Cmd shortcut was pressed on, lower case.
 *
 * `key` follows the keyboard layout, so on Windows and Linux Ctrl+C on a
 * Russian, Arabic, Greek or Hebrew layout gives 'с', 'ؤ', 'ψ' or 'ב', never
 * 'c'. xterm still reads that press as Ctrl+C from its key code and sends the
 * program an interrupt, so the copy the owner asked for became a stop. When the
 * layout gives no Latin letter, the physical key (`code`) names it instead. A
 * Latin layout keeps its own letter, so Dvorak's C is still 'c'.
 *
 * Alt is never read from the physical key. On Windows AltGr arrives as
 * Ctrl+Alt, so a character typed with AltGr (Polish 'ć', Hungarian '&') would
 * otherwise turn into a copy or paste whenever it sits on the C or V key.
 *
 * Only a key that types one character falls back. An input method's key
 * (`Process`), a dead key (`Dead`) or `Unidentified` can arrive with
 * code 'KeyC', and xterm runs this handler before the input method sees it.
 */
export function shortcutLetter(ev: { key: string; code?: string; altKey?: boolean }): string {
  const key = ev.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const physical = ev.altKey || [...ev.key].length !== 1 ? null : /^Key([A-Z])$/.exec(ev.code ?? '');
  return physical ? physical[1].toLowerCase() : key;
}
