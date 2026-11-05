# See the original a document was made from

Owner, 2026-11-05: "how do i see the original attachment document whch was used to created this?"
(the GammaTile workflow review in a file tab, which says "Source: Ellah Foster's document from
her 28 Oct email").

Status: CEO review complete (mode HOLD SCOPE). D1 settled by the owner (both parts). Built 2026-11-05 (T1 to T6), with E2 and E3 narrowed as below.

## 0A. Premise

- **What happened.** `Sales/GammaTile workflow review 2026-11-02.md` names its source in words
  only (line 5). The office kept a text copy, `Sales/GammaTile Ellah workflow document
  2026-10-28.md`, made before `save_attachment` existed (2026-10-31), and not Ellah's original
  file. So today the owner can reach the original only by finding her 28 Oct email in Gmail.
- **Gap 1, documents don't link their source.** Members are told to put an email's link in a
  filing (`hive.ts:468`), not in the documents they write. And a file tab makes no full path or
  relative link clickable: `FileTabView.tsx:180` gives `MarkdownPreview` neither `fileChip` nor
  `onOpenMarkdownLink`. Only `email:` links work there.
- **Gap 2, the email tab can't open attachments.** It lists names and sizes; opening was deferred
  on 2026-10-29 (original-email-view.md E4, TODOS.md "Open or save an email's attachments")
  until outside files had a safety design. `save_attachment` (agent-save-attachment.md) is that
  design now: size cap, kind check by content, safe write.
- **Target.** From any document made from an email or file, one click to the original, and from
  any email tab, one click to each attachment.

## 0B. Existing code to reuse

| Need | Reuse |
|---|---|
| Fetch one attachment part with a byte cap | the part download in `MailService` (`src/main/mail.ts:949`) |
| The kind by content, refuse the rest | `attachmentKind` (`src/shared/attachmentKind.ts`) |
| Safe write | `saveAttachmentFile` (`src/main/attachmentSave.ts`) |
| The owner's own read of an email | `MailService.original` (`src/main/mail.ts:1007`), the email tab (original-email-view.md) |
| File chips that open a path, with the folder check | `fileChip` in `MarkdownPreview`, `askFileVerdict` (`src/main/fs.ts`), `FileText` |
| Open readable kinds in a tab, others in their app | file tab kinds (open-file-tab.md R3) |
| Members' rule for an email's link | `hive.ts:468` |

## 0C. Dream state

```
  CURRENT                          THIS PLAN                          12-MONTH IDEAL
  "Source: her 28 Oct email"       Source line links the saved        Every fact in a document traces
  in words; the original only      original and the email; the        to its source in one click,
  in Gmail                         email tab opens attachments        whoever made it
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| M mode | Two linked gaps, about 9 files | n/a | HOLD SCOPE | approved | Owner chose "HOLD SCOPE (recommended)", 2026-11-05 |
| D1 scope | Gaps 1 and 2 above | neither | A: documents link their source and file tabs make links clickable; B: the email tab opens attachments (reverses the 29 Oct deferral, E4) | approved | Owner chose "Both A and B (recommended)", 2026-11-05 |
| E1 member rule (hive.ts, agent behavior) | `hive.ts:468` covers filings only | Source named in words | when a member writes a document from an email, its attachment or another file, its Source line gives the original's full path in backticks (the file `save_attachment` saved) and the email's `email:` link from its mail read, as written | decided (mechanic of D1 A) | Owner rule: decide small mechanics; listed under Behavior changes |
| E2 file tab links (FileTabView) | `FileTabView.tsx:180`; open-file-tab.md E2 (owner declined links inside opened files, 2026-10-10) | paths and relative links inert in a file tab | a file tab shows full paths as file chips (same folder check as Ask me, by the tab's `who`); relative links stay inert, as the owner decided on 2026-10-10 | decided (mechanic) | narrowed while building: D1 A covers the Source line's full path and email link, not links between documents |
| E3 which attachments open (email tab) | `attachmentKind` | listed only | kinds `attachmentKind` accepts open in their own app (a file tab reads only the office's folders, and this file is outside them by design, E4); anything else (programs, scripts, archives, web pages, macros) stays: "This kind of file only opens from your mail app", with Open in Gmail at the top for Gmail mailboxes | decided (mechanic) | narrowed while building |
| E4 where they land (main) | agents must not see the owner's opens | n/a | the app's private folder (`userData/opened-attachments`), cleared at quit, never the office | decided (mechanic) | same |
| E5 limits (main) | `ATTACHMENT_MAX_BYTES` | n/a | same size cap and part download as `save_attachment`; the owner's own mailbox read (owner only IPC, like the email tab) | decided (mechanic) | same |

## Reality rows

| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| P1 | The review names its source in words only | `/Users/moblizeit/Dropbox/Personal/myofficedata/Sales/GammaTile workflow review 2026-11-02.md:5` | verified |
| P2 | File tabs pass no file chip or link opener | `src/renderer/src/components/FileTabView.tsx:180` | verified |
| P3 | Members link emails only in filings | `src/main/hive.ts:468` | verified |
| P4 | Opening attachments from the email tab was deferred | `docs/designs/original-email-view.md:72` | verified |
| P5 | save_attachment keeps the original file | `resources/md-mail-mcp.cjs:75` | verified |
| P6 | The kind check and safe write exist | `src/main/mail.ts:1879` | verified |

unverified=0

REALITY: premise-table pass 6 claims verified, unverified=0 src/renderer/src/components/FileTabView.tsx:180
REALITY: already-done pass no attachment open on origin/main since 2026-11-04 docs/designs/original-email-view.md:72
REALITY: surface-check pass new owner IPC `mail:openAttachment` named here; no CLI flag src/main/mail.ts:1007
REALITY: binding-decisions finding reverses original-email-view.md D6/E4 deferral by owner D1 2026-11-05 docs/designs/original-email-view.md:72
REALITY: numbers pass about 9 files [estimated]; size cap is ATTACHMENT_MAX_BYTES src/main/mail.ts:949
REALITY: deferred-asks pass no linked issue; TODOS.md item closed by this plan TODOS.md:441
REALITY: pr-count pass one PR on the running branch docs/designs/source-attachments.md:1

## Behavior changes

One agent behavior change (E1):

| Who | Rule today | Proposed | What the owner sees |
|---|---|---|---|
| Every team member writing a document from an email, its attachment or a file | Source named in words ("her 28 Oct email") | the Source line links the saved original by full path and the email by its `email:` link | a Source line with a file chip and an email link |

Owner side: a file tab's paths and relative links open; the email tab's attachments open.

## Review sections

**1. Architecture.**

```
  member writes doc ─► "Source: `/…/Email attachments/x.pdf` · [Ellah, 28 Oct](email:…)"
  file tab (FileTabView) ─► MarkdownPreview fileChip ─► askFileVerdict ─► file tab or its app
                                       email: link ─► email tab (exists)
  email tab attachment row ─► mail:openAttachment (owner IPC: mailbox, Message-ID, index)
       ─► MailService part download (cap) ─► attachmentKind ─► saveAttachmentFile into
          userData/opened-attachments ─► readable: file tab   documents: shell.openPath   else: refused
```

**2. Error and rescue map.** See the registry.

**3. Security.** The owner opens outside files as they would from Gmail. Guards: owner only IPC
(never the broker), a configured mailbox and a well formed Message-ID (as `original`), the size
cap, the content kind check (no programs, scripts, archives or HTML), a private folder agents
can't read, cleared at quit. File chips in a file tab keep the Ask me folder check, so a
document can't link outside the office's folders.

**4. Edge cases.**

| Case | Result |
|---|---|
| Old document with no links (GammaTile) | as today; the owner opens the email in Gmail |
| Original saved, email gone from the mailbox | the file chip still opens the saved original |
| Attachment over the cap | "Too big to open here", with Open in Gmail |
| Unknown kind or a program | not opened; Open in Gmail or the mail app line |
| Same attachment opened twice | reuses the file already saved this session |
| Mailbox signed out | the email tab's existing sign in message |
| Path outside the office in a document | the chip shows it as not openable (folder check) |

**5. Code quality.** Reuses the agent save path; one new IPC, one prompt sentence, one prop pair.

**6. Tests.**

```
  hive prompt: members' Source line rule present (path + email link)          [unit, new]
  FileTabView passes fileChip and onOpenMarkdownLink                           [source pin, new]
  openAttachment: refuses a bad mailbox, Message-ID, index, size or kind       [unit, new]
  openAttachment: writes only under userData/opened-attachments; cleared       [unit, new]
  email tab: rows are buttons for openable kinds, text for the rest            [source pin, new]
```

**7. Performance.** One part per open, capped. **8. Observability.** Log each open (kind, size,
outcome) in the app log, no names. **9. Deployment.** Ships with 0.3.6. **10. Long-term.**
Reversible. **11. Design.** Attachment rows get the clip icon and a hover state when openable;
no new long text.

## Error and rescue registry

| Error | Trigger | Handler | Owner sees | Test |
|---|---|---|---|---|
| Mailbox unreachable | IMAP error | email tab | its existing message | existing |
| Over the cap | size | main | "Too big to open here" | new |
| Kind refused | content check | main | "This kind of file only opens from your mail app" or Open in Gmail | new |
| Write failed | disk | main | "Couldn't open it. Try again." | new |
| Chip outside folders | folder check | renderer | not openable | existing |

0 critical gaps.

## Failure modes

| Mode | Effect | Guard |
|---|---|---|
| An agent reads an owner opened file | outside text reaches the team unscreened | private folder, cleared at quit |
| A program opens from an email | malware | kind check refuses it |
| A document links outside the office | file reached through a doc | folder check on chips |

## NOT in scope

- Recovering originals for documents written before this (GammaTile).
- Saving attachments into the office from the email tab (agents do that with save_attachment).

## Implementation tasks

- [x] T1 hive.ts: members' Source line rule (E1)
- [x] T2 FileTabView: fileChip and relative link opener (E2)
- [x] T3 main: `mail:openAttachment` with cap, kind check, private folder, quit cleanup (E3 to E5)
- [x] T4 email tab: openable rows; refusal lines; preload; locales (en, ar, zh-CN)
- [x] T5 docs: FEATURES, original-email-view.md E4, TODOS.md item closed
- [x] T6 tests as in Section 6

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW: COMPLETION SUMMARY                    |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | 2 gaps found; save_attachment reusable      |
  | Step 0               | premise verified on the GammaTile files     |
  | Section 1  (Arch)    | 1 diagram, one new IPC                      |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 3 risks guarded                             |
  | Section 4  (Data/UX) | 7 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | diagram produced, 5 tests, 0 gaps           |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | log line per open                           |
  | Section 9  (Deploy)  | no migration                                |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 3 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 1 item closed                               |
  | Scope proposals      | 0 proposed (HOLD)                           |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex: skipped (owner rule, adversarial only)|
  | Diagrams produced    | 2 (architecture, tests)                     |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

Approval readiness: PASS (M and D1 answered by the owner, 2026-11-05; E1 to E5 are mechanics)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps; 1 agent behavior change |
| Outside Review | codex, `/plan-eng-review` | Independent 2nd opinion | 0 | skipped | owner rule: Codex adversarial only |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | none | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | none | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex, plan review: skipped by the owner's standing rule (Codex only for the adversarial pass). No outside provider ran.
- **VERDICT:** CEO CLEARED. Eng review not run.

NO UNRESOLVED DECISIONS
