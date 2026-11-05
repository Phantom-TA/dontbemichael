# Copy a document from its file tab

Status: CEO review, scope decided 2026-10-26 (SELECTIVE EXPANSION: A1, E2, E3, E4
approved; E1 skipped). CEO and eng reviews complete 2026-10-26; ready to
implement (tasks T1 to T8).

## Ask (owner, 2026-10-26)

"For some business users it is too technical to figure out how to copy content
for the document opened in the app such as an email draft or a blog post. Add a
copy option."

## 0A. Premise

- **Real problem.** An agent writes an email draft or a blog post to a file; the
  owner opens it as a file tab (`FileTabView.tsx`, docs/designs/open-file-tab.md)
  and wants it in Gmail, Outlook, WordPress, LinkedIn or Google Docs. The tab
  header offers only "Open in app" and "Show in Finder"
  (`FileTabView.tsx:107-108`). Today the owner must drag-select the text, which
  is hard on a long document, or open the file elsewhere.
- **The hidden second problem.** Most drafts are Markdown. Copying the raw file
  pastes `**bold**`, `#` and `- ` into Gmail as literal symbols. Gmail's compose
  window keeps formatting only when it arrives as HTML. A Copy that pastes
  asterisks would still read as "too technical".
- **Target outcome.** One click, then paste anywhere: formatting kept in rich
  editors (Gmail, Outlook, Docs, WordPress), clean text with no Markdown symbols
  in plain fields (LinkedIn, X, a text message).
- **Do nothing cost.** Every draft an agent writes needs a technical step before
  it is useful; the owner either learns Markdown or asks the agent to resend.

## 0B. Existing code to reuse

| Need | Existing code |
|---|---|
| Where the button goes | `FileTabView.tsx:101-109` header, beside Open in app and Show in Finder (`PixelButton` secondary sm) |
| The file's text | already read: `read.text` for markdown, text, json, csv (`FileTabView.tsx:19-21`) |
| Clipboard bridge | `app:copyToClipboard` (`main/index.ts:4696`), plain text only; preload `copyToClipboard` (`preload/index.ts:814`) |
| Copied feedback pattern | `FileChip.tsx:121,158-168` idle, busy, done, error state; `askMe.filePathCopied` "Copied" (`en.json:103`) |
| Markdown to HTML | `react-markdown` 10 + `remark-gfm` already render the tab safely (`MarkdownPreview.tsx:23-24`, no rehype-raw). The accepted design serializes that rendered DOM through an allowlist (see How it works); a second render from source with `react-dom/server` was considered and dropped once E4 needed a DOM path anyway |
| Tests | `test/open-file-tab.test.cjs` loads TS through `load-ts.cjs` |

Nothing is rebuilt. Electron's `clipboard.write({ text, html })` puts both
flavors on the clipboard in one call; the paste target picks.

Not reused on purpose: the browser's own copy of the rendered DOM. Chromium
inlines the computed styles, so a dark theme pastes white text into Gmail. The
plan walks the DOM itself and writes only allowlisted tags with no styles.

## 0C. Dream state

```
  CURRENT STATE                THIS PLAN                       12-MONTH IDEAL
  Draft opens in a tab;  --->  One Copy button in the     ---> Drafts are first-class: copy,
  copying needs a drag         file tab header; pastes         post or send from where they
  select, and Markdown         formatted in rich editors       open, with a "posted" mark
  pastes as symbols            and clean in plain fields       (TODOS: Approvals inbox)
```

The plan moves toward the ideal and blocks nothing: the TODOS.md "Approvals
inbox (draft-to-post flow)" item (Ryan's "copy to clipboard and mark posted")
can reuse the same rich copy helper later.

## Landscape (WebSearch, 2026-10-26; Aside not installed)

- Layer 1: copy buttons on AI output put rich text (HTML) on the clipboard;
  users who get raw Markdown complain of asterisks in Gmail.
- Layer 2: Gmail compose only keeps formatting that arrives as HTML; Google Docs
  half-converts pasted Markdown; some assistants offer a separate "copy as
  Markdown" for technical users.
- Layer 3: for this app's owner the plain-text flavor should be clean text, not
  the Markdown source (most tools put Markdown there). A plain field such as
  LinkedIn then shows the words, not `**`.

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| A1 what Copy puts on the clipboard (FileTabView, main clipboard IPC) | ask above; `read.text` is Markdown source; `app:copyToClipboard` is text only (`main/index.ts:4696`) | formatted HTML + clean plain text, one button | (B raw text, C plus Copy as Markdown: not taken) | approved | D1 answer A (owner, 2026-10-26): formatted, pastes clean; no Copy as Markdown |
| E1 Copy on the email approval card (MailProposalCards) | `MailProposalCards.tsx:86,97` editable subject and body, no copy | n/a | (not added) | declined | D3 answer C (owner, 2026-10-26): skipped |
| E2 image tabs copy the picture (FileTabView image kind) | image tabs show `<img>` from bytes (`FileTabView.tsx:83-84`) | n/a | Copy on an image tab puts the picture on the clipboard (`nativeImage`) | approved | D4 answer A (owner, 2026-10-26): added to scope |
| E3 CSV/TSV tabs copy as a table (FileTabView csv kind) | CSV renders as a table (`FileTabView.tsx:90-92`, open-file-tab E3) | n/a | HTML table + tab-separated text, so Sheets, Excel and Docs paste real cells | approved | D5 answer A (owner, 2026-10-26): added to scope |
| P1 remote (web) pictures in a Markdown copy (cleanCopy pictures rule) | MarkdownPreview.tsx:156-160 shows remote pictures as a chip, never loads them; spec review 3 | every picture in a Markdown copy becomes its alt text; no img in the copied HTML | (B live img: not taken) | approved | D7 answer A (owner, 2026-10-26): paste only what you saw |
| E4 a selected part copies clean too (file tab copy event) | Edit menu copy (`main/index.ts:3819`) inlines the dark theme's colors | n/a | the tab handles the copy event: a selection copies as clean HTML + text, no app colors | approved | D6 answer A (owner, 2026-10-26; recommendation was B, defer): added to scope |

Mode: SELECTIVE EXPANSION (D2 answer A, owner, 2026-10-26).

## 0G. Hold-scope checks

- About 9 changed files [estimated], no new class or service: under the
  complexity bar.
- Minimum for the goal: the button, the clean copy for Markdown, the clipboard
  call. Nothing in A1 is deferrable without the paste showing symbols again.
- Invariants kept: the tab's folder check (open-file-tab.md) is not touched;
  agent Markdown still never reaches an HTML sink inside the app (the copy HTML
  only leaves through the clipboard, built from allowed tags).

## Accepted scope (A1, E2, E3, E4)

### What the owner sees

1. **A Copy button** first in the file tab header, before Open in app and Show
   in Finder (`PixelButton` secondary sm, the same look). It shows while the
   file reads fine and is not empty; a missing, too large or unreadable file has
   nothing to copy, so no button.
