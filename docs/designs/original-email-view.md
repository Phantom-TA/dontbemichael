# See the original email inside the office

Owner, 2026-10-29 (screenshot: task detail for "GreenWorld: free scoping review",
question "Dennis Sanders at GreenWorld replied, and Dwight needs your call on the
answer", with a Draft chip but nothing for Dennis's email): "when a response is
composed based on an email, business owner have urge to see that email exactly as
it came. currently, there is no way to do that except owner manually going to the
mail box and searching it. it will be great to see it right here in the office".

Status: CEO review complete (/plan-ceo-review, mode SELECTIVE EXPANSION, 2026-10-29); plan approved by the owner (D8). Eng review complete 2026-10-29 (R2, R5 decided).
Built on the running branch (mit/review-pr-645-15b862), 2026-10-29: tests `test/email-link`, `email-frame`, `email-pictures`, `email-original`, `email-chip`.

## 0A. Premise

- **Real problem:** a question or a draft reply is built on an email, but the card
  names that email only in words ("Dennis says he doesn't see what we have to do").
  Before the owner approves a reply they want to check the source themselves: tone,
  who was copied, what exactly was asked. Today that means leaving the app, opening
  the mailbox and searching.
- **Why it matters more here than in a mail app:** the owner approves words an agent
  wrote on their behalf, from a summary an agent wrote. The original email is the
  only check against a wrong summary, or a planted instruction an agent obeyed. The
  app already screens email text as untrusted for agents (`markUntrustedMessage`,
  `src/main/mail.ts:1483`); the owner seeing the source is the human half of that.
- **Proxy or direct:** direct. The chip opens the actual message from the owner's
  connected mailbox, not an agent's retelling.
- **Do nothing:** every email based approval stays a trip to the mailbox, or the
  owner approves without checking.

## 0B. Existing code to reuse

| Sub-problem | Reuse | Receipt |
|---|---|---|
| Stable id for an email | The agent's `read` already returns the RFC Message-ID header | `src/main/mail.ts:838` |
| Ids that are not stable | Tool ids are `folder:uid`; archiving moves a message, so its uid changes | `src/main/mail.ts:195-206`, `:752` |
| Find a message in any folder | Inbox, archive (Gmail All Mail or `\Archive`), sent lookups | `src/main/mail.ts:596-627` |
| Fetch and parse | `imapflow` + `mailparser` installed; `readWhole` parses a whole message; `threadOf` fetches `source` | `package.json:62-63`, `src/main/mail.ts:790`, `:869` |
| Which email a reply answers | Send on approval proposals keep `replyTo` and `thread.inReplyTo` (the original's Message-ID) | `src/shared/mailProposals.ts:33-38`, `src/main/mail.ts:1509-1522` |
| Chips inside question text | File chips replace a path in card markdown | `src/renderer/src/components/FileChip.tsx`, `src/renderer/src/markdown/remarkFileChips.ts` |
| Open as an office tab | `openFileTab` puts a tab next to Who talks to whom, closes the task detail, and dedupes by id | `src/renderer/src/store/store.ts:1500`, `src/renderer/src/store/fileTabs.ts:32-40` |
| Show outside HTML safely | Release drops render author HTML in `sandbox="allow-popups"` with a `default-src 'none'` CSP | `src/shared/releaseDrop.ts:522-545`, `src/renderer/src/components/ReleaseDrop.tsx:144` |
| Links from that HTML | Window open handler sends only http(s) to the browser; will-navigate blocks the rest | `src/main/index.ts:3807-3821` |
| Agents carrying a link from an email into an ask | Triage and ask rules already carry website links | `src/main/hive.ts:452`; learning `ask-card-drops-email-link` |

| Let a custom link scheme through card markdown | `placeUrlTransform` lets only `dbm:` through; every other scheme goes to react-markdown's `defaultUrlTransform`, which drops `email:` today. The `dbm:` PlaceChip branch is the pattern | `src/renderer/src/markdown/placeUrl.ts:9-10`, `MarkdownPreview.tsx:120-123` |
| Gmail detection without a connection | `MailboxRecord.provider` and `address` | `src/shared/mailboxes.ts:25-30` |

No rebuild. Not reusable: Gmail read through the Claude connector (not an app
mailbox) never goes through `read`, so it gets no link and no chip. Out of scope.

## 0C. Dream state

```
  CURRENT                        THIS PLAN                         12-MONTH IDEAL
  Card names an email in    -->  An email chip on questions    -->  Every outward action shows its
  words; owner searches          and reply cards opens the          evidence: the email it answers,
  the mailbox by hand.           message as it arrived, in an       the thread, the record it used,
                                 office tab, read only, nothing     one click each, and the owner
                                 leaves the machine.                can answer from the same view.
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| MODE (owner) | Review mode | none | SELECTIVE EXPANSION | approved | Owner, 2026-10-29, review mode question |
| C1 (owner) | How the app knows which email a question is built on | Email named in words only | A: the read result carries a named email link; members and Michael carry it like a web link; cards show it as a chip | approved | Owner D1 = A, 2026-10-29. Covers the read result link, the agent carry rule, and the chip on every card mode surface |
| C2 (owner) | Pictures from the web inside the email | n/a | A: blocked until the owner clicks Show pictures; pictures inside the email always show | approved | Owner D2 = A, 2026-10-29 |
| E1 (owner) | Send on approval card shows the email it answers | Card shows the draft only | Chip from the proposal's reply record, no agent change | approved (Add) | Owner D3 = Add, 2026-10-29 |
| E2 (owner) | Open in Gmail | none | Button on the email tab and its error state, Gmail and Google Workspace mailboxes only | approved (Add) | Owner D4 = Add, 2026-10-29 |
| E3 (owner) | Whole conversation in the tab | none | Earlier messages, collapsed | deferred | Owner D5 = Defer, 2026-10-29; TODOS.md |
| E4 (owner) | Open or save attachments | none | Opening and saving deferred | deferred | Owner D6 = Defer, 2026-10-29; TODOS.md |
| E4-list (owner) | Attachment names and sizes on the tab | none | Listed, not openable | approved | Part of the core tab; D6's Defer option text: "Names and sizes shown; opening is a TODO" |
| R1 (owner) | Opening an email in the office never changes the mailbox (never marks it read, moves or flags it) | n/a | Read only: read only folder lock, PEEK fetch | approved | Owner D7 = A, 2026-10-29 |
| DOC (owner) | Plan and CEO summary versions | n/a | approve | approved | Owner D8 = A, 2026-10-29; R2 and R5 stay open for eng review |

Approval readiness: PASS. Checked C1 (D1 A), C2 (D2 A), E1 (D3 Add), E2 (D4 Add), E3 (D5 Defer), E4 (D6 Defer), E4-list (D6 Defer option text), R1 (D7 A), DOC (D8 A). R3 and R4 are left out of scope (never approved); R2 and R5 are open engineering choices, not accepted work.
| R2 (eng) | How Show pictures loads web pictures, given the app CSP a `srcdoc` frame inherits | n/a | Main fetches the pictures and inlines them as data, or a frame on its own origin with its own CSP header | decided | Eng review 2026-10-29: main fetches and inlines pictures (see engineering ledger R2, R6) |
| R3 (owner) | Product telemetry event for email opens | n/a | Not added; the local log line only | declined in review (not in approved scope) | Spec review 2026-10-29: event was not an approved row |
| R5 (eng) | Which IMAP connection the owner fetch uses | n/a | Recommended: its own short lived read only connection, so a 25 MB open never holds the agents' folder lock (their calls time out at 30 s) and an agent's long search never stalls the owner | decided | Eng review 2026-10-29: own short lived read only connection (see engineering ledger R5) |
| R4 (owner) | Search junk and trash for a moved email | n/a | Not searched; not found text says it may be in Trash or Junk | dropped (not in approved scope) | Spec review 2026-10-29: `folderOf` refuses them by rule (`src/main/mail.ts:611-623`) |

## Behavior changes (agents)

| Rule today | Proposed | Who | What the owner sees |
|---|---|---|---|
| `read` returns id, from, subject, text, `messageId` | Also returns `link`, a ready named link such as `[Dennis Sanders, 27 Oct](email:<mailbox id>/<Message-ID>)` | every member with mail read | nothing directly |
| Triage, ask and HIVE rules carry website links from an email into the filing and the ask (`src/main/hive.ts:452`) | Same clause adds: carry the `link` of every email the filing is built on, as written | members, Michael | an email chip under or in the question |

Both are approved by D1 (A).

## Accepted scope

1. **Email link.** `src/shared/emailLink.ts`: format and parse `email:<mailbox id>/<url encoded Message-ID>` with a label made by the app: sender display name (else address) and a fixed date form `27 Oct` (English month, the Mac's own timezone; the app has no office timezone setting), cut to 60 units with `clipUnits`, brackets and new lines removed. Parse refuses anything else.
2. **Read result.** `read` in `src/main/mail.ts:1478` adds `link` when the message has a Message-ID; none when it has no Message-ID (the agent names it in words, as today).
3. **Agent rule.** The carry clause in `hive.ts` (triage, ask, standing rules) and the HIVE guide.
4. **Owner fetch.** `MailService.original(mailboxId, messageId)`: owner only IPC, not the broker. Mailbox id must be a configured mailbox; the Message-ID must look like `<...@...>` and be at most 998 characters. On Gmail one `X-GM-RAW rfc822msgid:` search in All Mail finds it under any label (imapflow `gmraw`, `node_modules/imapflow/dist/cjs/types.d.ts:439`). Elsewhere `HEADER Message-ID` in inbox, archive, sent, then every other folder the team may read (the label folders agents archive into), never spam, trash or drafts (R4). Several hits: the newest. Folders open read only (imapflow `readOnly` lock, IMAP EXAMINE), and fetch uses `BODY.PEEK` (imapflow's fetch builds PEEK atoms, `node_modules/imapflow/dist/cjs/commands/fetch.js:41-53`) (R1). Connection: its own short lived read only connection per open (R5). A message up to the 25 MB cap is parsed whole with `simpleParser`; a bigger one uses the existing part by part text read (`src/main/mail.ts:845-866`) and returns headers and text only. Returns headers, html, text, attachment names and sizes, inline `cid:` images as data URIs under a size cap. Results are cached in main, keyed by mailbox id and Message-ID, capped by bytes.
5. **Chip.** `placeUrlTransform` lets `email:` through (beside `dbm:`), and the `a` renderer gets an `email:` branch like the PlaceChip one. Card mode only: Ask me (`AskMeTab`), task detail (`TasksKanban`), Michael's dock (`MichaelDock`), and the other `variant="card"` surfaces (`CommandCenterPanel`, `MemoryNotes`, `ProfileTab`) get it for free.
6. **Email tab.** A tab like a file tab: From, To, Cc, Date, Subject as fields; body in a frame with `sandbox="allow-popups"` (as the release drop; every popup is denied and handed to the browser) (no scripts, no same origin), CSP `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:` (inline `style` attributes work under `'unsafe-inline'`), `cid:` sources rewritten to their data URIs, `<base target="_blank">` added; pictures from the web (http and https) blocked with one Show pictures button (C2; main fetches them and inlines them as data, R2); attachment names and sizes (E4-list); Open in Gmail for Gmail mailboxes (E2).
7. **Reply card (E1).** Send on approval cards show a chip "Replying to <proposal `to`>" (no date: the proposal has no sender or date of the original) from `thread.inReplyTo` and the proposal's mailbox. Known gap: a proposal filed while the server could not be reached has no `thread` (`src/main/mail.ts:1513-1518`), so that card shows no chip.
8. **Open in Gmail (E2).** `https://mail.google.com/mail/?authuser=<mailbox address>#search/rfc822msgid%3A<url encoded Message-ID>`, shown when the configured mailbox's `provider` is Gmail or Google Workspace, on the tab and on every error state where the mailbox record still exists.

## NOT in scope

| Item | Disposition | Reason |
|---|---|---|
| E3 whole conversation | Deferred, TODOS.md | Owner D5: single email first, thread after real use |
| E4 open or save attachments | Deferred, TODOS.md | Owner D6: outside files need their own safety design |
| Gmail read through the Claude connector | Not in scope | No app credential; E2 covers Gmail by link |
| Replying from the email tab | Not in scope | Michael and the members own replies; the owner answers the question |
| Backfilling links on old cards | Not in scope | Old asks have no Message-ID in their text |

## What already exists

See 0B: Message-ID on read (reused), folder lookups (reused), simpleParser (reused),
proposal reply record (reused for E1), file chip pipeline and tabs (pattern reused,
new chip kind), release drop frame and CSP (pattern reused), window open handler
(reused unchanged), link carry rule (extended).

## Dream state delta

After this, emails are one click from the card; threads (E3), attachments (E4) and
the same evidence chip for other connected apps (a HubSpot record, a QuickBooks
invoice) remain. The `email:` link is the first non file evidence chip, so the next
ones follow the same path.

## Section 1: Architecture

```
  AGENT SIDE                                   OWNER SIDE
  md-mail read ──> broker ──> mail.ts read      Card markdown (Ask me, task detail,
     │                         adds `link`        dock, reports, reply card)
     ▼                                               │ `email:` link
  member filing (triage) ──> Michael's ask ─────────>│
                                                     ▼
  Send on approval proposal ──(thread.inReplyTo)──> Email chip ──click──> openEmailTab
                                                                               │
                                     IPC mail:original (owner only) <──────────┘
                                               │
                                  MailService.original ── inFolder lock ── IMAP (PEEK)
                                               │ simpleParser
                                               ▼
                         { headers, html, text, attachments, cid images }
                                               │
                         Email tab: fields + sandboxed frame (CSP, no scripts)
                                               │ link click
                                   setWindowOpenHandler: http(s) only ─> browser
```

- **Boundary:** agents never call `original`; it is an owner IPC. The broker and the
  agents' grants are unchanged.
- **Coupling added:** card markdown learns one scheme (`email:`); fileTabs learns a
  second tab kind. Both justified; no new store.
- **10x / 100x:** one fetch per open, small in-memory cache (by bytes). The first
  thing to strain is the shared IMAP lock: an owner open waits behind an agent's
  long search (up to the 30 s call timeout). Loading state covers it.
- **Production failure per integration:** IMAP auth expired (error state, Settings
  link), message moved to trash (found with a note), Microsoft blocking IMAP
  (error, no Gmail button).
- **Rollback:** revert the release. Old renderers drop an `email:` href
  (`defaultUrlTransform`), so the label shows as plain words. Reversibility 4/5:
  the link text stays in old cards.
- **Platform:** the `email:` chip is the first evidence chip; the same parse, chip
  and tab path fits a HubSpot or QuickBooks record later.

**Findings:** none needing a decision. E1 fits cleanly (same chip, same tab).

## Section 2: Error and Rescue Registry

```
  CODEPATH                 | WHAT CAN GO WRONG                   | KIND (MailErrorKind)
  -------------------------|-------------------------------------|---------------------
  parse email: link        | malformed link                       | renderer, no IPC
  MailService.original     | mailbox id not in config (removed)   | not-found, where: 'mailbox'
                           | password or app password rejected    | auth
                           | Microsoft blocks IMAP                | provider-blocked
                           | offline, DNS, TLS                    | network
                           | lock wait plus fetch over 30 s       | timeout
                           | no folder holds the Message-ID       | not-found, where: 'message'
                           | message over 25 MB                   | none: partial result, large: true
                           | MIME parse fails                     | unknown
  Email tab frame          | html empty, text only                | none (text view)
                           | link click to non http(s)            | none (refused)

  KIND / RESULT          | RESCUED | ACTION                     | OWNER SEES
  -----------------------|---------|----------------------------|------------------------------
  malformed link         | Y       | no fetch                   | "This email link is broken."
  not-found mailbox      | Y       | no fetch                   | "This mailbox isn't in the office anymore."
  auth                   | Y       | stop, no retry loop        | "Sign in failed" + Settings, Mailboxes + Open in Gmail
  provider-blocked       | Y       | stop                       | provider's reason, as Settings shows it + Open in Gmail
  network / timeout      | Y       | Try again button           | "Couldn't reach the mailbox." + Open in Gmail
  not-found message      | Y       | searched every team folder | "Not in this mailbox outside Trash and Junk." + Open in Gmail
  large: true            | Y       | headers and text only      | "Too large to show in full" note
  unknown (parse)        | Y       | fall back to raw text      | plain text view
```

Open in Gmail shows only when the mailbox record exists and is Gmail. No catch
all: each kind maps to its own state. No GAP left unrescued.

## Section 3: Security and threat model

| Threat | Likelihood | Impact | Mitigation in plan |
|---|---|---|---|
| Script in email HTML | High | High | Frame `sandbox` without `allow-scripts` or `allow-same-origin`; CSP `default-src 'none'` (release drop pattern) |
| Tracking pixel / web fonts / CSS images | High | Med | C2: `img-src data:` until Show pictures; `font-src data:`; no remote `style-src` |
| Frame navigates itself (link without target, meta refresh, form) | Med | Med | Strip `<meta http-equiv>` and `<base>` in main; add `<base target="_blank">`; main refuses every subframe navigation (`will-frame-navigate`) |
| Link to a non web scheme (file:, custom) | Med | High | `setWindowOpenHandler` opens http(s) only (`src/main/index.ts:3807`) |
| Preload API reachable from the frame | Low | High | Main window is `sandbox: true` (`src/main/index.ts:3725`) and leaves `nodeIntegrationInSubFrames` off; T5 adds a test that pins both |
| Sender display name on the chip claims someone else | Med | Low | The tab shows the real address; chip look is a design review item |
| Forged `email:` link in agent text | Low | Low | Mailbox id must be a configured mailbox; the view is read only and shows the owner their own mail |
| Phishing link text unlike its address | Med | Med | Link opens in the browser, not the app; host shown on hover is a design review item |
| Email content leaking | Low | High | Never logged (log line: mailbox id, outcome, ms), never in telemetry, not written to disk; memory cache only |
| Opening changes the mailbox | Med | Med | R1 (pending D7): PEEK fetch, no flags |

No new secret, no new dependency (no DOMPurify: sandbox plus CSP plus main side
stripping, the release drop's proven set).

**Open feasibility item R2 (eng review decides before building):** a `srcdoc`
frame inherits the app's CSP (`img-src 'self' data: blob:`,
`src/renderer/index.html:6`), so web pictures stay blocked even after Show
pictures. Two candidates: main fetches the pictures (no cookies, no referrer)
and inlines them as data, so the frame never needs the network; or a frame on its
own origin (custom protocol) with its own CSP header. C2's behavior stays as
approved either way.

## Section 4: Data flow and interaction edge cases

```
  email: link ─> PARSE ─> mailbox configured? ─> SEARCH folders ─> FETCH (PEEK) ─> PARSE MIME ─> TAB
     │ malformed  │ no ──> "isn't connected"     │ none ──> "not in this mailbox"   │ fail ──> raw text
     │ empty      │                              │ several ──> newest, same message │ huge ──> headers + text
     └─> plain words, no chip                    └─> auth/network ──> error state + Open in Gmail
```

| Interaction | Edge case | Handled | How |
|---|---|---|---|
| Click chip | double click | Y | `openTab` dedupes by id (`fileTabs.ts:33`) |
| Click chip | from task detail modal | Y | `openFileTab` closes the detail, as file chips do |
| Open tab | leave while loading | Y | result for a closed tab is dropped |
| Open tab | same email from two cards | Y | same tab id from mailbox + Message-ID |
| Many links | more than 10 in one ask | Y | cap like file chips (`MAX_NAMES`) |
| Show pictures | clicked twice | Y | idempotent state |
| Email moved after the agent read it | archived, labelled | Y | Message-ID search, not the uid |
| Owner opens while an agent searches | separate connections | Y | the owner open has its own connection (R5); no shared lock |

Async ordering: the owner open uses its own connection (R5), so it shares only the
mailbox on the server with agents. Invariant: an owner open never changes flags or folders (R1). Test:
open during an agent `search` and `mark_read`; flags after equal flags before plus
only the agent's change.

## Section 5: Code quality

- `original` reuses `inFolder`, `folderOf` and the `simpleParser` path in `readWhole`; it must not reuse `markUntrustedMessage` (that labels text for agents, not the owner).
- One formatter (`emailLink.ts`) for the read result and the E1 reply chip; one parser for the chip.
- The tab view must stay under 5 branches per function: header, frame, notice and error state as small parts.
- Over engineering avoided: no thread model, no attachment pipeline, no on disk cache.

## Section 6: Tests

| New thing | Type | Happy | Failure | Edge |
|---|---|---|---|---|
| `emailLink` format/parse | unit | round trip with `<a@b>` ids | malformed refused | label with `]`, new line, emoji cut at 60 |
| read adds `link` | unit (fake IMAP) | link present | no Message-ID, no link | label from a sender with no name |
| `original` | integration (fake IMAP, existing `test/mail-*.test.cjs` pattern) | found in inbox | auth, timeout, not found (mailbox vs message) each map to their state | found only in archive; only in sent; over 25 MB gives headers and text |
| Open in Gmail | unit | URL with `authuser` and encoded `rfc822msgid` | non Gmail mailbox: no button | removed mailbox: no button |
| `email:` through markdown | renderer unit | `placeUrlTransform` keeps `email:` | `javascript:` still dropped | |
| R1 no flag change | integration against the hoodiecrow local IMAP server already used by `test/mail-integration.test.cjs` (so the real FETCH and EXAMINE commands run) | flags unchanged after open | | open during agent mark_read |
| Gmail search | integration (fake with `gmraw`) | found under a label | | duplicate Message-ID: newest |
| Message-ID guard | unit | `<a@b>` accepted | over 998 chars, no `@`, CRLF refused | |
| Owner only | unit | IPC answers the renderer | broker has no route to `original` | unknown mailbox id refused |
| Frame CSP and sandbox | unit on the srcdoc builder | CSP present, no `allow-scripts` | meta refresh and base stripped | Show pictures adds only `https:` to img-src |
| Chip | renderer unit | `email:` link becomes a chip in card mode | non card mode leaves text | 11 links: 10 chips |
| Reply chip (E1) | renderer unit | proposal with `thread` shows chip | no thread, no chip | Send only grant record |
| Agent rule | source pin (`test/link-names.test.cjs` pattern) | carry clause present in triage, ask, HIVE | | |

2am Friday test: a fake mailbox with the email archived after the agent read it,
opened from a task detail, pictures blocked, then shown. Hostile QA: an email with
`<script>`, a meta refresh, a `file:` link, and a 1x1 tracking image; none run,
navigate, open or load. Chaos: drop the IMAP connection mid fetch; the tab shows
Try again and the next open works.

## Section 7: Performance

- Slowest paths: lock wait behind an agent call (up to 30 s), a 25 MB message, a
  full folder search for a missing Message-ID on a non Gmail mailbox (one round trip per folder).
- Memory: cache in main, keyed by mailbox id and Message-ID, capped by bytes
  (about 30 MB); cid images capped (about 5 MB per email). No disk cache.
- One extra short lived connection per open (R5), never more than one per mailbox at a time.

## Section 8: Observability

- Log line per open: `[mail] owner-view <mailbox id> <kind or ok> <ms>`, no
  sender, subject or Message-ID (the D14 rule for the office log).
- No product telemetry event (R3: not in approved scope). The local log line is
  enough to debug a reported failure; Report a problem already carries the log.
- Three weeks later: the log shows which mailbox failed and how; the card still has
  the link to reproduce.

## Section 9: Deployment and rollout

No migration, no flag. Ships in the next release on the running branch. Old cards
have no links; new asks get them after the agents restart with the new rule (the
rule text reaches an agent on its next start). Post release check: open one email
chip from a real ask and one reply card chip, on Mac and Windows.

## Section 10: Long term

Reversibility 4/5. Debt: the `email:` scheme is now part of card text in
`tasks.json`; keep the parser tolerant forever. Phase 2: E3 thread, E4
attachments, evidence chips for other connected apps. Retrospective: E1 and E2
were the load bearing picks (E1 covers the most common approval with no agent
cooperation; E2 covers every failure for Gmail offices).

## Section 11: Design and UX

```
  Card (Ask me / task detail / dock / reply card)
     [✉ Dennis Sanders, 27 Oct]  ──click──>  Email tab (next to Who talks to whom)
                                              ├─ loading: fields skeleton
                                              ├─ ok: From / To / Cc / Date / Subject
                                              │      [Pictures from the web are hidden] [Show pictures]
                                              │      body (frame)        attachments: name, size
                                              │      [Open in Gmail]  (Gmail only)
                                              ├─ partial: too large, text only note
                                              └─ error: one line reason + Try again / Settings / Open in Gmail
```

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Email tab | fields skeleton | text only email shows text | one line reason + action | fields + body | pictures hidden; too large |

Owner rules apply: fields only, explanations behind InfoTip (less verbose UI); the
app wide field style; no dashes in any copy. Recommend /plan-design-review before
building (chip look, notice bar, tab header).

## Failure Modes Registry

```
  CODEPATH            | FAILURE MODE          | RESCUED? | TEST? | USER SEES?            | LOGGED?
  --------------------|-----------------------|----------|-------|-----------------------|--------
  emailLink.parse     | malformed link        | Y        | Y     | "link is broken"      | N (renderer)
  original            | mailbox not connected | Y        | Y     | reason + Gmail        | Y
  original            | auth                  | Y        | Y     | reason + Settings     | Y
  original            | network / timeout     | Y        | Y     | Try again + Gmail     | Y
  original            | not found             | Y        | Y     | reason + Gmail        | Y
  original            | too large             | Y        | Y     | partial note          | Y
  original            | MIME parse            | Y        | Y     | raw text              | Y
  read link           | no Message-ID         | Y        | Y     | words only, no chip   | N
  agent rule          | Michael drops link    | N        | Y*    | words only, no chip   | N
```

`*` source pin only. Not a CRITICAL GAP: the owner still sees today's behavior, and
E1 covers reply cards without any agent cooperation.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2h / CC: ~10min)** shared: `emailLink.ts` format and parse. Verify: unit tests above.
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** main: `read` adds `link`. Files: `src/main/mail.ts`. Verify: fake IMAP test.
- [ ] **T3 (P1, human: ~1d / CC: ~45min)** main: `MailService.original` + owner IPC + preload. Files: `src/main/mail.ts`, `src/main/index.ts`, `src/preload/index.ts`. Verify: integration tests incl. R1.
- [ ] **T4 (P1, human: ~2h / CC: ~10min)** main: frame navigation guard (`will-frame-navigate`), srcdoc builder in shared (CSP, stripping, cid rewrite), test pinning `sandbox: true` and no `nodeIntegrationInSubFrames`. Before T5; needs R2 decided. Verify: unit + manual meta refresh email.
- [ ] **T5 (P1, human: ~1d / CC: ~45min)** renderer: `email:` in `placeUrlTransform`, Email chip branch in card markdown, email tab kind, tab view with the frame. Files: `src/renderer/src/markdown/placeUrl.ts`, `MarkdownPreview.tsx`, `src/renderer/src/store/fileTabs.ts`, `store.ts`, new `EmailTabView.tsx`, locales. Verify: renderer units + hostile QA email.
- [ ] **T6 (P2, human: ~2h / CC: ~10min)** E1 reply chip. Files: `MailProposalCards.tsx`. Verify: renderer unit.
- [ ] **T7 (P2, human: ~1h / CC: ~5min)** E2 Open in Gmail. Verify: unit on the URL builder.
- [ ] **T8 (P1, human: ~2h / CC: ~10min)** agent rule carry clause. Files: `src/main/hive.ts`, HIVE guide. Verify: source pin test.
- [ ] **T9 (P2, human: ~30min / CC: ~5min)** docs/FEATURES.md entry. Verify: read through.

## Reality

REALITY: premise-table pass unverified=0 every claim above carries a receipt src/main/mail.ts:838
REALITY: already-done pass no commit on origin/main since 2026-10-20 adds an email view src/main/mail.ts:811
REALITY: surface-check pass no new CLI or route; one owner IPC named in T3 src/main/index.ts:3807
REALITY: binding-decisions pass branch decision log empty; owner rules from memory apply (no dashes, less verbose UI, neutral examples) docs/designs/named-links.md:1
REALITY: numbers pass file counts and sizes are [estimated]; no measured baseline used src/main/mail.ts:56
REALITY: deferred-asks pass no linked issue src/main/mail.ts:1
REALITY: pr-count pass no ship-policy file; one PR on the running branch src/main/mail.ts:1

PLAN_REALITY: phase=ceo rows=7/7 missing=none unverified=0 verdict=complete

## Scope Expansion Decisions

Full record: `~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-29-original-email-view.md`.

- Accepted: E1 reply card chip, E2 Open in Gmail
- Deferred: E3 whole conversation, E4 open or save attachments (TODOS.md, "Original email view")
- Skipped: none

## Outside voice

- Spec review (Claude subagent, 1 run): 6/10, 21 issues; 19 applied as factual corrections, not re-verified by a second run. Two became open rows: R1 (settled by D7) and R2.
- DeepSeek adversarial pass (`codex exec -p deepseek-review`, 1 run): 17 findings. Applied: Gmail `X-GM-RAW` search, search every team folder, read only folder lock, local IMAP server test for R1, `allow-popups`, `style-src 'unsafe-inline'`, `cid:` rewrite, http and https for Show pictures, E1 label without sender or date, Message-ID guard, guard task before the renderer task. New open row: R5 (own connection). Already handled: Gmail URL, too large path, file tabs are not persisted (no migration). Not taken: "Stop and rework" because question chips depend on agents carrying the link; the owner accepted that in D1 with that drawback stated, and reply cards (E1) do not depend on it.
- Cross model tension: DeepSeek rates the agent carried link Critical; this review rates it acceptable because the failure is today's behavior (words only), not a wrong email. Worth watching after release: how many email based asks carry a chip.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | Message-ID already on read; reply record    |
  |                      | knows the answered email; markdown drops    |
  |                      | email: links today; no DOMPurify needed     |
  | Step 0               | C1 link in text, C2 pictures blocked        |
  | Section 1  (Arch)    | 0 issues needing a decision                 |
  | Section 2  (Errors)  | 11 error paths mapped, 0 GAPS               |
  | Section 3  (Security)| 10 threats, 0 High unmitigated; R2 open     |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | Table produced, 0 gaps                      |
  | Section 7  (Perf)    | 1 issue (lock contention, R5)               |
  | Section 8  (Observ)  | 0 gaps (log line; telemetry declined)       |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues; /plan-design-review recommended   |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 11 rows, 0 CRITICAL GAPS                    |
  | Failure modes        | 9 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 2 items (E3, E4)                            |
  | Scope proposals      | 4 proposed, 2 accepted                      |
  | CEO plan             | written                                     |
  | Outside voice        | DeepSeek completed; spec review completed   |
  | Lake Score           | 1/1 recommendations chose complete option   |
  | Diagrams produced    | 5 (architecture, error, data flow, UX flow, |
  |                      | failure registry)                           |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 2 (R2, R5; engineering)                     |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

## Engineering review (/plan-eng-review, 2026-10-29)

Target: this file. Scope Challenge: scope accepted as-is (no cuts).

### Decision ledger (engineering)

| ID | Choice | Decided | Authority |
|---|---|---|---|
| STRUCT | File arrangement | One shared `emailLink.ts` (scheme, format, parse, Message-ID guard) and one shared `emailFrame.ts` (srcdoc builder); `MailService.original` and `originalPictures` in `mail.ts`; `EmailTabView.tsx`. No new service class | Owner standing rule: never ask file or module layout (memory `no-code-arrangement-questions`) |
| R2 | How Show pictures loads web pictures | Main fetches them and inlines them as `data:`; the frame CSP stays `img-src data:` always. Rejected: a custom protocol frame with its own CSP header (more moving parts, and the frame would need network access) | Owner standing rule 2026-10-27: plan reviews decide small mechanics (memory `plan-reviews-decide-small-choices`); C2's behavior unchanged |
| R5 | Which IMAP connection the owner fetch uses | Its own short lived connection per open (the `testMailbox` pattern, `src/main/mail.ts:1076-1079`), read only lock. Lifecycle: 30 s budget for the whole open; logout in `finally`, `close` if logout fails; closing the tab aborts the open and closes its connection; app quit closes every owner connection. One owner open per mailbox at a time: a second open waits in order behind it, and an open of the same email shares the one in flight | Same standing rule; no behavior change for the owner |
| R6 | Pictures from private addresses | Fetched with Node `http`/`https` and a `lookup` that refuses any address that is not global unicast (loopback, private, link local incl. 169.254.169.254, CGNAT 100.64/10, unique local, multicast, unspecified), checked at connect time on the address actually used, so DNS rebinding and multi record answers are covered. Redirects followed by hand, at most 3, each hop through the same lookup. No cookies, no Referer, generic User-Agent. Kept only when the first bytes are PNG, JPEG, GIF, WebP, BMP or ICO (no SVG). 4 at a time, 5 s per picture, at most 40 pictures, 5 MB each, 15 MB and 15 s in all | Same standing rule; safety mechanic under C2 |
| R7 | Owner only IPC sender | `mail:original` and `mail:originalPictures` answer only the app window's main frame (`event.senderFrame` is the main window's top frame); anything else is refused | Same standing rule; DeepSeek eng pass |
| R8 | Message-IDs the searches can't carry safely | No `link` for a Message-ID with whitespace, quotes or backslashes (legal but rare); such an email is named in words as today | Same standing rule; DeepSeek eng pass |
| R9 | IPC contract timing | The `OriginalEmail` result type and the two IPC names are fixed in S1 (`emailLink.ts`), so the renderer lane does not wait on main | Same standing rule |

