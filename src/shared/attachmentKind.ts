/**
 * What an email attachment really is, from its bytes, never its name or the
 * type the sender gave it (docs/designs/agent-save-attachment.md). Only the
 * kinds a member needs to read get through: programs, scripts, archives, web
 * pages and files with macros do not.
 *
 * Pure: no fs, no electron, so the rule can be tested byte by byte.
 */

export type AttachmentKindId = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'csv' | 'png' | 'jpg' | 'gif' | 'webp';

export interface AttachmentKind {
  id: AttachmentKindId;
  /** The ending the saved file gets, whatever the sender called it. */
  ending: string;
  /** Text the app can screen as it is, without a document reader. */
  text: boolean;
}

const kind = (id: AttachmentKindId, text = false): AttachmentKind => ({ id, ending: id, text });

const startsWith = (b: Buffer, ...sig: number[]): boolean => b.length >= sig.length && sig.every((v, i) => b[i] === v);
const ascii = (b: Buffer, at: number, s: string): boolean => b.toString('latin1', at, at + s.length) === s;

/** The main part each Office file must hold. A file named `.docx` with only
 *  a zip inside is just a zip. */
const OFFICE_PARTS: ReadonlyArray<[string, AttachmentKindId]> = [
  ['word/document.xml', 'docx'], ['xl/workbook.xml', 'xlsx'], ['ppt/presentation.xml', 'pptx']
];

/** Zip entry names are stored as plain text, so a search finds them without
 *  unpacking anything. A stray match only ever refuses a file, or fails the
 *  check for its main part. */
function officeKind(b: Buffer): AttachmentKind | null {
  if (!b.includes('[Content_Types].xml') || b.includes('vbaProject.bin')) return null;
  const found = OFFICE_PARTS.filter(([part]) => b.includes(part));
  return found.length === 1 ? kind(found[0][1]) : null;
}

const MARKUP = /^(?:﻿)?\s*<(?:!doctype|html|head|body|script|svg|\?xml)\b/i;
const SHEBANG = /^(?:﻿)?#!/;

/** Readable text, not a web page or a script: valid UTF-8 with no NUL. */
function textKind(b: Buffer, name: string): AttachmentKind | null {
  if (!b.length || b.includes(0)) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return null; }
  if (MARKUP.test(text) || SHEBANG.test(text)) return null;
  return kind(/\.csv$/i.test(name.trim()) ? 'csv' : 'txt', true);
}

/** The kind of this file, or null when it is not one the office takes in. */
export function attachmentKind(bytes: Buffer, name: string): AttachmentKind | null {
  if (ascii(bytes, 0, '%PDF-')) return kind('pdf');
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return kind('png');
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return kind('jpg');
  if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) return kind('gif');
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return kind('webp');
  if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04)) return officeKind(bytes);
  return textKind(bytes, name);
}