2. **Click, then "Copied".** The label turns to "Copied" for about two seconds,
   then back. If the clipboard write fails, the label reads "Couldn't copy"
   for the same time. No toast, no extra text. The button is disabled while a
   copy is running (FileChip's busy state), a click during "Copied" copies
   again and restarts the timer, the timer is cleared when the tab closes or
   switches, and every click copies what the tab shows at that moment (a
   reload during the copy does not mix two versions: for text kinds the copy
   reads the DOM once, synchronously, before the clipboard call; a picture copy
   awaits the decode, so a reload during it still copies the picture that was
   shown when the click landed).
3. **What lands on the clipboard, by kind:**

| Tab kind | Rich flavor (HTML) | Plain flavor (text) |
|---|---|---|
| Markdown (A1) | the document's headings, bold, italics, lists, links, quotes, code and tables as plain tags, with no app colors, fonts or classes | clean words: no `**`, `#` or `[ ]( )`; list items start with "• " or "1. "; a link whose words differ from its address reads "words (address)"; tables as tab separated rows; a blank line between blocks |
| Text, JSON | none | the file as stored |
| CSV, TSV (E3) | a plain `<table>` of every row, not only the 1,000 the tab shows | tab separated rows |
| Picture (E2) | the picture itself (png, jpg, gif, webp), not a link | none |

4. **A selected part copies clean too (E4).** In any text tab (Markdown, text,
   JSON, CSV), selecting part of the document and pressing Cmd+C (Ctrl+C) or the
   Edit menu Copy writes clean text for just that part, and for Markdown and CSV
   clean HTML too, through the same serializer (a text or JSON selection writes
   plain text only, matching the button), so the dark theme never pastes white text (`Mono` and `CsvTable`
   set `color: var(--cth-ink)`, FileTabView.tsx:129,141, which Chromium would
   inline). Only a selection that lies wholly inside the tab's body is handled;
   one that starts in the header or reaches outside the body keeps the native
   copy. Picture tabs keep the native copy.

### How it works

```
  FileTabView (renderer)
    [Copy] click ─────────────┐            Cmd+C in a text tab
                              v                       │
             copyFromTab(kind, read, bodyEl)          │ onCopy(e)
              │  markdown: cleanCopy(bodyEl)  <───────┘ cleanCopy(selection fragment)
              │  csv/tsv:  tableCopy(parseDelimited(text))     │
              │  text/json: { text }                           v
              │  image:    canvas → PNG bytes        e.clipboardData.setData(html, text)
              v                                       e.preventDefault()
   window.cth.copyRich({ text, html? })   window.cth.copyImage(pngBytes)
              │ ipc app:copyRich                     │ ipc app:copyImage
              v                                      v
   main: clipboard.write({ text, html })   main: nativeImage.createFromBuffer → isEmpty? error
              │                                      │ clipboard.writeImage
              └──────────────> { ok } | { ok:false, error } ──> label: Copied / Couldn't copy
```

- **One clean serializer** (`cleanCopy` in `src/renderer/src/components/fileTabCopy.ts`,
  beside delimited.ts; eng review S1, S2): walks the
  rendered DOM of the body (or a selection's cloned fragment) and builds the
  HTML and the plain text in the same walk. It is written against a small node
  interface (nodeType, nodeName, childNodes, getAttribute, textContent) so tests
  pass plain fake nodes; the repo has no DOM library and none is added. Rules:
  - **Kept tags:** p, h1 to h6, strong, b, em, i, del, s, a, ul, ol, li,
    blockquote, code, pre, table, thead, tbody, tr, th, td, br, hr. No img
    (P1, D7 A).
  - **Kept attributes:** `href` on a, only for http(s) and mailto; `start` on
    ol; `dir`. Nothing else
    (no class, style, aria, id).
  - **Any other element** is unwrapped: its children are kept, the tag is not
    (the `cth-md-table` wrapper div, spans, sections).
  - **Dropped with its content:** buttons; script, style; any element marked
    `data-copy="skip"` (the CSV "Showing 1,000 of N rows" line gets it,
    FileTabView.tsx:150-154); GFM's visually hidden footnote heading
    (`h2.sr-only`); footnote back-links (href `#user-content-fnref-…`). A
    footnote reference (href `#user-content-fn-…`) is written as "[1]", so it
    never runs into the word before it. Found by href, not by GFM's
    `data-footnote-*` marks: MarkdownPreview's own link renderer
    (MarkdownPreview.tsx:118-126) writes only href, title and onClick.
  - **Pictures:** MarkdownPreview renders a remote picture as an `ImageChip`
    span, never an img (MarkdownPreview.tsx:156-160, 185-191), and a local one
    as an img with a blob src (which works nowhere outside the app) or a chip
    while loading or broken. So both `ImageChip` and `MdImage` gain `data-alt`
    (the author's alt, empty when none). The serializer reads it, never the
    visible chip words ("🖼 image (loading)") or the `alt || rel` fallback:
    every picture becomes its `data-alt` text, or nothing when it is empty.
    A web picture the app never showed never reaches a paste (P1, D7 A).
  - **Links:** a local or `#` link keeps its words, without the link.
  - **Task lists:** the checkbox becomes "☑ " or "☐ " text in both flavors,
    read from the input's `checked` property (the node interface includes it;
    a Range clone copies an input's checkedness per the HTML cloning steps,
    which a test with a fake node and the real FileTabView source check cover).
  - **Partial selections:** a Range clone can hold an `li` with no list or a
    `td`/`tr` with no table. The serializer wraps an orphan `li` in a `ul`
    (plain text "• ", since the numbering is unknown) and orphan cells or rows
    in a `table`. A selection inside one block (part of a paragraph) copies
    that block's words with no wrapping tag. The sticky CSV header is only
    copied when the selection includes it.
  - **Escaping:** every text node and every kept attribute value is HTML
    escaped (&, <, >, ").
  - **Whitespace:** whitespace-only text between blocks (react-markdown's
    "\n" between ul and li, table and tr) is dropped in both flavors. Outside
    `pre`, a "\n" inside a paragraph is a space in plain text (the HTML keeps
    it as written); `br` is a newline.
  - **Plain text:** a blank line between blocks; a heading on its own line;
    list items "• " (unordered) or "N. " counting from the list's `start`;
    nested lists indented two spaces per level; a code block's lines as they
    are, with no fences; a quote's lines with no ">" mark; hr as a blank line;
    table rows as cells joined by tabs, each cell through the same quoting rule
    as `tableCopy` (one shared `tsvCell` helper), so a CSV part and the whole
    paste the same way. A link reads "words (address)" unless
    its words already are the address: `isBareLink` (mdLinks.ts:143) first,
    then the same compare after dropping `mailto:`, `http(s)://`, `www.` and a
    trailing slash (eng review 2.2).
  Both the button and the selection copy use it, so a part and the whole paste
  the same way.
- **CSV and TSV button copy** (`tableCopy` in fileTabCopy.ts, from
  `parseDelimited`, delimited.ts): every row, first row as `th`; cells escaped;
  in the tab separated flavor a cell holding a tab, newline or quote is quoted
  with inner quotes doubled (the Excel rule). When `parseDelimited` returns
  null, Copy writes the raw text only, as the tab already shows it.
- **Why the rendered DOM, not a second render of the source:** the tab already
  renders the document safely (react-markdown, no rehype-raw); the selection
  copy (E4) has only the DOM to work from, so one serializer serves both.
- **Clipboard:** new `app:copyRich` (text plus optional html, one
  `clipboard.write` call so both flavors land together) and `app:copyImage`
  (PNG bytes, checked non-empty) beside `app:copyToClipboard` in
  `main/index.ts`; preload adds `copyRich` and `copyImage`.
- **Pictures** (`copyPicture` in fileTabCopy.ts): at the click, the shown img is
  already decoded, so it is drawn to a canvas at natural size synchronously
  (`img.complete && img.naturalWidth > 0`, else "Couldn't copy"); only the PNG
  encode (`canvas.toBlob`) is awaited, then the alive check, then the IPC. A
  reload that revokes the blob URL (FileTabView.tsx:49) after the click cannot
  change what is copied (eng review 1.1). gif and webp work even where
  `nativeImage` cannot decode them; an animated gif copies the frame shown.
  Blob URLs do not taint the canvas. `copyPicture(img, { toPng, isAlive, send })`
  takes the real canvas encoder from FileTabView, so tests drive it with fakes.
- **Main handlers** live in a small `src/main/clipboardCopy.ts` that imports
  nothing from electron (load-ts.cjs does not stub it): `copyRich(clipboard,
  input)` and `copyImage(clipboard, nativeImage, bytes)`, each returning
  `{ ok: true } | { ok: false, error }`. Input checks: text a string, html a
  string or absent, bytes a non-empty Uint8Array; `copyImage` converts with
  `Buffer.from(bytes)` before `nativeImage.createFromBuffer` and refuses an
  empty image. `main/index.ts` registers `app:copyRich` and `app:copyImage`
  and passes the real `clipboard` and `nativeImage`; tests pass fakes.
- **Tests** (`test/copy-document.test.cjs`, through `load-ts.cjs`): cleanCopy on
  fake nodes for every rule above (kept, unwrapped and dropped tags; links;
  remote and local pictures become data-alt text, no img ever written, chip
  words never copied; task lists; footnote refs as [1] and the hidden heading dropped;
  `data-copy="skip"`; orphan li and cells wrapped; nested and numbered lists;
  code; tables; escaping; class and style never copied); tableCopy (null, quoting,
  header row, escaping, more than 1,000 rows); clipboardCopy with a fake
  clipboard (bad input refused, both flavors written in one call, empty image
  refused, a throwing clipboard reported as not ok); a FileTabView source check
  that the button shows only for a readable, non-empty file and that the copy
  handler ignores selections outside the body. The existing
  `open-file-tab.test.cjs` keeps passing: `onCopy` goes after
  `className="cth-file-tab"` on the scroller div (its regex at :219 pins
  `<div ref={scroller} className="cth-file-tab"`), and its locale key list at
  :235 gains copy, copied and copyFailed (eng review 2.1, 2.3).
- **Types:** the preload API type is `typeof api` (preload/index.ts:1955), so
  `copyRich` and `copyImage` need no separate .d.ts edit.
- **Words:** `fileTab.copy` "Copy", `fileTab.copied` "Copied",
  `fileTab.copyFailed` "Couldn't copy" in en, ar and zh-CN.

## NOT in scope

- Copy on the email approval card (E1, owner skipped 2026-10-26; the card's job
  is approve or decline).
- A separate "Copy as Markdown" (A1 option C not taken).
- Copy on Ask me questions, task Q&A or Memory notes: not raised; the file tab
  is where drafts open.

## Answered: A1 (D1 A)

The comparison and option texts that were asked are kept below for the record.

## currentDecision (P1, answered: D7 A)

Spec review 3 found that the remote picture rule added after spec review 2
(an http(s) `data-src` pastes as `<img>`) was never put to the owner, and that
the app itself never loads remote pictures (it shows a chip). Ledger row P1.

Commitment comparison:

```text
Commitment                              | Source/approval | Current (unapproved draft) | A                    | B
Local pictures shown in the doc          | A1              | alt text                   | alt text             | alt text
Remote picture (http) in pasted HTML     | none            | live <img>                 | its alt text only    | live <img>
Owner pastes only what the app showed    | 0A, injection   | no                         | yes                  | no
Blog post with web pictures keeps them   | owner ask       | yes                        | no, alt text         | yes
data-src on ImageChip                    | spec review 2   | needed                     | not needed           | needed
```

Question: D7 — P1: Should web pictures in a document paste as live pictures?
Header: Web pictures
A) Paste only what you saw (recommended)
A picture the app does not show (a web address) pastes as its alt text, so nothing reaches an email that the owner never saw. Effort S, risk low; drops data-src, keeps data-alt; one test.
B) Paste web pictures live
A web picture pastes as a live image, so a blog post keeps its pictures, but an agent-written address the owner never saw (possibly a tracking pixel from outside text) reaches Gmail. Effort S, risk medium; data-src on the chip; one test.

## currentDecision (A1, answered)

History note: option A's text below says "reuses react-markdown and
react-dom/server"; the approved behavior (formatted HTML plus clean text) is
unchanged, and the build now serializes the rendered DOM instead (spec review 1).

Commitment comparison:

```text
Commitment                         | Source/approval | Current | A                     | B              | C
Copy button in file tab header     | owner ask       | none    | yes                   | yes            | yes
Gmail/Docs paste keeps formatting  | 0A premise      | n/a     | yes (HTML flavor)     | no, shows **   | yes
Plain field paste (LinkedIn)       | 0A premise      | n/a     | clean text, no **     | Markdown text  | clean text
Markdown source for tech users     | landscape L2    | n/a     | no                    | yes            | yes, second choice
New main IPC (text + html write)   | main/index.ts   | n/a     | yes                   | no             | yes
Copied feedback, error shown       | FileChip pattern| n/a     | yes                   | yes            | yes
Tests                              | eng prefs       | n/a     | HTML + text converter | button only    | A tests + menu
```

Question: D1 — A1: What should the Copy button put on the clipboard?
Header: Copy format
A) Formatted, pastes clean (recommended)
One Copy writes the document as formatted HTML (headings, bold, lists, links, tables) plus clean plain text with no Markdown symbols; Gmail, Outlook, Docs and WordPress keep the formatting, LinkedIn or a text box gets clean words. Effort M, risk low, reuses react-markdown and react-dom/server; tested by converter unit tests and an IPC check.
B) The file's raw text
Copy writes the file exactly as stored, through the existing copyToClipboard bridge. Effort S, risk low, zero new IPC; tested by one button test. Markdown symbols (** # -) paste literally into Gmail and LinkedIn, so the business user still sees a technical result.
C) Formatted, plus Copy as Markdown
Option A, and a small second choice "Copy as Markdown" for people who paste into a Markdown editor or back to an agent. Effort M, risk low, same reuse as A; adds one more control to a header the owner wants quiet (less-verbose UI rule).