Approval readiness: PASS. Checked CEO rows C1, C2, E1, E2, E3, E4, E4-list, R1, DOC (answers D1 to D8) and engineering rows STRUCT, R2, R5, R6, R7, R8, R9 (owner standing rules cited above). R3 and R4 stay out of scope.

### Section 1: Architecture

Shapes compared (new boundary: the owner's view of a mailbox):
- **A (picked):** methods on `MailService` (`original`, `originalPictures`). It already owns credentials (`password`), folder rules (`folderOf`, the spam/trash/drafts refusal at `src/main/mail.ts:611-623`), error mapping (`classifyMailError`) and the one off connection pattern. One owner for every mailbox rule.
- **B:** a separate `ownerMailView.ts` that receives credentials and a folder resolver from `MailService`. Smaller agent facing class, but the folder rule and error mapping would be passed through or copied (red flags 2 and 6).
- Depth argument: A hides connection, folders, search and parsing behind two calls; B exposes a resolver and credentials as interface.

Red flag screen:
1. Hand synced list: the scheme string appears in `emailLink.ts` and `placeUrl.ts`. Fix: export `EMAIL_SCHEME` from `emailLink.ts` and import it in `placeUrl.ts`, as `PLACE_SCHEME` is (`src/renderer/src/markdown/placeUrl.ts:7`).
2. Two ways to do one task: owner folder lookup must call `folderOf`, never its own folder list, so junk, trash and drafts stay refused in one place.
3. Information leakage: Message-ID encoding and the size guard live only in `emailLink.ts`; main re-parses every link the renderer sends and never trusts a renderer verdict (the `askFileVerdict` precedent).
4. Importable internals: none new.

Owner only boundary: `MAIL_TOOL_OPS` (`src/shared/mailboxes.ts:108`) is the agents' op list; a test pins that neither `original` nor `originalPictures` is reachable from the broker.

```
  renderer                         preload            main
  EmailChip ──openEmailTab──> EmailTabView ──mail:original(link)──> parse + guard (emailLink)
                                   │                                  │ mailbox configured?
                                   │                                  ▼
                                   │                  MailService.original ─ own connection, readOnly lock
                                   │                                  │ Gmail: gmraw rfc822msgid in All Mail
                                   │                                  │ else: HEADER Message-ID, folderOf order
                                   │                                  ▼ PEEK fetch, simpleParser (or part read over 25 MB)
                                   │<──── { headers, html, text, attachments, cid data, large } ─┘
                                   │ emailFrame.build(html, cid, pictures?)  srcdoc, sandbox, CSP data only
                                   │──Show pictures──> mail:originalPictures(link) ──> net.fetch each, R6 limits ──> data URIs
```

Findings:
- [INFORMATIONAL] (confidence: 9/10) `src/renderer/src/markdown/placeUrl.ts:9` — `return url.slice(0, PLACE_SCHEME.length).toLowerCase() === PLACE_SCHEME ? url : defaultUrlTransform(url);` drops `email:`. Already in accepted scope item 5; T5 covers it.
- [INFORMATIONAL] (confidence: 8/10) `src/main/mail.ts:482-488` — the shared per mailbox client (`this.boxes`) serves every agent call; an owner fetch on it would hold the agents' folder lock. Resolved by R5.
- [INFORMATIONAL] (confidence: 8/10) `src/renderer/index.html:6` — `img-src 'self' data: blob:` is inherited by a `srcdoc` frame. Resolved by R2 (frame never loads from the network).

Dispositions: all three accepted through existing scope or R2, R5.

### Section 2: Code quality

- [INFORMATIONAL] (confidence: 8/10) the plan said "office timezone"; no such setting exists (grep of `src/shared/scheduleTimes.ts` finds none). Corrected to the Mac's timezone. Factual correction.
- [INFORMATIONAL] (confidence: 7/10) `MailService` is already 1,773 lines (`wc -l src/main/mail.ts`). Keep `original` and `originalPictures` as thin methods over two private helpers (search, fetch and parse); the picture fetching and limits go in a small `emailPictures.ts` next to `mail.ts` so `mail.ts` grows by tens of lines, not hundreds.
- Shared code: no extraction proposal. `testMailbox`'s connect, logout, close and `classifyMailError` steps are reused by calling the same helpers, not copied.

Dispositions: both accepted as mechanics (STRUCT, R5 rule).

### Section 3: Tests

Framework: `node tools/run-tests.cjs` (`package.json:26`), tests in `test/*.test.cjs`; IMAP fakes in `test/mail-service.test.cjs`, real local IMAP (hoodiecrow) in `test/mail-integration.test.cjs`.

```
CODE PATHS                                             USER FLOWS
[+] shared/emailLink.ts                                [+] Open the email from a question
  ├── format()  [GAP] round trip, label cut, ] and \n    ├── [GAP] chip in Ask me, task detail, dock
  └── parse()   [GAP] malformed, >998, CRLF, no @        ├── [GAP] task detail closes, tab opens
[+] main/mail.ts read                                    └── [GAP] [→E2E] archived after the agent read it
  └── link      [GAP] present; absent with no Message-ID [+] Reply card
[+] MailService.original                                 └── [GAP] chip from thread.inReplyTo; none without thread
  ├── mailbox not configured   [GAP]                     [+] Show pictures
  ├── Gmail gmraw path         [GAP]                     ├── [GAP] hidden by default, notice shown
  ├── HEADER path, folder order[GAP]                     └── [GAP] click: pictures inline, CSP unchanged
  ├── not found                [GAP]                     [+] Error states
  ├── auth / network / timeout [GAP]                     ├── [GAP] each kind's text and action
  ├── over 25 MB, text only    [GAP]                     └── [GAP] Open in Gmail only for a Gmail record
  └── never changes flags (R1) [GAP] [→E2E hoodiecrow]
[+] originalPictures (R6)                                [+] Hostile email
  ├── private address refused  [GAP]                     └── [GAP] script, meta refresh, file: link, form
  ├── non image refused        [GAP]
  └── caps (count, size, time) [GAP]
[+] shared/emailFrame.ts
  ├── CSP + sandbox            [GAP]
  ├── strip meta/base, add base target [GAP]
  └── cid rewrite              [GAP]
[+] renderer placeUrl + chip   [GAP] email: kept, javascript: dropped
[+] main window guards         [GAP] will-frame-navigate refuses; sandbox and subframe preload pinned
[+] hive.ts carry clause       [GAP] source pin

COVERAGE: 0/28 paths tested today (19 code paths, 9 user flows; all new)  |  every path has a planned test below
```

Planned tests (all accepted as proof of approved behavior):

| File | Asserts | Kind |
|---|---|---|
| `test/email-link.test.cjs` (new) | format/parse round trip; guard refusals; label cut at 60 units with emoji | unit |
| `test/mail-service.test.cjs` (extend) | read adds `link`; none without Message-ID; `original` maps each error kind; gmraw on Gmail; folder order elsewhere; never reaches spam, trash, drafts | unit, fake IMAP |
| `test/mail-integration.test.cjs` (extend) | open leaves `\Seen` and folder unchanged on a real hoodiecrow mailbox, also while an agent `mark_read` runs | integration [→E2E] |
| `test/email-pictures.test.cjs` (new) | happy path: a local server's PNG comes back as `data:image/png`, with no Cookie or Referer header received; refused: a name resolving to 127.0.0.1, a public URL redirecting to 127.0.0.1, more than 3 redirects, a non image body sent as `image/png`, SVG; caps: count, size, per picture and total time, 4 at a time | unit, local http server |
| `test/email-frame.test.cjs` (new) | CSP string, sandbox flags, stripped meta/base, cid rewrite, pictures stay `data:` | unit |
| `test/mail-tool-names.test.cjs` (extend) | `original` and `originalPictures` not in `MAIL_TOOL_OPS` and not routed by the broker | unit |
| `test/file-chip-actions.test.cjs` pattern, new `test/email-chip.test.cjs` | `email:` survives `placeUrlTransform`; chip in card mode only; 10 chip cap; reply card chip with and without `thread` | renderer unit |
| `test/file-tab-closes-task-detail.test.cjs` (extend) | email tab closes task detail and dedupes | renderer unit |
| `test/link-names.test.cjs` (extend) | carry clause in triage, ask and HIVE guide | source pin |
| main window pin (extend the test that covers `setWindowOpenHandler`) | `sandbox: true`, no `nodeIntegrationInSubFrames`; the frame navigation rule as a pure function (`frameNavigationAllowed`) refuses `http:`, `https:`, `file:` and `data:` targets for a subframe; IPC refuses a sender that is not the main frame | unit + source pin |
| `test/mail-service.test.cjs` (extend, R5) | logout in `finally`; tab close aborts and closes; second open waits; same email shares one open; Message-ID with a space gets no link | unit, fake IMAP |

Value card examples: `Value: protects=opening an email never marks it read or moves it; fails_when=fetch drops PEEK or the lock is not read only; why_new=no test touches flags on an owner path; seam=none; no_claim=Gmail and Outlook server behavior (hoodiecrow stands in)`.

Tests made obsolete: none.

LLM scope: the carry clause changes agent prompts. No eval suite exists for prompt rules in this repo; the source pin is the established check (`test/link-names.test.cjs`). After release, check real asks for chips (CEO cross model note).

### Section 4: Performance

- One owner fetch: one connect plus one search (Gmail) or up to one search per team folder (others), then one fetch. Scale: one open at a time per mailbox (R5), so at most a few connections.
- Memory: parse in main up to 25 MB source; result cache in main capped about 30 MB by bytes, keyed by mailbox id and Message-ID; pictures not cached beyond the open tab.
- Slow paths: connect plus Gmail search about 1 to 3 s [estimated]; non Gmail with many label folders grows linearly; pictures up to 15 s by R6 cap.
- No finding needing a decision.

### Failure modes (engineering additions)

| Path | Failure | Test | Owner sees |
|---|---|---|---|
| own connection | server refuses another connection (provider connection limit) | mail-service fake | "Couldn't reach the mailbox." + Try again |
| originalPictures | one picture fails | email-pictures | that picture stays hidden; the rest show |
| originalPictures | all time out | email-pictures | notice stays, "Some pictures could not load" |

No critical gap: every row has a test and a visible result.

### Worktree parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| S1 shared link + frame | `src/shared/` | — |
| S2 main fetch, pictures, IPC, guards | `src/main/`, `src/preload/` | S1 |
| S3 chip, tab, reply chip | `src/renderer/` | S1 |
| S4 agent carry clause | `src/main/hive.ts` | S1 (link format) |

Lane A: S1 → S2. Lane B: S3 (after S1). Lane C: S4 (after S1). Launch S1, then A, B, C together; merge; run the full suite. Conflict flag: S2 and S4 both touch `src/main/` (different files). Per the running branch rule, done in one branch in order S1, S2, S4, S3.

### Implementation tasks (engineering refresh)

The CEO task list above stands, with: T3 uses R5's own connection and adds `originalPictures` with R6 limits in `src/main/emailPictures.ts`; T4 adds `src/shared/emailFrame.ts`; T5 imports `EMAIL_SCHEME`; every task's Verify is its row in the test table above.

### Outside voice (engineering)

DeepSeek adversarial pass (`codex exec -p deepseek-review`, deepseek-v4-pro), 10 findings, all taken as mechanics under the owner's standing rule:
- Critical, picture fetch redirect and DNS rebinding bypass: R6 rewritten (connect time address check, hand followed redirects, test for both).
- High, plan text still said shared connection: Sections 4 and 7 corrected.
- High, connection lifecycle undefined: R5 lifecycle added (budget, finally, abort on tab close, queue, quit).
- Medium, IPC sender not checked: R7.
- Medium, no happy path picture test, no cookie or Referer check: test row extended.
- Medium, `image/*` header trusted, no per picture timeout or concurrency cap: R6 sniffs bytes, 5 s each, 4 at a time.
- Medium, `allow-popups-to-escape-sandbox` unjustified: dropped (release drop parity).
- Medium, hostile email proven only by builder output: frame navigation rule extracted as a pure function with tests; one manual hostile email stays in QA.
- Medium, Message-IDs with spaces, quotes or backslashes: R8.
- Low, renderer lane waited on main's IPC: R9.
Disagreements: none left.

PLAN_REALITY: phase=eng rows=7/7 missing=none unverified=0 verdict=complete

REALITY: premise-table pass unverified=0 every engineering claim carries a receipt src/main/mail.ts:1076
REALITY: already-done pass no commit on origin/main since 2026-10-20 touches an owner email view src/main/mail.ts:811
REALITY: surface-check pass imapflow `gmraw`, `readOnly` lock and PEEK fetch confirmed in node_modules/imapflow/dist/cjs/commands/fetch.js:41
REALITY: binding-decisions pass CEO answers D1 to D8 kept; owner standing rules cited for STRUCT and R2 to R9 docs/designs/original-email-view.md:1
REALITY: numbers pass 28 test paths counted from the diagram; timings and sizes tagged [estimated] package.json:26
REALITY: deferred-asks pass no linked issue src/main/mail.ts:1
REALITY: pr-count pass one PR on the running branch; no ship-policy file src/main/mail.ts:1

### Completion summary (engineering)

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted (PLAN_REALITY complete), 0 unverified premises
- Architecture Review: 3 issues found (all resolved by existing scope, R2, R5)
- Code Quality Review: 2 issues found (timezone correction; keep `mail.ts` growth small)
- Test Review: diagram produced, 28 gaps identified, every one has a planned test
- Performance Review: 0 issues found
- NOT in scope: written (CEO section)
- What already exists: written (0B)
- TODOS.md updates: 0 items proposed (E3, E4 already added by the CEO review)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: DeepSeek, completed (10 findings, all resolved)
- Parallelization: 3 lanes after S1; done sequentially on the running branch
- Lake Score: N/A (no answer this review was scored for completeness)


## Design review (/plan-design-review, 2026-10-29)

Mockup: [`original-email-view.html`](./original-email-view.html) (HTML with the app tokens, owner rule; layout A approved). Mode: OPERATE (app UI).
Initial design completeness 5/10: the plan said what happens and listed states, but not what the owner sees.

### Decisions

| ID | Decision | Answer |
|---|---|---|
| DD1 Tab lead | Subject leads, like a file tab: header title is the subject, meta line is the mailbox address, Open in Gmail as a header button (Gmail mailboxes only). Under it, short rows From (name in `ink` 600, address `ink-2`), To, Cc (only when present), Date (`Mon 27 Oct, 9:14 AM`, the Mac's timezone). Row labels `hint` style (12/17 400 `ink-3`), values 12 `ink-2`, as FileTabView's meta line. Tab strip title: the subject, ellipsis | Owner D2 = A |
| DD2 Dark mode | The body always sits on a white sheet (`#FFFFFF`, `r-md`, 1 px `line` edge) inside a `bg` well with 16 by 20 padding; the tab chrome follows light or dark | Owner D3 = A |
| DD3 Chip | Same chip as PlaceChip and file chips (`cth-file-chip`: 24 px, `neutral-soft`, `indigo-text`, 12/500, `r-sm`, hover `indigo-soft`, focus ring 2 px `indigo`), `mail` icon in `ink-3`, label = the link's words, ellipsis at the card width, inline where Michael wrote it. `aria-label` "Open the email: <words>". On the reply card: "Replying to" in `ink-3` 12 then the chip with the proposal's `to` | Owner standing rules (decide small choices; reuse the chip) |
| DD4 Pictures notice | One line under the rows on `card-2` with the `image` icon: "Pictures from the web are hidden." and a text button "Show pictures". After the click the line goes; if some fail: "Some pictures could not load." in the same line, no button. No line when the email has no web pictures | Same; less verbose UI (one line, no explanation) |
| DD5 Attachments | Under the sheet, one row each: clip icon, name (12 `ink-2`), size (11 `ink-3`). Not clickable (E4 deferred), no hover state | Same |
| DD6 States | Loading: header with the chip's words as title, "Opening the email" as the meta line, four skeleton bars (`neutral-soft`), no spinner. Errors: one plain line in 13 `ink-2` and its buttons, no icon, no coral (nothing the owner must do urgently): "Couldn't reach the mailbox." [Try again] [Open in Gmail]; "Sign in to this mailbox failed." [Open Mailboxes] (a Settings place) [Open in Gmail]; "Not in this mailbox outside Trash and Junk." [Open in Gmail]; "This mailbox isn't in the office anymore."; "This email link is broken." Too large: notice line "Too large to show in full. This is its text." then the text on the sheet. Text only email: the text on the white sheet, `pre-wrap`, 13 UI font | Same |
| DD7 Focus and keyboard | Opening moves focus to the header title (as FileTabView, `tabIndex=-1`); Tab order: Open in Gmail, Show pictures, the frame, attachments. The frame has `title="Email from <sender>"`. The notice uses `role="status"` so a screen reader hears that pictures are hidden. Chip and buttons keep the app focus ring | Same |
| DD8 Narrow window | Under 560 px the rows stack label over value and the header button wraps under the title; the sheet keeps the email's own width and scrolls sideways inside the well rather than squeezing a fixed width newsletter | Same |

### Pass ratings

| Pass | Before | After | Why it moved |
|---|---|---|---|
| 1 Information architecture | 4 | 9 | DD1 sets the order: subject, who and when, pictures line, body, attachments |
| 2 Interaction states | 6 | 9 | DD6 gives every state its words and actions |
| 3 Journey | 5 | 8 | storyboard below; the check before approving is one click and back |
| 4 AI slop | 8 | 9 | OPERATE; no cards beyond the existing tab, no decoration; litmus below |
| 5 Design system | 5 | 9 | DD2, DD3, DD4, DD5 name the tokens and reuse PlaceChip and FileTabView |
| 6 Responsive and accessibility | 2 | 8 | DD7, DD8; not 10: the frame's inner reading order is the sender's HTML |

Overall (lowest pass): 2/10 before, 8/10 after. Step 0 impression: 5/10.

### Journey

| Step | Owner does | Owner feels | Plan gives |
|---|---|---|---|
| 1 | Reads a question built on an email | unsure the summary is right | the chip in the sentence that names the email |
| 2 | Clicks the chip | curious, a bit wary | tab opens at once with the subject, sender and date (loading bars if slow) |
| 3 | Reads the email | reassured, or alarmed if it differs | the email exactly as sent, on white, nothing loaded from the web |
| 4 | Wants the full look | in control | Show pictures, one click |
| 5 | Goes back to answer | ready to decide | the tab strip back to Office or the task; the question is where they left it |

5 seconds: "that's Dana's email". 5 minutes: approve or ask for changes with confidence. Long term: approving outward email stops being a leap of faith.

### Litmus (OPERATE)

Brand in first screen: n/a for a tab inside the app. One visual anchor: YES, the white sheet. Scannable by headings: YES, subject then From. One job per section: YES. Cards necessary: YES, only the existing tab surface. Motion: none, none needed. Premium without decorative shadows: YES. Hard rejections: none.

### Outside design voices

Skipped: the plan already had two outside passes (DeepSeek in CEO and eng), and the owner limits Codex to the DeepSeek adversarial pass. Recorded as skipped, not as coverage.

### Design tasks (added to T5 and T6)

- T5: EmailTabView per DD1, DD2, DD4 to DD8; chip per DD3; renderer tests add the DD6 strings and the DD7 focus move.
- T6: reply card "Replying to" line per DD3.
- Copy goes to the locales with no dashes (owner rule).

### NOT in scope (design)

- Recoloring emails for dark mode (owner D3 chose the white sheet).
- Sender avatars or initials (owner D2 chose the subject lead).
- A per sender "always show pictures" choice (not asked for; C2 is per open).

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Chip, reply card, email tab and states | /Users/moblizeit/Documents/GitHub/personal/dontbemichael/.claude/worktrees/1-1-scroll-expanded-response-f89475/docs/designs/original-email-view.html | Layout A (subject leads), white sheet in both themes | HTML with app tokens per the owner's mockup rule; layout B kept in the file for reference only |

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md -> branding/DESIGN.md; UI: chip,  |
  |                      | reply card line, email tab                  |
  | Step 0               | 5/10; all seven passes (owner D1)           |
  | Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 6/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 5/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 5/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 2/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 8 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written (PlaceChip, FileTabView, tokens)    |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 1 HTML mockup, layout A approved            |
  | Decisions made       | 8 (DD1, DD2 by owner answer; DD3 to DD8 by  |
  |                      | the owner's standing rules)                 |
  | Decisions deferred   | 0                                           |
  | Overall design score | 2/10 → 8/10 (lowest pass)                   |
  +====================================================================+
```

Unresolved decisions: none.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN | 4 proposals, 2 accepted, 2 deferred (its open R2, R5 settled by eng) |
| Outside Review | `codex exec -p deepseek-review` (deepseek-v4-pro) | Independent 2nd opinion | 2 | completed | CEO pass 17 findings, eng pass 10 findings; all resolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 33 issues, 0 critical gaps (mapped work, no open decisions) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 2/10 → 8/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** DeepSeek completed for the CEO and eng phases. Design phase outside voices skipped (owner limits Codex to the DeepSeek adversarial pass; two outside passes already ran on this plan).
- **CROSS-MODEL:** No design phase comparison (no outside design voice ran).
- **VERDICT:** DESIGN CLEARED. CEO and Eng carry mapped work with no open decisions; eng review required status stands as issues_open by its counting rule, not by any open question. Plan is ready to build.

NO UNRESOLVED DECISIONS
