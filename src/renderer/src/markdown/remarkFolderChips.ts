/**
 * A team folder named in a card's words becomes a chip that opens it: "the
 * Sales folder" or "Dwight's folder". The app spots the words itself, so a card
 * written before this works too, and no path from agent text is ever used:
 * the chip carries a member id and main opens the folder its settings name
 * (fs:openAgentFolder). Text inside code or a link stays as it is.
 *
 * Mail tools call labels folders, so a sentence about a mailbox is left alone,
 * unless it is about an attachment: an attachment goes to a folder on disk.
 */
import { RESEARCH_ID } from '../../../shared/research';

/** One team member as the card can name them. `folder` is the folder's name. */
export interface FolderMember { id: string; name: string; folder: string }

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

type Part = { text: string } | { words: string; agentId: string };

const MAIL_WORDS = /(?<![\p{L}\p{N}])(?:inbox(?:es)?|mailbox(?:es)?|e-?mails?|gmail|labels?|archived?|archives?)(?![\p{L}\p{N}])/iu;
const ATTACHMENT_WORDS = /(?<![\p{L}\p{N}])(?:attachments?|attached)(?![\p{L}\p{N}])/iu;

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spaced = (s: string): string => escaped(s).replace(/\s+/g, '\\s+');
const keyOf = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').replace(/’/g, "'");

/** Who the card can name: everyone but Research, whose folder holds no office work. */
export function folderTeam(agents: ReadonlyArray<{ id: string; name?: string; cwd?: string }>): FolderMember[] {
  return agents.filter((a) => a.id !== RESEARCH_ID).map((a) => ({
    id: a.id,
    name: (a.name ?? '').trim(),
    folder: (a.cwd ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.trim() ?? ''
  }));
}

/** Each phrase that names a member's folder, by its matching key. The first
 *  member to claim a phrase keeps it. */
function phrasesOf(team: readonly FolderMember[]): Map<string, { pattern: string; agentId: string }> {
  const out = new Map<string, { pattern: string; agentId: string }>();
  const add = (written: string, pattern: string, agentId: string): void => {
    const key = keyOf(written);
    if (!out.has(key)) out.set(key, { pattern, agentId });
  };
  for (const m of team) {
    if (m.folder) add(`${m.folder} folder`, `${spaced(m.folder)}\\s+folder`, m.id);
    if (m.name) add(`${m.name}'s folder`, `${spaced(m.name)}['’]s\\s+folder`, m.id);
  }
  return out;
}

function matcher(team: readonly FolderMember[]): { re: RegExp; phrases: Map<string, { pattern: string; agentId: string }> } | null {
  const phrases = phrasesOf(team);
  if (!phrases.size) return null;
  const all = [...phrases.values()].map((p) => p.pattern);
  return { re: new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${all.join('|')})(?![\\p{L}\\p{N}_-])`, 'giu'), phrases };
}

/** The sentence around `start`, within this run of text. */
function sentenceAt(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const from = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('\n')) + 1;
  const rest = text.slice(end).search(/[.?!](?:\s|$)|\n/);
  return text.slice(from, rest < 0 ? text.length : end + rest);
}

function aboutMail(sentence: string): boolean {
  return MAIL_WORDS.test(sentence) && !ATTACHMENT_WORDS.test(sentence);
}

/** The text split around the folders it names. Plain text alone comes back as one part. */
export function folderParts(text: string, team: readonly FolderMember[]): Part[] {
  const m = matcher(team);
  if (!m) return [{ text }];
  const parts: Part[] = [];
  let at = 0;
  for (const found of text.matchAll(m.re)) {
    const start = found.index ?? 0;
    const end = start + found[0].length;
    const hit = m.phrases.get(keyOf(found[0]));
    if (!hit || aboutMail(sentenceAt(text, start, end))) continue;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ words: found[0], agentId: hit.agentId });
    at = end;
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at) });
  return parts;
}

function walk(node: MdNode, team: readonly FolderMember[]): void {
  const children = node.children;
  if (!children) return;
  const out: MdNode[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      const parts = folderParts(child.value ?? '', team);
      if (parts.some((p) => 'words' in p)) {
        for (const p of parts) {
          out.push('words' in p
            ? { type: 'inlineCode', value: p.words, data: { hName: 'cth-folder', hProperties: { dataAgent: p.agentId } } }
            : { type: 'text', value: p.text });
        }
        continue;
      }
    } else if (child.type !== 'link' && child.type !== 'linkReference') {
      // Not into a link: a chip is a button, and a button never sits in a link.
      walk(child, team);
    }
    out.push(child);
  }
  node.children = out;
}

export function remarkFolderChips(options: { team: readonly FolderMember[] }) {
  return (tree: unknown): void => { walk(tree as MdNode, options.team); };
}