## 0I. Temporal interrogation

```
  HOUR 1 (foundations):  clipboardCopy.ts with injected clipboard/nativeImage;
                         app:copyRich, app:copyImage; preload copyRich, copyImage.
  HOUR 2-3 (core):       cleanCopy.ts walker (tag table, unwrap/drop, whitespace,
                         plain text rules, tsvCell, tableCopy); data-alt on
                         ImageChip and MdImage.
  HOUR 4-5 (integration):FileTabView button + states, onCopy for selections,
                         picture canvas path, the alive guard; three locales.
  HOUR 6+ (polish/tests):copy-document.test.cjs; paste checks by hand in Gmail,
                         Google Docs, WordPress, LinkedIn, Excel in both themes.
```

Effort: human team about 1.5 days; CC + gstack about 1 to 1.5 hours [estimated].
Feasibility blockers: none (spec reviews 1 to 3 checked the cited code). Pending
choices: none.

## Review sections (CEO review, 2026-10-26)

**Current scope** (SELECTIVE EXPANSION, D2 A): accepted A1 (D1 A), E2 (D4 A),
E3 (D5 A), E4 (D6 A), P1 (D7 A); skipped E1 (D3 C); documents approved D8 A.
Nothing deferred, nothing pending.

### Section 1: Architecture

