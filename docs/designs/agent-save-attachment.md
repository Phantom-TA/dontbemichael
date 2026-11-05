# A team member saves an email's attachment itself

Status: built 2026-10-31 on the owner's answer: the recommended default for both decisions below.

## Request (owner, 2026-10-31)

Screenshot: the GammaTile card asks the owner to "save Ellah's attachment into the Sales folder
so Dwight can review it before the call". A folder link on the card "shows sales folder but
business owner would still need to find the email with the attachment. so it is not very
productive". Investigated, then: "Yes, plan it".

## Why the owner gets asked today

A member can see an attachment but cannot fetch it. `read` returns names and sizes only, and no
md-mail tool saves a file (`resources/md-mail-mcp.cjs:70`, `src/shared/mailboxes.ts`,
`MAIL_TOOL_OPS`). `attach_from` forwards an attachment in an email without the member ever
opening it. Dwight's filing says: "I cannot open her attachment."

Goal: the member fetches the file, reads it and carries on. The owner is asked only about the
decision the document raises, never to move a file.

This reopens a deferral. CEO review D6 (2026-10-29) put off saving attachments from the owner's
email tab because "outside files need their own safety design". This plan is that design, for
agents. The owner's tab stays deferred (TODOS.md, "Open or save an email's attachments").

## What already exists

| Need | Reuse | Where |
|---|---|---|
| Who may read a mailbox | `mailAccess`, op `read`; broker and hook share one map | `src/shared/mailboxes.ts`, `MAIL_TOOL_OPS` |
| Fetch one part, not the whole message, with a byte cap | `c.download(uid, part, { maxBytes })` as `bodyText` uses it | `src/main/mail.ts:909` |
| Attachment names and sizes | `attachmentsOf` | `src/main/mail.ts:168` |
| Text from a document, in its own process | `docTextProcess`, `doc-text` | `src/main/docTextProcess.ts`, `src/main/docTextCli.ts` |
| Spot lines aimed at an AI | `flagInstructionLike` | `src/shared/untrustedText.ts` |
| Tell Michael, once | `tellMichaelFlagged` | `src/main/mail.ts:1416` |
| Log for the owner | `deps.audit` | `src/main/mail.ts:1752` |
| The folder a member works in | Its start, as `folderPolicy` uses it | `src/main/index.ts` |

No new dependency is needed. `file-type` is not installed, and the small check below does not
need it.

## The tool

`save_attachment { mailbox, id, attachment }` in md-mail. `id` comes from `search`; `attachment`
is its position in the `attachments` list `read` returned, so two files with one name stay apart.

```
member -> md-mail -> POST /mail/save_attachment -> broker -> handleMailRequest
                                                              |
              mailAccess(op read) ---- refused ---------------+
                                                              |
              part from body structure -> size over 25 MB? -- refused
                                                              |
              download that part -> kind check on the bytes -- refused
                                                              |
              write with exclusive create, mode 0600, quarantine mark
                                                              |
              text in its own process -> flags -> tell Michael once
                                                              |
              audit log -> answer { path, kind, size, note, instruction_like? }
```

## Safety rules

Every rule is in main, not in the agent's prompt.

1. **Access.** The same check as `read`: only the member who reads that mailbox. Send only grants
   are refused. Research is refused, as it holds no mailbox.
2. **Size.** 25 MB at most [estimated, the usual email limit], checked from the structure before
   any download, and again on the bytes, so a wrong declared size stops the download.
3. **Kind from content, never the name.** Allowed: PDF, Word (`docx`), Excel (`xlsx`), PowerPoint
   (`pptx`), plain text, CSV, PNG, JPEG, GIF, WebP. The first bytes decide, and a zip must hold
   `[Content_Types].xml` with the matching main part. The saved ending comes from the kind found.
   Everything else is refused: programs, scripts, disk images, archives, HTML, SVG and files with
   macros (`docm`, `xlsm`, `pptm`).
4. **File name.** The sender's name goes through the app's folder name rule (`cleanFolderName`),
   never a path, with no dotfiles. A name in use gets " (2)". The same file saved again returns
   the first copy.
5. **Destination.** `<member's folder>/Email attachments/`. The folder is the one the member
   started in, kept in main at spawn, because the registry is a file agents' shells can write.
   The home folder and the app's own folder are refused. If `Email attachments` is a link, the
   save is refused. The file is created exclusively, so nothing is overwritten.
6. **Never launched.** Mode 0600, no execute bit, and the macOS quarantine mark (the Zone
   Identifier on Windows). The app never launches a saved file by itself. Open on a chip shows its
   words in an office tab, read in a separate process, and only the owner's Open in app launches it.
7. **Outside text.** The result labels the file as outside information, like an email. Text is
   pulled in a separate process with a time limit and screened with the shared list. A flagged
   file is flagged to Michael only, and the member carries on (owner, 2026-10-12).

Known limit: a picture is not screened, and a scanned PDF only if OCR finds text. A member who
reads the file directly gets the same label from the save result, not on each later read.

