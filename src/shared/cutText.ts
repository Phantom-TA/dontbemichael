/** Graphemes, not UTF-16 units: an emoji, a flag, a family or an accented
 *  letter is one character to the owner and is never cut in half. */
const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text); // code points: never splits a surrogate pair
}

/** `text` when it fits in `max` characters, else its first `max - 1`
 *  characters and "…". At most `max` characters either way. */
export function cutText(text: string, max: number): string {
  if (!text) return '';
  const limit = Math.floor(max);
  if (!(limit >= 1)) return '';          // max <= 0 or NaN
  if (text.length <= limit) return text; // fast path: units >= graphemes
  const parts = graphemes(text);
  if (parts.length <= limit) return text;
  if (limit === 1) return '…';
  return `${parts.slice(0, limit - 1).join('')}…`;
}

/** `text` cut to at most `max` UTF-16 units, with no "…", and never ending in
 *  half an emoji. For a name held to a unit limit (a folder name): the file
 *  system stores a lone half as U+FFFD, so the name on disk would differ from
 *  the name the app worked out. */
export function clipUnits(text: string, max: number): string {
  const limit = Math.floor(max);
  if (!(limit >= 1)) return '';          // max <= 0 or NaN
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const last = head.charCodeAt(limit - 1);
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head; // a high half lost its low half
}