```
                      renderer                                   preload            main
  ┌───────────────────────────────────────────────┐
  │ FileTabView ── FileTabBody                     │
  │   header [Copy] [Open in app] [Show in Finder] │
  │   body div (onCopy) ── MarkdownPreview (NEW data-alt on ImageChip, MdImage)
  │        │                   Mono / CsvTable (NEW data-copy="skip" on row note)
  │        v                                       │
  │   NEW components/fileTabCopy.ts              │
  │     cleanCopy(node) -> {html,text}             │
  │     tableCopy(rows) -> {html,text}  tsvCell()  │
  │     copyPicture(img,{toPng,isAlive,send})      │
  │        │ uses delimited.ts parseDelimited      │
  └────────┼───────────────────────────────────────┘
           │ window.cth.copyRich / copyImage ──> NEW preload ──> ipc ──> NEW main/clipboardCopy.ts
           │ (existing copyToClipboard untouched)                         copyRich(clipboard,input)
                                                                          copyImage(clipboard,nativeImage,bytes)
                                                              main/index.ts registers both
```

- **Coupling:** cleanCopy knows MarkdownPreview's markup (data-alt, the
  cth-md-table wrapper, GFM footnote attributes). Justified: it is the only
  renderer of these documents. Guard: a source check that both picture paths
  in MarkdownPreview still write `data-alt` (Section 6).
- **Data flow, four paths:** happy (DOM to {html,text} to one clipboard
  write); nil (no tab or read not ok: no button, onCopy leaves native copy);
  empty (size 0: no button; an empty selection: native copy, nothing to
  clean); error (Section 2).
- **State machine (button):**

```
  idle ──click──> busy ──ok──> copied ──2 s / unmount──> idle
                    │                 └──click──> busy (timer reset)
                    └──fail──> failed ──2 s / unmount──> idle
  busy ──click──> (ignored: button disabled)
  busy ──unmount──> dropped: no IPC sent if not yet sent, no setState
```

- **Scaling:** bounded by the tab's read caps (2 MB text, 10 MB pictures,
  fs.ts:186,220). Worst case a 2 MB CSV builds a few MB of HTML once per click.
- **Security surface:** two new IPC channels, callable only by the app's own
  renderer; they write the clipboard, which `app:copyToClipboard` already can.
  See Section 3.
- **Rollback:** revert the commit; no data, no settings, nothing persisted.
- **Platform potential:** cleanCopy is the piece the TODOS.md "Approvals inbox
  (draft-to-post flow)" needs for "copy to clipboard and mark posted".
- **Cherry-pick fit:** E2, E3, E4 all fit the one serializer plus two IPC
  calls; none adds a component outside the tab.

Findings: 1 (coupling guard, carried to tests). No decision needed.

### Section 2: Error & Rescue Map

```
  CODEPATH                         | WHAT CAN GO WRONG                      | FAILURE
  ---------------------------------|----------------------------------------|---------------------
  cleanCopy(node)                  | unexpected DOM shape throws            | TypeError
  tableCopy(rows)                  | parseDelimited returned null           | (null input)
  copyPicture                      | img not complete (not shown yet)       | (guard)
                                   | canvas too large, toBlob gives null    | null blob
  window.cth.copyRich/copyImage    | IPC handler missing or rejects         | Error (invoke)
  clipboardCopy.copyRich           | bad input (not a string)               | refused {ok:false}
                                   | clipboard.write throws                 | Error
  clipboardCopy.copyImage          | empty bytes / empty nativeImage        | refused {ok:false}
                                   | clipboard.writeImage throws            | Error
  onCopy (selection)               | cleanCopy throws mid copy event        | TypeError

  FAILURE                  | RESCUED? | RESCUE ACTION                               | USER SEES
  -------------------------|----------|---------------------------------------------|---------------------
  cleanCopy throws (button)| Y        | catch, console.warn(kind, error)            | "Couldn't copy"
  tableCopy null           | Y        | raw text only, as the tab shows it          | Copied (raw CSV)
  not shown / toBlob fail  | Y        | catch, console.warn(kind, error)            | "Couldn't copy"
  IPC rejects              | Y        | catch, console.warn                         | "Couldn't copy"
  bad input / write throws | Y        | main returns {ok:false,error}; renderer warns| "Couldn't copy"
  onCopy cleanCopy throws  | Y        | catch BEFORE preventDefault: native copy runs| a copy (with theme colors), warn logged
```

No catch-all swallows: every catch logs the kind and the error and shows the
owner the outcome. The selection path deliberately falls back to the native
copy rather than copying nothing. Gaps: 0.

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| Agent text injects HTML or script into the copied HTML | Low | Med | Yes: built from text nodes and an allowlist, every text and attribute escaped, no raw HTML (react-markdown without rehype-raw) |
| `javascript:` or `file:` link reaches a paste | Low | Med | Yes: href kept only for http(s) and mailto |
| Unseen web picture or tracking pixel reaches an email | Med | Med | Yes: P1 (D7 A), no img ever written |
| A link's words hide a different address in a pasted email | Low | Med | Partly: the owner reviews the draft; plain text shows "words (address)"; the HTML keeps the link as the document wrote it, which the tab shows the same way (documents show links as written, named-links.md). Accepted as is: no change proposed |
| New IPC misuse | Low | Low | Yes: same trust as `app:copyToClipboard`; inputs type checked |
| Huge input exhausts memory | Low | Low | Yes: tab read caps 2 MB and 10 MB |

No new dependency, secret or stored data. Findings: 0 open.

### Section 4: Data flow and interaction edge cases

```
  INPUT (DOM of body | selection Range | CSV rows | img)
    -> VALIDATION (selection wholly inside body? kind ok? size > 0?)
    -> TRANSFORM (cleanCopy | tableCopy | canvas PNG)
    -> PERSIST (none; system clipboard only)
    -> OUTPUT ({ok} -> label)
  shadows: nil (no tab / no selection) -> native or no button
           empty (size 0, whitespace selection) -> no button / native
           wrong type (main input check) -> {ok:false}
           too long (caps upstream) -> tab never shows it
           exception -> Section 2
           stale (reload mid copy) -> text: one sync DOM read; picture: the shown picture
           encoding (RTL, CJK, emoji) -> text nodes copied as is; dir kept
```

**Async ordering.** Invariant: the clipboard ends up holding the copy the owner
clicked last. Shared state: the system clipboard.

```
  op A: picture copy in tab 1      op B: text copy in tab 2       clipboard
  click, sync draw, await toBlob ...                               (old)
  [owner switches to tab 2: tab 1 unmounts]
                                   click, sync read, invoke ──>    B
  decode resolves, invoke ──────────────────────────────────>      A   <- VIOLATION
```

