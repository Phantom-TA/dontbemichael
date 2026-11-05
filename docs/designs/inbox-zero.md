# The Executive Admin works to inbox zero

Status: built (2026-10-03).

## Problem

Owner, 2026-10-03: the Executive Admin's seeded job descriptions talked about
prioritizing and taking care of specific emails only. The seeded work should
handle every email, with a zero inbox philosophy. How often she runs is what
a schedule defines; it is not part of the Work style.

Two gaps stood behind it. Every pack's Pam sorted and routed "each message
that matters" and never cleared anything, and the mail tool could not clear an
inbox at all: it searched, read, drafted and sent, and could not archive,
label or mark read, while the seeds told her to label and archive.

## What changed

- **Mail tools** (`resources/md-mail-mcp.cjs`, `src/main/mail.ts`): `archive`
  (marks read and moves out of the inbox; with a label, a Gmail label or a
  folder of that name, made when missing), `mark_read` and `mark_junk`. Up to
  50 messages a call. They need the mailbox, not sending rights
  (`MailOp 'organize'`). Nothing deletes mail. An archive label can never name
  a system folder (inbox, trash, junk, sent, drafts and the like) or a folder
  inside one, and every move is written to the office log.
- **Seeds** (all five packs): one method. Every message gets one outcome
  (route, track under Waiting, file, clear) and is archived; urgent mail goes
  to Michael first; each run ends with the inbox empty or holding only mail
  waiting on the owner's decision today, with the count told to Michael.
  Replies leave as the Sending setting allows (send-on-approval.md, owner
  2026-10-05), and nothing is deleted. Each pack keeps
  its routing table and its own duties (calendar, document checklist, catering
  list). No timing in the Work style.
- **Starter jobs** (`src/shared/starterJobs.ts`): packs give a hire its
  schedules, timed to the pack's office hours ("every 2h during office hours",
  "18:00 on office days", "mon 09:00"), each with its focus area. Pam gets
  "Inbox to zero" every 2 hours during office hours; the home services Pam
  also gets "Tomorrow's jobs" at 18:00 on office days. Seeded at team start
  and on hire, once per job name. A job a teammate already runs comes
  switched off (a second hire into Pam's job), for the owner to turn on in
  Capabilities if the work is really split.
- **Existing offices** (`src/shared/workStyleUpdates.ts`): a team member hired
  from an updated card is offered the new text on Ask me: Use the new one
  (replaces the Work style and role line, adds the starter jobs) or Keep mine.
  Offered once per member; never applied silently.
