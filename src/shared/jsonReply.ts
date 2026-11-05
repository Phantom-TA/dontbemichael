/**
 * A hidden model call's JSON answer, read the forgiving way (issues 676, 677):
 * the whole span between the first "{" and the last "}", then the first whole
 * object alone (a note after it may hold braces of its own), each as written
 * and then with raw line breaks inside its strings escaped. Pure: main, the
 * renderer and the tests share it.
 */

/** The first whole JSON object in a reply, read with string awareness, so a
 *  note after it with braces of its own does not break it. */
function firstObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Raw line breaks and tabs inside JSON strings, escaped: a model writing a
 *  long job sometimes leaves them raw, which JSON.parse refuses. */
function escapeRawControls(json: string): string {
  let out = '', inString = false, escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) { escaped = false; out += ch; continue; }
      if (ch === '\\') { escaped = true; out += ch; continue; }
      if (ch === '"') inString = false;
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/** The reply as an object: the whole span, then the first object, each as
 *  written and then with raw line breaks escaped. */
export function readObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const spans = [end > start && start >= 0 ? text.slice(start, end + 1) : null, firstObject(text)].filter((x): x is string => !!x);
  for (const span of spans) {
    for (const candidate of [span, escapeRawControls(span)]) {
      try {
        const o = JSON.parse(candidate) as unknown;
        if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
      } catch { /* the next form */ }
    }
  }
  return null;
}