Mechanism that prevents it: FileTabView renders only the active tab
(`key={tab.id}`), so a switch unmounts tab 1; the picture path checks an
`alive` flag after every await and sends no IPC once unmounted. Other order
(A's invoke before the switch) leaves B last, which is correct. Inside one tab
the busy state blocks a second click. Regression proof: the copy routine takes
an `isAlive()` callback and is tested with a controlled decode promise
released after `isAlive` turns false: no IPC call recorded.

| INTERACTION | EDGE CASE | HANDLED? | HOW |
|---|---|---|---|
| Copy click | double click | Yes | disabled while busy |
| Copy click | click while "Copied" | Yes | copies again, timer restarts |
| Copy click | tab closed or switched mid copy | Yes | alive guard; timer cleared |
| Copy click | file changes on disk mid copy | Yes | one synchronous DOM read (text) |
| Copy click | huge CSV past 1,000 shown rows | Yes | tableCopy copies every row |
| Copy click | missing, too large, unreadable, empty | Yes | no button |
| Cmd+C | selection spans header and body | Yes | native copy |
| Cmd+C | partial list or table | Yes | orphans wrapped |
| Cmd+C | focus in another pane (terminal) | Yes | onCopy only on the tab body |
| Cmd+C | picture tab | Yes | native copy |

Findings: 1 (the ordering guard, now specified). Unhandled: 0.

### Section 5: Code quality

- cleanCopy's walker would branch past 5 on tag names: use a tag to handler
  table (keep, unwrap, drop, special: a, input, ol, footnote ref, picture)
  so each rule is one row.
- FileTabView is 160 lines; the copy state and onCopy stay in FileTabBody and
  the testable logic (cleanCopy, tableCopy, copyPicture) lives in
  fileTabCopy.ts. A `useTabCopy` hook was dropped in the eng review (S2): it
  could not be unit tested and added a file.
- FileChip's idle, busy, done, error copy state is similar but tied to its
  menu; not worth extracting for two callers.
- Names say what they do: cleanCopy, tableCopy, tsvCell, copyRich, copyImage.
Findings: 2 (handler table, hook). No decision needed: code arrangement.

### Section 6: Tests

```
  NEW THING                         | TYPE | TEST (test/copy-document.test.cjs)
  ----------------------------------|------|---------------------------------------------
  cleanCopy rules (A1, E4, P1)      | Unit | fake nodes: kept/unwrap/drop, links, pictures to
                                    |      | data-alt and never img, task boxes, footnotes,
                                    |      | data-copy skip, orphans, lists, code, tables,
                                    |      | whitespace, escaping, no class/style
  tableCopy + tsvCell (E3)          | Unit | null, quoting, th row, escaping, 1,001+ rows
  clipboardCopy (main)              | Unit | fake clipboard: bad input refused, one write with
                                    |      | both flavors, empty image refused, throw -> not ok
  ordering guard                    | Unit | controlled decode promise, isAlive false -> no IPC
  FileTabView wiring                | Src  | button only for ok and size > 0; onCopy ignores
                                    |      | selections outside the body; catch before
                                    |      | preventDefault
  MarkdownPreview data-alt          | Src  | both picture paths write data-alt
  Paste targets                     | Hand | Gmail, Docs, WordPress, LinkedIn, Excel; light
                                    |      | and dark theme; Mac (Windows ships untested)
```

Assertions: each rule above asserts exact output strings (HTML and text), not
"contains". no_claim: how each paste target renders the HTML (unit tests stop
at the clipboard; the hand check covers it, Windows not covered). Test that
would let it ship at 2 am: a real agent blog post with headings, a table, a
footnote, a task list and a local picture, copied in dark theme and pasted into
Gmail. Hostile QA: a link `[x](javascript:alert(1))` and `<script>` in the
source must paste as plain words. Flakiness: none (no time or network; the
2 s label timer is not asserted). Findings: 0 gaps.

### Section 7: Performance

- Largest structures: a 2 MB CSV becomes about 5 to 8 MB of HTML string once
  per click [estimated]; a 10 MB picture decodes to at most the canvas limit.
- Slowest paths: picture decode and PNG encode (hundreds of ms for a large
  photo) [estimated]; big CSV tableCopy (tens of ms) [estimated]; cleanCopy on
  a long document (under 10 ms) [estimated]. The busy state covers the wait.
- No database, no network, no cache needed. Findings: 0.

### Section 8: Observability

- Every failure logs `console.warn('[copy]', kind, error)` in the renderer;
  main returns the error string. The owner sees "Couldn't copy" at once.
- No usage metric: this is a local desktop action with no remote telemetry
  for UI clicks; a bug report reproduces in seconds by copying the same file.
Findings: 0.

### Section 9: Deployment

- No migration, no flag, no settings. Ships with the next release (0.2.8);
  rollback is a revert.
- Windows ships every release untested: `clipboard.write({text, html})` writes
  CF_HTML on Windows; the Edit menu's copy role and Ctrl+C both fire the DOM
  copy event. Hand check on Mac only.
- Post ship check: copy one Markdown draft and one CSV in the installed DMG,
  paste into Gmail and Sheets.
Findings: 0.

### Section 10: Long-term trajectory

- Debt: cleanCopy is tied to MarkdownPreview's markup (guarded by the source
  check). Reversibility 5/5.
- Phase 2: the same serializer serves Copy on Ask me or the Approvals inbox
  draft-to-post item when those are built; E1 (mail card copy) can reuse
  copyRich in an hour if the owner asks later.
- Retrospective: E4 (accepted against the defer recommendation) turned out to
  carry the design: it is why one DOM serializer replaced a second render path.
  Skipping E1 did not cost any accepted piece.
Findings: 0.

### Section 11: Design & UX

```
  file tab opens ─> reading (no Copy) ─> ok, size>0 ─> [Copy] idle
                                 └─> missing/too large/unreadable/empty (no Copy)
  [Copy] ─click─> busy (disabled) ─> "Copied" 2 s ─> [Copy]
                                 └─> "Couldn't copy" 2 s ─> [Copy]
  select text + Cmd+C ─> clean copy (no visible change, as native copy)
```

| FEATURE | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|---|---|---|---|---|---|
| Copy button | hidden | hidden | "Couldn't copy" | "Copied" | n/a |
| Selection copy | n/a | native no-op | native copy runs | clean copy | orphans wrapped |

- First thing seen: Copy is first in the header, before Open in app. Fits the
  less verbose UI rule: one word, no explanation, no InfoTip needed.
- Accessibility: a real button, keyboard reachable; the "Copied" and
  "Couldn't copy" words go in an `aria-live="polite"` span (the pattern in
  AddMailboxDialog.tsx:177) so screen readers hear them.
- The button keeps its width across the three labels (min-width from the
  longest), so the header does not jump.
- RTL: the header already lays out by direction; labels in ar.json.
Findings: 2 (aria-live, stable width). Recommend /plan-design-review only if
the owner wants a visual pass; the change is one button.

## Outside voice

Skipped by owner rule: Codex runs only as the adversarial pass through
`codex exec -p deepseek-review`, and any other Codex use needs the owner's say
(memory, 2026-10-25). No native replacement was run. Outside coverage:
none. Three independent Claude spec reviews ran in 0H.

## Approval readiness

