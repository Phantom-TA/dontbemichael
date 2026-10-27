/**
 * "Settings, Connections, Mailboxes" in agent text becomes the same link an
 * agent writes as `[…](dbm:settings/connections/mailboxes)`, which
 * MarkdownPreview draws as a button (docs/designs/settings-links-in-replies.md).
 *
 * The comma, ">", "›" and "→" forms are read. Only our own section names count,
 * then a group of that section when the next words name one; the match stops
 * at the first word that is not in the table ("…, Mailboxes and choose Fix").
 * A path that follows another name ("HubSpot → Settings → Integrations") is
 * another app's and stays words, as does text already in a link or code.
 */
import { placeHref, placeNames, type Place } from '@shared/settingsPlaces';

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const SEP = '\\s*(?:,|>|›|→)\\s*';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let pattern: { re: RegExp; groupRe: RegExp; sections: ReturnType<typeof placeNames> } | null = null;
function compiled() {
  if (pattern) return pattern;
  const sections = placeNames();
  const re = new RegExp(`\\bSettings${SEP}(${sections.map((s) => escape(s.section)).join('|')})(?![A-Za-z])`, 'g');
  const groupRe = new RegExp(`^${SEP}(${sections.flatMap((s) => s.groups.map(([, name]) => escape(name))).join('|') || '(?!)'})(?![A-Za-z])`);
  pattern = { re, groupRe, sections };
  return pattern;
}

/** Another app's path: a separator (or a comma joining a name) right before. */
function followsAnotherName(text: string, at: number): boolean {
  const before = text.slice(0, at).trimEnd();
  return /[>›→,]$/.test(before);
}

/** The places named in a piece of plain text, with where each sits. */
export function spotPlaces(text: string): { start: number; end: number; place: Extract<Place, { kind: 'settings' }> }[] {
  const { re, groupRe, sections } = compiled();
  const out: { start: number; end: number; place: Extract<Place, { kind: 'settings' }> }[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (followsAnotherName(text, m.index)) continue;
    const entry = sections.find((s) => s.section === m![1])!;
    let end = m.index + m[0].length;
    let place: Extract<Place, { kind: 'settings' }> = { kind: 'settings', section: entry.section };
    const g = groupRe.exec(text.slice(end));
    const group = g ? entry.groups.find(([, name]) => name === g[1]) : undefined;
    if (g && group) { place = { ...place, group: group[0] }; end += g[0].length; }
    out.push({ start: m.index, end, place });
    re.lastIndex = end;
  }
  return out;
}

function splitText(node: MdNode): MdNode[] | null {
  const value = node.value ?? '';
  const found = spotPlaces(value);
  if (!found.length) return null;
  const out: MdNode[] = [];
  let at = 0;
  for (const f of found) {
    if (f.start > at) out.push({ type: 'text', value: value.slice(at, f.start) });
    out.push({ type: 'link', url: placeHref(f.place), children: [{ type: 'text', value: value.slice(f.start, f.end) }] });
    at = f.end;
  }
  if (at < value.length) out.push({ type: 'text', value: value.slice(at) });
  return out;
}

function walk(node: MdNode): void {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      const parts = splitText(child);
      if (parts) { next.push(...parts); continue; }
    } else walk(child);
    next.push(child);
  }
  node.children = next;
}

export function remarkSettingsLinks() {
  return (tree: MdNode) => { walk(tree); };
}
