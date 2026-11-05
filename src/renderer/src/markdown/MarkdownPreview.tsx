/**
 * Rendered markdown view (v0.3.4) — the shared preview used by the IDE's
 * split/preview modes, the fullscreen file overlay, and (via those) the
 * terminal ⌘-click flow. The `card` variant renders agent-written markdown
 * inside another surface: the ASK ME question and the task detail's Q&A trail.
 *
 * SECURITY: agent-generated markdown is untrusted. react-markdown WITHOUT
 * rehype-raw renders to React elements only — no HTML sink exists, raw HTML in
 * the source is shown as text, and the default urlTransform already drops
 * javascript: URIs. Keep it that way: never add rehype-raw here. The schemes
 * let through besides the default's are `dbm:`, the app's own places
 * (settings-links-in-replies.md), and `email:`, one email
 * (original-email-view.md); both render as a button and never navigate.
 *
 * Links never navigate the window: http(s)/mailto go through the main-process
 * opener; relative *.md links surface through onOpenMarkdownLink so the host
 * (IDE tab / overlay) opens them in context; everything else is inert.
 *
 * In a card, a web or email link is named (docs/designs/named-links.md): a
 * pasted URL shows the app or site it opens ("HubSpot"), an arrow or a mail
 * icon says where the click goes, and words that name another site get the
 * real one after the link. Documents (file tabs, the IDE) show links as written.
 */
import { memo, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspaceImage } from '@/hooks/useWorkspaceImage';
import { isBareLink, isExternal, labelMismatch, linkName, resolveLocalImageRel, resolveMdLinkRel } from './mdLinks';
import { Icon } from '@/components/Icon';
import { remarkSoftBreaks } from './remarkSoftBreaks';
import { remarkFileChips } from './remarkFileChips';
import { remarkSettingsLinks } from './remarkSettingsLinks';
import { PlaceChip } from './PlaceChip';
import { FolderChip } from './FolderChip';
import { remarkFolderChips, type FolderMember } from './remarkFolderChips';
import { PLACE_SCHEME, parsePlace } from '@shared/settingsPlaces';
import { EMAIL_SCHEME, parseEmailHref } from '@shared/emailLink';
import { EmailChip } from './EmailChip';
import { placeUrlTransform } from './placeUrl';
import { rehypeAutoDir } from './rehypeAutoDir';
import { useRtl } from '@/i18n/useDirection';

/** How the rendered markdown sits in its host.
 *  - `document` (default): a page — its own type scale, 72ch measure, page padding.
 *  - `card`: markdown INSIDE another surface (an ASK ME question, a Q&A entry).
 *    Inherits the host's font and size, drops the page chrome, and keeps a single
 *    newline as a line break the way the plain-text block it replaced did. */
export type MarkdownVariant = 'document' | 'card';

// Hoisted: a fresh array on every render would make react-markdown re-run the
// whole pipeline even when nothing about the source changed.
const DOC_PLUGINS = [remarkGfm];
const CARD_PLUGINS = [remarkGfm, remarkSoftBreaks];
// With file chips (docs/designs/open-file-tab.md): before the soft breaks, whose
// split text nodes have no source position.
const DOC_FILE_PLUGINS = [remarkGfm, remarkFileChips];
const CARD_FILE_PLUGINS = [remarkGfm, remarkFileChips, remarkSoftBreaks];
// Agent text also gets its Settings places as buttons
// (settings-links-in-replies.md); before the soft breaks, like file chips.
const DOC_PLACE_PLUGINS = [remarkGfm, remarkSettingsLinks];
const CARD_PLACE_PLUGINS = [remarkGfm, remarkSettingsLinks, remarkSoftBreaks];
const DOC_FILE_PLACE_PLUGINS = [remarkGfm, remarkFileChips, remarkSettingsLinks];
const CARD_FILE_PLACE_PLUGINS = [remarkGfm, remarkFileChips, remarkSettingsLinks, remarkSoftBreaks];


/** Per-block `dir="auto"`, for an RTL app language only — see the note at the
 *  `useRtl()` call site below. Frozen module constants so the prop identity is
 *  stable and react-markdown does not re-run the pipeline on every render. */
const AUTO_DIR_PLUGINS = [rehypeAutoDir];
const NO_PLUGINS: never[] = [];