Approval readiness: PASS. A1 (D1 A), E2 (D4 A), E3 (D5 A), E4 (D6 A), P1 (D7 A)
approved; E1 (D3 C) declined; mode D2 A; documents D8 A. Section findings are
implementation details inside those answers; no remedy was added without an
answer.

## What already exists

- `app:copyToClipboard` text bridge: kept as is, not reused for rich copy
  (it writes text only).
- FileChip copy state pattern: copied in shape, not extracted.
- MarkdownPreview safe render: reused as the source DOM.
- `parseDelimited`, `CSV_ROW_LIMIT`: reused for tableCopy.

## Dream state delta

After this ships, any draft the owner opens copies in one click and pastes
right. Still ahead: copy from cards and a "posted" mark (Approvals inbox TODO).

## Failure Modes Registry

```
  CODEPATH            | FAILURE MODE            | RESCUED? | TEST? | USER SEES?      | LOGGED?
  --------------------|-------------------------|----------|-------|-----------------|--------
  cleanCopy (button)  | throws                  | Y        | Y     | Couldn't copy   | Y
  cleanCopy (onCopy)  | throws                  | Y        | Y(src)| native copy     | Y
  tableCopy           | null rows               | Y        | Y     | Copied (raw)    | N (expected)
  copyPicture         | not shown or toBlob fail| Y        | Y     | Couldn't copy   | Y
  copyPicture         | tab switched mid copy   | Y        | Y     | nothing (right) | N
  copyRich (main)     | bad input / write throws| Y        | Y     | Couldn't copy   | Y
  copyImage (main)    | empty / write throws    | Y        | Y     | Couldn't copy   | Y
```

CRITICAL GAPS: 0.

## Scope Expansion Decisions

Full record: ~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-26-copy-document.md
- Accepted: E2 picture copy, E3 CSV as cells, E4 clean selection copy, P1 web pictures as alt text
- Deferred: none
- Skipped: E1 Copy on the email approval card

## Stale Diagram Audit

FileTabView.tsx, MarkdownPreview.tsx, main/index.ts and preload/index.ts hold
no ASCII diagrams this plan changes. docs/designs/open-file-tab.md describes
the tab header buttons; add one line there for Copy when this lands.

## Reality rows

- REALITY: premise-table pass 12 claims checked against code (FileTabView.tsx:101-109, main/index.ts:4696, preload/index.ts:814, MarkdownPreview.tsx:156-201, fs.ts:186,220, askFiles.ts:228), unverified=0
- REALITY: already-done pass no copy work on origin/main since 2026-10-20; base commit 9104c25b, git log on src/renderer/src/components/FileTabView.tsx:1 and --grep copy
- REALITY: surface-check pass IPC names new; existing `app:copyToClipboard` verified at main/index.ts:4696; Electron `clipboard.write`, `writeImage`, `nativeImage.createFromBuffer` are documented API
- REALITY: binding-decisions pass recent decisions (app-wide field style, less verbose UI) honored, ledger at docs/designs/copy-document.md:73; no overruled default reintroduced
- REALITY: numbers pass caps measured from fs.ts:186,220; HTML size and timings tagged [estimated]
- REALITY: deferred-asks pass no linked issue; owner ask (docs/designs/copy-document.md:6) covered except E1 skipped by owner (D3 C)
- REALITY: pr-count pass no .gstack/ship-policy.json, one PR on base 9104c25b

## Implementation Tasks

Synthesized from the CEO and eng reviews. Run with Claude Code; checkbox as you ship.

- [x] **T1 (P1, human: ~2h / CC: ~10min)** — main — clipboardCopy.ts (`copyRich(clipboard, input)`, `copyImage(clipboard, nativeImage, bytes)`), register app:copyRich and app:copyImage, preload copyRich and copyImage
  - Surfaced by: CEO Section 1, 2; spec review 3 (injected electron parts)
  - Files: src/main/clipboardCopy.ts, src/main/index.ts, src/preload/index.ts
  - Verify: node --test test/copy-document.test.cjs (clipboardCopy cases)
- [x] **T2 (P1, human: ~5h / CC: ~25min)** — renderer — fileTabCopy.ts: cleanCopy (tag handler table, whitespace and plain text rules, isBareLink), tsvCell, tableCopy, copyPicture
  - Surfaced by: accepted scope A1, E2, E3, E4, P1; eng S1, S2, 1.1, 2.2
  - Files: src/renderer/src/components/fileTabCopy.ts
  - Verify: node --test test/copy-document.test.cjs (cleanCopy, tableCopy, copyPicture cases)
- [x] **T3 (P1, human: ~30min / CC: ~5min)** — renderer — data-alt on ImageChip and MdImage; data-copy="skip" on the CSV row note
  - Surfaced by: spec reviews 2 and 3, P1
  - Files: src/renderer/src/markdown/MarkdownPreview.tsx, src/renderer/src/components/FileTabView.tsx
  - Verify: source checks in test/copy-document.test.cjs
