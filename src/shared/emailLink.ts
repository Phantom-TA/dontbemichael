/**
 * A link to one email in a connected mailbox (docs/designs/original-email-view.md).
 *
 * A member's mail `read` gives one ready to paste, `[Dana Ortiz, 27 Oct](email:<mailbox id>/<Message-ID>)`,
 * and members and Michael carry it into the filing and the ask like a web
 * link. A card shows it as an Email chip; the chip opens the email itself in
 * an office tab, fetched by main from the owner's mailbox, read only.
 *
 * The Message-ID header is the reference, not the tool's `folder:uid` id:
 * archiving moves a message and gives it a new uid, its Message-ID stays.
 * Main parses every link again and never trusts the renderer's.
 */
import { clipUnits } from './cutText';

export const EMAIL_SCHEME = 'email:';

/** RFC 5322 keeps a header line within 998 characters. */
export const MESSAGE_ID_MAX = 998;

/** How many units of a link's words show on the chip. */
export const EMAIL_LABEL_MAX = 60;

export interface EmailRef { mailbox: string; messageId: string }

/** What the owner's tab receives for one email (main to renderer). */
export interface OriginalEmail {
  /** The mailbox's own address, for the tab's meta line. */
  mailboxAddress: string;
  fromName: string;
  fromAddress: string;
  to: string;
  cc: string;
  subject: string;
  /** ISO time, or '' when the email has no usable date. */
  date: string;
  /** The HTML body as sent, or null for a text only email. */
  html: string | null;
  text: string;
  attachments: Array<{ name: string; size: number }>;
  /** `cid:` pictures carried inside the email, as data URIs, by content id. */
  inline: Record<string, string>;
  /** Over the size the app parses whole: headers and text only. */
  large: boolean;
}

export type OriginalFailure = 'broken' | 'mailbox' | 'message' | 'auth' | 'blocked' | 'network' | 'unknown';

export type OriginalResult =
  | { ok: true; email: OriginalEmail; gmailUrl: string | null }
  | { ok: false; reason: OriginalFailure; gmailUrl: string | null };

/** The two owner only calls main answers for the email tab. */
export const EMAIL_IPC = { original: 'mail:original', pictures: 'mail:originalPictures', cancel: 'mail:originalCancel' } as const;

const MAILBOX_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * True for a Message-ID the searches can carry safely: `<local@domain>`, at
 * most 998 characters, and no space, quote, backslash or line break. Legal
 * ones with those are rare; their email gets no link and is named in words.
 */
export function isSafeMessageId(id: string): boolean {
  return id.length >= 5 && id.length <= MESSAGE_ID_MAX && /^<[^<>\s"\\@]+@[^<>\s"\\@]+>$/.test(id);
}

/** The link's address part, or null when the mailbox id or Message-ID won't do. */
export function emailHref(ref: EmailRef): string | null {
  if (!MAILBOX_ID.test(ref.mailbox) || !isSafeMessageId(ref.messageId)) return null;
  return `${EMAIL_SCHEME}${ref.mailbox}/${encodeURIComponent(ref.messageId)}`;
}

/** The mailbox and Message-ID an `email:` link names, or null for anything else. */
export function parseEmailHref(href: string): EmailRef | null {
  if (typeof href !== 'string' || href.slice(0, EMAIL_SCHEME.length).toLowerCase() !== EMAIL_SCHEME) return null;
  const rest = href.slice(EMAIL_SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash < 1) return null;
  const mailbox = rest.slice(0, slash);
  let messageId: string;
  try { messageId = decodeURIComponent(rest.slice(slash + 1)); } catch { return null; }
  if (!MAILBOX_ID.test(mailbox) || !isSafeMessageId(messageId)) return null;
  return { mailbox, messageId };
}

/** A tab's key for one email, the same however the link was spelled. */
export function emailTabId(ref: EmailRef): string {
  return `${EMAIL_SCHEME}${ref.mailbox}/${ref.messageId.toLowerCase()}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The name in "Dana Ortiz <dana@x.com>", else the address. */
export function senderName(from: string): string {
  const s = String(from ?? '').split(',')[0].trim();
  const m = /^"?([^"<]*?)"?\s*<([^>]*)>$/.exec(s);
  if (m) return (m[1].trim() || m[2].trim());
  return s;
}

/** The words a link shows: the sender and a short date, "Dana Ortiz, 27 Oct",
 *  in the Mac's own time. No brackets or line breaks, cut at 60 units. */
export function emailLabel(from: string, isoDate: string): string {
  const who = senderName(from).replace(/[[\]\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Email';
  const d = isoDate ? new Date(isoDate) : null;
  const when = d && !Number.isNaN(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
  return clipUnits(when ? `${who}, ${when}` : who, EMAIL_LABEL_MAX).trim();
}

/** The ready to paste link a read gives, or null when the email can't have one. */
export function emailLinkFor(mailbox: string, msg: { from?: string; date?: string; messageId?: string }): string | null {
  const href = emailHref({ mailbox, messageId: String(msg.messageId ?? '') });
  if (!href) return null;
  return `[${emailLabel(String(msg.from ?? ''), String(msg.date ?? ''))}](${href})`;
}

/** Gmail's search for one exact message, in the right signed in account. */
export function gmailMessageUrl(address: string, messageId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(address)}#search/rfc822msgid%3A${encodeURIComponent(messageId)}`;
}