export interface MarkdownPreviewProps {
  source: string;
  /** Repo-relative path of the file being previewed (for resolving relative links). */
  baseRel?: string;
  /** Absolute workspace root. Supplying it turns LOCAL images from placeholder
   *  chips into actual pictures (read through the root-confined fs IPC); without
   *  it every image stays a chip, because there is nothing to resolve against. */
  root?: string;
  /** Open a sibling markdown file (repo-relative path) in the host's context. */
  onOpenMarkdownLink?: (rel: string) => void;
  /** Page vs in-card rendering. Defaults to `document`. */
  variant?: MarkdownVariant;
  /** Draw each file the text names as this chip, in place of its path
   *  (open-file-tab.md, R2). Keep its identity stable: it is a memo input. */
  fileChip?: (path: string) => ReactNode;
  /** Agent text: turn "Settings, Connections, Mailboxes" words into the same
   *  button a `dbm:` link gets (settings-links-in-replies.md). Off for
   *  documents, whose words stay words. */
  placeLinks?: boolean;
  /** Turn a team folder named in the words into a chip that opens it
   *  (remarkFolderChips). Keep its identity stable: it is a memo input. */
  folderTeam?: readonly FolderMember[];
}

export const MarkdownPreview = memo(function MarkdownPreview({
  source, baseRel, root, onOpenMarkdownLink, variant = 'document', fileChip, placeLinks = false, folderTeam
}: MarkdownPreviewProps) {
  const card = variant === 'card';
  const basePlugins = placeLinks
    ? (fileChip ? (card ? CARD_FILE_PLACE_PLUGINS : DOC_FILE_PLACE_PLUGINS) : (card ? CARD_PLACE_PLUGINS : DOC_PLACE_PLUGINS))
    : (fileChip ? (card ? CARD_FILE_PLUGINS : DOC_FILE_PLUGINS) : (card ? CARD_PLUGINS : DOC_PLUGINS));
  // Before the soft breaks, like file chips. Memoized for the same reason the
  // lists above are hoisted.
  const remarkPlugins = useMemo(() => {
    if (!folderTeam?.length) return basePlugins;
    const folders = [remarkFolderChips, { team: folderTeam }] as const;
    const last = basePlugins[basePlugins.length - 1];
    return last === remarkSoftBreaks ? [...basePlugins.slice(0, -1), folders, last] : [...basePlugins, folders];
  }, [basePlugins, folderTeam]) as Options['remarkPlugins'];
  // Per-block direction, gated on the APP LANGUAGE rather than on the text.
  //
  // The plugin stamps `dir="auto"`, which resolves from each block's first
  // strong character — so ungated it fires for an English user the moment an
  // agent quotes a line of Arabic, and mirrors a block of their UI over
  // something they never turned on. Keying it to the chosen language instead
  // means an English user's markdown renders through exactly the pipeline it
  // rendered through before this existed, whatever the agent writes into it.
  const rtl = useRtl();
  const { t } = useTranslation();
  return (
    <div className={card ? 'cth-md-preview cth-md-card' : 'cth-md-preview'}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        urlTransform={placeUrlTransform}
        rehypePlugins={rtl ? AUTO_DIR_PLUGINS : NO_PLUGINS}
        components={{
          ...(fileChip ? {
            'cth-file': ({ node }: { node?: { properties?: Record<string, unknown> } }) => fileChip(String(node?.properties?.dataPath ?? ''))
          } as Components : {}),
          ...(folderTeam?.length ? {
            'cth-folder': ({ node, children }: { node?: { properties?: Record<string, unknown> }; children?: ReactNode }) =>
              <FolderChip agentId={String(node?.properties?.dataAgent ?? '')} words={hastText(node)}>{children}</FolderChip>
          } as Components : {}),
          a: ({ href, children, node }) => {
            const h = href ?? '';
            // An app place first, before the web and named link branches: a
            // button, never a navigation. A dbm: link that names no known
            // place is just its words.
            if (h.slice(0, PLACE_SCHEME.length).toLowerCase() === PLACE_SCHEME) {
              const place = parsePlace(h);
              return place ? <PlaceChip place={place} words={hastText(node)}>{children}</PlaceChip> : <>{children}</>;
            }
            // One email (original-email-view.md): a chip in a card, the words
            // elsewhere. A link that names no email is just its words.
            if (h.slice(0, EMAIL_SCHEME.length).toLowerCase() === EMAIL_SCHEME) {
              const email = card ? parseEmailHref(h) : null;
              return email ? <EmailChip email={email} words={hastText(node)}>{children}</EmailChip> : <>{children}</>;
            }
            // The .md file a link opens, judged on its cleaned path (resolveMdLinkRel).
            const mdTarget = onOpenMarkdownLink && !isExternal(h) ? resolveMdLinkRel(baseRel, h) : null;
            const onClick = (e: React.MouseEvent) => {
              e.preventDefault();
              if (isExternal(h)) { void window.cth.openExternal?.(h); return; }
              if (mdTarget !== null) onOpenMarkdownLink?.(mdTarget);
              // anything else (file:, anchors into self, unknown schemes): inert
            };
            const clickable = isExternal(h) || mdTarget !== null;
            if (card && isExternal(h)) {
              const text = hastText(node);
              const bare = isBareLink(text, h);
              const name = bare ? linkName(h) : null;
              // A pasted URL that does not parse keeps its raw text, as before.
              if (!bare || name) {
                const mail = /^mailto:/i.test(h);
                const real = bare ? null : labelMismatch(text, h);
                return (
                  <>
                    <a href={h} onClick={onClick} title={h} className="cth-md-named">
                      {bare ? name : children}
                      {/* A word joiner keeps the icon on the last word's line. */}
                      {'\u2060'}
                      <Icon name={mail ? 'mail' : 'external'} size={0.75} style={{ verticalAlign: -1, marginInlineStart: 3 }} />
                      <span className="cth-sr-only"> {t(mail ? 'markdown.opensInEmail' : 'markdown.opensInBrowser')}</span>
                    </a>
                    {real && <span className="cth-md-linkhost"> ({real})</span>}
                  </>
                );
              }
            }
            return (
              <a
                href={h || undefined}
                onClick={onClick}
                title={h}
                style={clickable ? undefined : { cursor: 'default', textDecoration: 'underline dotted' }}
              >
                {children}
              </a>
            );
          },
          // A table sits in its own box, which scrolls sideways when it is too
          // wide, so the table itself can fill its column; the box takes Tab so a
          // keyboard can scroll it (design review 5.2A, 6.1A).
          table: ({ node: _node, ...props }) => (
            <div className="cth-md-table" tabIndex={0} role="region" aria-label={t('markdown.table')}>
              <table {...props} />
            </div>
          ),
          // Right aligned columns (GFM `--:`) are amounts: marked here, not
          // matched on the inline style, so the dock can set them in mono (5.1A).
          th: ({ node: _node, ...props }) => <th {...props} className={numClass(props.style)} />,
          td: ({ node: _node, ...props }) => <td {...props} className={numClass(props.style)} />,
          // Images. LOCAL ones render for real (bytes via the root-confined fs
          // IPC → blob URL); remote ones stay a placeholder chip. Until now
          // every image was a chip, which meant an agent's report saying "see
          // the screenshot below" showed a pill reading "🖼 screenshot" and the
          // evidence was unviewable anywhere in the app.
          img: ({ alt, src }) => {
            const s = typeof src === 'string' ? src : undefined;
            const rel = root ? resolveLocalImageRel(baseRel, s) : null;
            if (!root || !rel) return <ImageChip alt={alt} src={s} />;
            return <MdImage root={root} rel={rel} alt={alt} src={s} />;
          }
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});

/** `cth-md-num` on a right aligned table cell, the GFM mark for an amount column. */
function numClass(style: React.CSSProperties | undefined): string | undefined {
  return style?.textAlign === 'right' ? 'cth-md-num' : undefined;
}

/** The plain text of a rendered element (a link's words), however nested. */
function hastText(node: unknown): string {
  const n = node as { type?: string; value?: unknown; children?: unknown[] } | undefined;
  if (!n) return '';
  if (n.type === 'text') return typeof n.value === 'string' ? n.value : '';
  return (n.children ?? []).map(hastText).join('');
}

/** Fallback for anything we won't (or can't) load: remote URLs, non-images,
 *  and local files that turned out to be missing or undecodable. */
function ImageChip({ alt, src, note }: { alt?: string; src?: string; note?: string }) {
  // data-alt is the author's words for the picture: the file tab's Copy reads
  // it, never the chip's visible words (docs/designs/copy-document.md).
  return (
    <span className="cth-md-img" title={src} data-alt={alt ?? ''}>
      🖼 {alt || 'image'}{note ? ` (${note})` : ''}
    </span>
  );
}

/** A local image inside rendered markdown. Falls back to the chip on any
 *  failure so a stale path in a report degrades to the old behaviour instead of
 *  a broken-image glyph. Blob lifetime (create AND revoke) belongs to the hook. */
function MdImage({ root, rel, alt, src }: { root: string; rel: string; alt?: string; src?: string }) {
  const img = useWorkspaceImage(root, rel);
  const [decodeFailed, setDecodeFailed] = useState(false);
  if (img.status === 'loading') return <ImageChip alt={alt} src={src} note="loading" />;
  if (img.status === 'error') return <ImageChip alt={alt} src={src} note={img.error} />;
  if (decodeFailed) return <ImageChip alt={alt} src={src} note="could not decode" />;
  return (
    <img
      className="cth-md-image"
      src={img.url}
      alt={alt || rel}
      data-alt={alt ?? ''}
      title={src}
      onError={() => setDecodeFailed(true)}
    />
  );
}