- [x] **T4 (P1, human: ~3h / CC: ~15min)** — renderer — Copy button and its states inside FileTabBody (busy, Copied, Couldn't copy, timer cleared on unmount, alive flag), onCopy on the scroller after className, aria-live, stable width
  - Surfaced by: CEO Sections 4 and 11; eng 2.1
  - Files: src/renderer/src/components/FileTabView.tsx
  - Verify: FileTabView source checks; open-file-tab.test.cjs still green; hand check in the dev app
- [x] **T5 (P1, human: ~20min / CC: ~3min)** — i18n — fileTab.copy, fileTab.copied, fileTab.copyFailed in en, ar, zh-CN (no dashes)
  - Surfaced by: accepted scope (words); eng 2.3
  - Files: src/renderer/src/i18n/locales/en.json, ar.json, zh-CN.json, test/open-file-tab.test.cjs (:235 key list)
  - Verify: npm test (arabic-ui parity, i18n-keys-exist, open-file-tab)
- [x] **T6 (P1, human: ~4h / CC: ~20min)** — tests — test/copy-document.test.cjs per the eng Test review
  - Surfaced by: eng Section 3
  - Files: test/copy-document.test.cjs
  - Verify: npm test
- [ ] **T7 (P2, human: ~30min / CC: ~10min)** — QA — paste into Gmail, Google Docs, WordPress, LinkedIn, Excel in light and dark theme; one large photo
  - Surfaced by: CEO Section 6 no_claim; eng 4.1
  - Files: none
  - Verify: manual paste results noted in the PR
  - Done so far (2026-10-26): the serializer ran on a real Chromium page in Electron (react-markdown + GFM output, white on black styling, a real partial Range): clean HTML and text, no color, class or style. Paste into the target apps is still to do by hand.
- [x] **T8 (P2, human: ~20min / CC: ~5min)** — docs — docs/FEATURES.md entry; one line in open-file-tab.md for the Copy button
  - Surfaced by: Stale Diagram Audit, versioning rule
  - Files: docs/FEATURES.md, docs/designs/open-file-tab.md
  - Verify: read through

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | file tab has Open and Show only; clipboard  |
  |                      | bridge text only; Markdown pastes as symbols|
  | Step 0               | A1 formatted copy; E2, E3, E4, P1 added;    |
  |                      | E1 skipped; docs approved                   |
  | Section 1  (Arch)    | 1 issue found (markup coupling guard)       |
  | Section 2  (Errors)  | 9 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 open issues, 0 High severity              |
  | Section 4  (Data/UX) | 10 edge cases mapped, 0 unhandled           |
  | Section 5  (Quality) | 2 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 1 risk flagged (Windows untested)           |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 2 issues (aria-live, stable width)          |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 9 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 7 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 5 proposed, 4 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex skipped by owner rule (no coverage)   |
  | Lake Score           | 0/1 (D1 chose A 9/10 over C 10/10)          |
  | Diagrams produced    | 6 (architecture, flow, state, ordering,     |
  |                      |    data flow, UI flow)                      |
  | Stale diagrams found | 0 (one doc line to add)                     |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

## Eng review (2026-10-26)

Target: docs/designs/copy-document.md (this plan, after the CEO review). Report
file: this file.

### Scope Challenge

What already exists: `app:copyToClipboard` (main/index.ts:4696) writes text
only; MarkdownPreview renders safely; `parseDelimited` (delimited.ts);
`isBareLink` (mdLinks.ts:143); FileChip's copy state; the preload API type is
`typeof api` (preload/index.ts:1955). Search check: Electron's
`clipboard.write({ text, html })` writes both flavors in one call and builds
Windows CF_HTML itself [Layer 1]. TODOS.md: the Approvals inbox item can reuse
fileTabCopy later; nothing blocks this plan. No new artifact to distribute.

Complexity: 13 files and 3 new modules as planned [counted from the CEO task
list], so the gate trips. No feature cut proposed: every piece carries an
owner answer (D1, D4, D5, D6, D7).

- [INFORMATIONAL] (confidence: 9/10) test/load-ts.cjs:57 — `if (request.startsWith('.') || request.startsWith('@shared/'))`: tests resolve only relative and `@shared/` imports, so a serializer under markdown/ importing `@/components/delimited` would not load in node tests. (S1)
- [INFORMATIONAL] (confidence: 8/10) plan, Section 5 — a `useTabCopy` hook adds a file and a module that node tests cannot run (no DOM, no React renderer). (S2)

Structure: Smaller arrangement, 12 files and 2 new modules
(`components/fileTabCopy.ts` with cleanCopy, tsvCell, tableCopy, copyPicture;
`main/clipboardCopy.ts`; no hook). Original arrangement: 13 files, 3 modules.
Same features, contracts and tests in both.

Scope record: feature answers: none asked (no cuts proposed); structure: B
Smaller arrangement, auto-decided under the owner's standing rule "never ask
file or module layout choices; pick the recommended one" (memory
no-code-arrangement-questions), not asked; accepted scope: CEO scope A1, E2,
E3, E4, P1 unchanged; pending remedies: none.

Scope Challenge result: scope accepted as-is.

### 1. Architecture

```
  click ─> FileTabBody.copy()
            ├─ text/json ─> {text: read.text}
            ├─ csv ───────> tableCopy(parseDelimited(read.text)) | {text} on null
            ├─ markdown ──> cleanCopy(bodyEl)            (sync DOM read)
            └─ picture ───> copyPicture(img,{toPng,isAlive,send})
                              ├─ !img.complete ─> fail
                              ├─ draw now (sync) ─> await toPng ─> isAlive()? ─no─> stop
                              └─ send(png) ─> app:copyImage
           send ─> window.cth.copyRich | copyImage ─> main clipboardCopy ─> {ok}|{ok:false}
  Cmd+C ─> scroller onCopy ─> selection wholly in body? ─no─> native copy
                                └─yes─> try cleanCopy(fragment) ─throw─> native copy (warn)
                                         └─> setData(text[, html]); preventDefault
```

- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/components/FileTabView.tsx:49 — `if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);` runs on every reload. The planned picture path awaited `img.decode()` on the shown img, so a reload mid copy could swap or revoke the source and copy the new picture or fail, against the approved "copies the picture shown when the click landed". Fix applied as the implementation of that approved contract (D8 A): draw the already decoded img synchronously at the click; only `toBlob` is awaited. (1.1)
- [INFORMATIONAL] (confidence: 9/10) src/preload/index.ts:1955 — `export type CthApi = typeof api;`: the new preload methods are typed with no .d.ts edit. Factual note, no task. (1.2)

Production failure per new path: clipboard write throws on a locked
clipboard (Windows) -> `{ok:false}` -> "Couldn't copy"; huge photo PNG encode
returns null -> "Couldn't copy"; serializer throws on an unexpected node ->
button shows "Couldn't copy", selection falls back to native copy. All handled.
Security: unchanged from the CEO review (escaping, href allowlist, no img).
Distribution: none.

Dispositions: 1.1 accepted (implementation of approved contract D8 A); 1.2 noted.

### 2. Code quality

- [INFORMATIONAL] (confidence: 9/10) test/open-file-tab.test.cjs:219 — `assert.match(read('src/renderer/src/components/FileTabView.tsx'), /<div ref=\{scroller\} className="cth-file-tab"/);`: an `onCopy` inserted between `ref` and `className` breaks this guard. Put it after className. (2.1)
- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/markdown/mdLinks.ts:143 — `export function isBareLink(text: string, href: string): boolean`: already decides "the words are the address" for autolinks; the plain text rule reuses it before its extra normalization, so cards and copies agree. (2.2)
- [INFORMATIONAL] (confidence: 9/10) test/open-file-tab.test.cjs:235 — `for (const k of ['close', 'office', 'openInApp', ...]) assert.ok(f[k], ...)`: extend this list with copy, copied, copyFailed instead of a new locale test. (2.3)

Shared code: FileChip's copy state (FileChip.tsx:121,158-168) and the new
button state look alike but differ (FileChip rechecks the path and lives in a
menu); two callers with different contracts, no extraction. Error handling:
every catch logs kind and error and shows an outcome (CEO Section 2). Diagrams
in touched files: none to update besides this plan.

Dispositions: 2.1, 2.2, 2.3 accepted as implementation details of approved
behavior (D1, D8); no extraction.

### 3. Test review

Framework: node:test through `npm test` (tools/run-tests.cjs), TS loaded by
test/load-ts.cjs; source checks read files as text (open-file-tab.test.cjs).

```
CODE PATHS                                              USER FLOWS
[+] main/clipboardCopy.ts                               [+] Copy a draft from a tab
  ├── copyRich: bad input        [GAP→planned unit]       ├── [GAP→planned hand] Gmail/Docs/WordPress paste
  ├── copyRich: text+html write  [GAP→planned unit]       ├── [GAP→planned hand] LinkedIn plain paste
  ├── copyRich: write throws     [GAP→planned unit]       ├── [GAP→planned src]  no button when not ok/empty
  ├── copyImage: empty refused   [GAP→planned unit]       └── [GAP→planned unit] double click: busy
  └── copyImage: write throws    [GAP→planned unit]     [+] Copy a part
[+] components/fileTabCopy.ts                             ├── [GAP→planned src]  outside body -> native
  ├── cleanCopy: keep/unwrap/drop, links, isBareLink      ├── [GAP→planned unit] partial list/table wrapped
  │   pictures->alt, task box, footnotes, skip,           └── [GAP→planned src]  throw -> native (no preventDefault)
  │   whitespace, lists, code, tables, escaping         [+] Copy a CSV / picture
  │                                [GAP→planned unit]     ├── [GAP→planned unit] all rows, quoting, null
  ├── tableCopy + tsvCell          [GAP→planned unit]     └── [GAP→planned unit] picture: not shown, toBlob null,
  └── copyPicture                  [GAP→planned unit]                            tab closed before send
[+] MarkdownPreview data-alt       [GAP→planned src]
[+] FileTabView scroller regex     [★★ TESTED] open-file-tab.test.cjs:219 (must stay green)
[+] locale keys                    [★★ TESTED] open-file-tab.test.cjs:235 (extend), arabic-ui parity

COVERAGE (after planned tests): code paths 14/14 planned, user flows 9/9 planned (2 by hand)
QUALITY target: ★★★ for cleanCopy, tableCopy, clipboardCopy, copyPicture (behavior + edge + error)
```