## A file a teammate reads

Found on the first live try: Dwight only sends from the mailbox Ellah wrote to, and Pam reads it,
so Dwight's save is refused and Pam's lands in a folder Dwight cannot open. Owner, 2026-10-31:
"dwight should ask pam and can even ask for the file which he can save to his own folder. this
way the protocol stays the same that agents can ask info and dont peak into other agent folders".

```
Dwight -- query --> Pam
                    Pam: save_attachment -> Admin/Email attachments/x.pdf
Dwight <-- inform + "file": <that path> -- Pam
           app: checks it again, copies it to Sales/Email attachments/
           Dwight's message says where it landed
```

- `list_mailboxes` names the reader as `read_by` on a mailbox the member only sends from.
- A message may carry one `file`. Main takes only a file from the sender's own `Email attachments`,
  checks size and kind again, and writes it with the same safe write. Neither member opens the
  other's folder, and the folder walls stay as they are.
- A file main won't carry leaves the words to go on, and the sender hears why. Research takes no
  files, as before.
- Known limit: the screening runs when the reader saves it. The asker gets the outside text label,
  and Michael has already heard of any flagged lines.

## Behavior changes

| Who | Today | Proposed | What the owner sees |
|---|---|---|---|
| Team members | Ask the owner to save an attachment | Save it and read it | No such question on cards; the file in `Email attachments` |
| Team members and Michael | No rule | New ask rule: never ask the owner to fetch an attachment the member can save; ask only if the save was refused, and say why | Fewer cards; a refused file still reaches the owner |
| Michael | Flags on email only | Also flags on saved files | Nothing new; Michael decides |
| Office log | Mail reads and sends | One line per saved file | Who saved what, from which email |
| New hires | No mailbox, no tool use | Unchanged: the tool needs a mailbox the owner gave | Nothing new |

Agents already running get the tool at their next start. Non Claude engines have no md-mail yet
(TODOS.md, issue 109), so they keep asking.

## Open cards

The GammaTile card does not change by itself: the tool stops new questions, it does not rewrite
an old one. After this ships, answering "Not yet" there, or asking Michael, sends it back to
Dwight, who can then save the file himself.

## Tests

| Test | Proves |
|---|---|
| `test/attachment-kind.test.cjs` | Table of bytes: each allowed kind passes; a program named `.pdf`, a zip named `.docx`, a macro file, HTML and SVG are refused |
| `test/mail-routes.test.cjs` (extend) | Reader saves; send only and no mailbox are refused; over size stops before download; a wrong declared size stops mid download |
| `test/mail-tool-names.test.cjs` (extend) | The new tool is in the one access map |
| `test/save-attachment-file.test.cjs` | Unsafe names, name in use, a link on the path, mode and no execute bit, outside the write folders |
| `test/md-mail-mcp.test.cjs` (extend) | The real server calls the real broker |
| `test/link-names.test.cjs` (extend) | The ask rule text |

Live check before calling it done: one real email in a test mailbox, through a real agent.

## Tasks

1. `fileKind.ts`: pure kind check, with tests.
2. `MailService.saveAttachment`: fetch one part with both size checks.
3. `saveAttachmentFile`: name, destination, exclusive write, quarantine mark.
4. `handleMailRequest` route, `MAIL_TOOL_OPS`, tool text, screening, audit.
5. Ask rules in `hive.ts`; the words shown on the office floor for the new tool.
6. `docs/FEATURES.md`; update the TODOS.md item to say agents are covered.

About 10 files [estimated].

## Not in scope

- Save and Open on the owner's email tab: stays deferred (D6).
- Bringing in archives or running anything from one.
- Connector mail: Gmail through a Claude connector has no attachment path.
- The email chip on cards: the owner set that aside on 2026-10-30.

## Decisions for the owner

**Who may save.** Recommended: everyone who reads a mailbox, with no new switch. Reading an
attachment is part of reading the mail, and a switch would be one more setting that leaves agents
asking the owner. The alternative is a switch on the Access tab under Email, off by default, which
follows "new hires start restricted" more strictly but brings the same question back until the
owner turns it on for each member.

**Where the file goes.** Recommended: `Email attachments` inside the member's own folder, so the
owner can open it, and it stays with the work. Files there sync if that folder is in Dropbox. The
alternative is the member's private scratch space, which keeps outside files out of the owner's
folders, but the owner cannot see them, and they are lost when that space is cleared.

## Handing a file to a teammate: what goes

Only a file the app saved since it opened goes on, known by identity and not by path. A member's shell can
swap a folder for a link at any moment, and Node has no way to open a file relative to a checked folder, so
no path check held against a timed swap (ship review, 2026-11-01: a test swap won a few times in every
20 seconds against path checks, and none in 370,000 tries against this rule). After the app restarts a
member saves the file again before sending it. The file must sit directly in Email attachments, have one
name, and be under the size limit.