No path needs E2E or an eval: no LLM change; the rendering targets are
outside the app and covered by the hand check (T7).

Value cards:
- Value: protects=Markdown copy writes exact allowlisted HTML and clean text; fails_when=a tag, attribute or ** leaks, or a rule regresses; why_new=no copy code exists; seam=none; no_claim=how Gmail renders it (hand check T7)
- Value: protects=no img, class or style ever reaches the copied HTML; fails_when=a picture or dark theme color leaks; why_new=P1 and E4 are new rules; seam=none; no_claim=none beyond protects
- Value: protects=CSV copies every row with TSV quoting and a th row; fails_when=rows cut at 1,000 or a newline cell splits a row; why_new=delimited.ts tests cover parsing only; seam=none; no_claim=Excel paste (hand check)
- Value: protects=main refuses bad input and reports a throwing clipboard; fails_when=a throw escapes the IPC or bad input is written; why_new=app:copyToClipboard has no test; seam=injected clipboard (production passes the real one); no_claim=real OS clipboard (fake clipboard)
- Value: protects=a tab closed before the PNG is ready sends nothing; fails_when=the alive check is dropped and a late picture overwrites a newer copy; why_new=new async path; seam=toPng injected (production passes the canvas encoder); no_claim=real canvas encode (fake toPng)
- Value: protects=a selection outside the body or a serializer throw keeps the native copy; fails_when=preventDefault runs before the try or the containment check is dropped; why_new=new handler; seam=none (source check); no_claim=the browser's copy event target (source check only)
- Value: protects=both picture paths in MarkdownPreview write data-alt; fails_when=a markup change drops it and chip words get copied; why_new=new attribute; seam=none; no_claim=none beyond protects

Tests made obsolete: none. Regression: the existing open-file-tab.test.cjs
guards (:219, :235) stay and are extended, not rewritten.

Test plan artifact: ~/.gstack/projects/agentvivekkumar-dontbemichael/moblizeit-mit-app-content-copy-option-d32902-eng-review-test-plan-*.md

Dispositions: no gaps beyond the planned tests; no new test policy to approve.

### 4. Performance

- [INFORMATIONAL] (confidence: 6/10) plan, Pictures — a 10 MB JPEG (the binary cap, fs.ts:220) can hold about 48 MP; a canvas PNG encode of that may take one to several seconds and send tens of MB over IPC [estimated, not measured]. The busy state covers the wait and a null blob shows "Couldn't copy". Medium confidence, verify with one large photo in T7. (4.1)
- Text paths: one synchronous walk per click; a 2 MB CSV builds a few MB of HTML once [estimated]. Use array join, not repeated string concat. No queries, no caches, no loops over IPC.

Dispositions: 4.1 accepted as a hand check in T7; no code change.

### Outside voice

Skipped by owner rule, as in the CEO review: Codex runs only as the DeepSeek
adversarial pass; any other Codex use needs the owner's say. No native
replacement. Outside coverage: none.

### TODOS.md

No new TODO: nothing found here is deferred.

### Approval readiness

Approval readiness: PASS. Accepted work cites CEO answers A1 (D1 A), E2 (D4 A),
E3 (D5 A), E4 (D6 A), P1 (D7 A), documents (D8 A); structure B by the owner's
standing layout rule; findings 1.1, 2.1, 2.2, 2.3 implement those approved
contracts; 4.1 is a hand check. No pending remedy.

### Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Main clipboard (T1) | src/main, src/preload | — |
| Serializer and markup (T2, T3) | src/renderer/src/components (fileTabCopy), src/renderer/src/markdown | — |
| Tab wiring and words (T4, T5) | src/renderer/src/components (FileTabView), i18n | T1, T2 |
| Tests and docs (T6, T8) | test, docs | T1 to T5 |

Lane A: T1. Lane B: T2 then T3. Then T4, T5, T6, T8 in one lane. Conflict:
T3 and T4 both touch FileTabView.tsx, so they stay in the same lane. The whole
build is about an hour of CC time, so sequential implementation in one session
is the practical choice; two lanes would save minutes.

### Failure modes

All new paths have handling and a planned test; none is silent (CEO Failure
Modes Registry, updated for copyPicture). Critical gaps: 0.

### Reality rows (eng)

- REALITY: premise-table pass 9 claims checked (load-ts.cjs:57, open-file-tab.test.cjs:219,235, mdLinks.ts:143, preload/index.ts:1955, FileTabView.tsx:49, fs.ts:220, main/index.ts:4696), unverified=0
- REALITY: already-done pass no copy work on origin/main since 2026-10-20; base commit 9104c25b, git log on src/renderer/src/components/FileTabView.tsx:1 and MarkdownPreview.tsx:1
- REALITY: surface-check pass `npm test` runs tools/run-tests.cjs (package.json:26); Electron clipboard.write documented
- REALITY: binding-decisions pass CEO D1 to D8 kept (docs/designs/copy-document.md:73); owner layout rule applied to structure
- REALITY: numbers pass caps from fs.ts:186,220; photo and HTML sizes tagged [estimated]
- REALITY: deferred-asks pass no linked issue; the owner ask at docs/designs/copy-document.md:6 is covered except E1, skipped by the owner
- REALITY: pr-count pass no .gstack/ship-policy.json (default one PR per wave); one PR on base 9104c25b, test runner package.json:26

### Completion summary

- Step 0: Scope Challenge — scope accepted as-is (structure: smaller arrangement, 12 files, 2 new modules)
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 2 issues found
- Code Quality Review: 3 issues found
- Test Review: diagram produced, 0 gaps beyond planned tests
- Performance Review: 1 issue found
- NOT in scope: written (CEO section)
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, skipped (owner rule)
- Parallelization: 2 lanes possible, 1 recommended (sequential)
- Lake Score: N/A (no completeness-scored question in this review)

### Suppressed findings

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 5 proposals, 4 accepted, 0 deferred |
| Outside Review | codex (skipped by owner rule) | Independent 2nd opinion | 0 | skipped | no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 6 issues, 0 critical gaps (all resolved into tasks) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, skipped in both the CEO and eng reviews (owner rule: Codex only for the DeepSeek adversarial pass); no completed external review.
- **VERDICT:** CEO CLEARED. Eng review complete with 6 issues found and folded into tasks T1 to T8, 0 critical gaps, 0 unresolved; its logged status is ISSUES OPEN because issues were found, not because any is open. Ready to implement.

NO UNRESOLVED DECISIONS
