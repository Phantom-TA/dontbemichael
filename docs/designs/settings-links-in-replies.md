# Open Settings from a reply, at the right place

Status: CEO and eng reviews complete 2026-10-26 (SELECTIVE EXPANSION, D2 A): A1,
E1, E2, E3, G1 approved; documents D7 A. Built 2026-10-26 (T1 to T7; T8 hand check pending).

## Ask (owner, 2026-10-26)

"When a new business owner did the setup they did not do it for email. So they
asked Michael check my emails. Michael responded good message saying it is not
setup and go to settings and then to connection and so on. Business owner had
no patience to remember and follow the steps. It will be better to show a link
that will directly open the settings with the correct section so that owner
does not have to try to remember."

## 0A. Premise

- **Real problem.** Michael (and the app's own cards) tell the owner where to go
  in words: "Settings, Connections, Mailboxes" (`agentAccess.ts:51`,
  `index.ts:997`, `index.ts:5576`). The owner has to remember a three step path,
  close the dock, open Settings, find the section, then find the right group.
  A new owner gives up, and email (the most common first job) stays unset.
- **Target outcome.** Wherever an agent or the app tells the owner to change a
  setting, the words are a button: one click opens Settings on that section.
- **Do nothing cost.** Every "go to Settings" answer is a dead end for owners
  who won't navigate; the job they asked for never starts.
- **Proxy check.** A link solves "can't remember the path". It does not set the
  email up for them; see 0G candidates for going further.

## 0B. Existing code to reuse

| Need | Existing code |
|---|---|
| Open Settings at a section from anywhere | `cth:open-settings` window event with `{ section }` (`App.tsx:101-113`), already used by CapabilitiesTab.tsx:230, AskMeTab.tsx:591,614, MessageQueueComposer.tsx:645 |
| The sections | `Section` = General, Company profile, Prerequisites, Agents, Skills, Connections, Research & privacy, Voice, Memory & Knowledge (`SettingsModal.tsx:176-177`) |
| Where agents talk to the owner | `FileText` (`FileChip.tsx:249`): Michael's dock replies (`MichaelDock.tsx:407`), Ask me questions and options (`AskMeTab.tsx:407`, `AskAnswerFields.tsx:63,97`), foundation cards, task results and Q&A (`TasksKanban.tsx:558,615`) |
| Turning words in a reply into a clickable chip | `remarkFileChips` (`markdown/remarkFileChips.ts`) turns file paths into `cth-file` elements that `MarkdownPreview` renders with the host's chip |
| How agents name Settings today | "Settings, Connections, Mailboxes" (comma form, the no-dashes rule) in agent facing text; "Settings → General", "Settings > Agents" in comments and older text |

Not every "Settings → …" is ours: `integrations.ts:354` tells agents
"HubSpot → Settings → Integrations → Private Apps". A plain text match on
"Settings" alone would turn another app's path into a wrong button.

## 0C. Dream state

```
  CURRENT STATE                 THIS PLAN                     12-MONTH IDEAL
  "Go to Settings, ---->  "Settings, Connections" in a ----> The owner never navigates:
  Connections,             reply is a button that opens       Michael offers "Connect your
  Mailboxes" in words      Settings there                     email" and the setup opens
                                                              ready, from the reply itself
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| A1 how a Settings mention becomes a button (FileText, agent rules) | ask; `FileChip.tsx:249`, `App.tsx:101-113`, `integrations.ts:354` | both: agents write an app link (the rule), and the app also turns "Settings, <one of our section names>" words into the same button (safety net), never after another app's name | (A link only, B words only: not taken) | approved | D1 answer C (owner, 2026-10-26) |
| E1 land on the exact group (Settings, link target) | Mailboxes sits below Claude connectors and starts folded (`MailboxesSettings.tsx:35`, `SettingsModal.tsx:1696-1708`) | n/a | a link can name a group too (Connections, Mailboxes): Settings opens on the section, scrolls to the group, unfolds it and highlights it briefly | approved | D3 answer A (owner, 2026-10-26) |
| E2 a "Connect your email" button straight to the Add dialog | AddMailboxDialog exists (`MailboxesSettings.tsx:6,163`) | n/a | a link can open the Add a mailbox dialog itself; Michael's rule: when work needs email and no mailbox exists, end the reply with that button | approved | D4 answer A (owner, 2026-10-26) |
| E3 Michael picks the job back up after setup | the owner's "check my emails" is lost once they go to Settings | n/a | when a mailbox is added (any new one, not a fix), Michael is told, and he carries out the request that was waiting on it | approved | D5 answer A (owner, 2026-10-26; recommendation was B, defer) |
| G1 who reads a new mailbox before Michael can carry on (E3) | mailboxes are granted per member on their Access tab (multi-mailbox.md:58); the add dialog has no reader field; assigning in setup was skipped (multi-mailbox.md:242, MB-5 D6) | Michael asks which member should read it, with a button to that member's Access tab, Email, and carries on when the grant lands | (B ask in the dialog, C tell only: not taken) | approved | D6 answer A (owner, 2026-10-26) |

Mode: SELECTIVE EXPANSION (D2 A, owner, 2026-10-26).

## currentDecision (A1, answered: D1 C)

Commitment comparison:

```text
Commitment                               | Current | A (agents link)   | B (app spots words) | C (both)
Michael's next "go to Settings" works     | no      | once rules reach him | yes, today's words | yes
Old replies and app cards become buttons | no      | no (cards edited)  | yes                 | yes
Another app's "Settings →" stays words    | n/a     | yes                | yes if exact section names and no app name before | yes
Agents must learn a syntax                | n/a     | yes                | no                  | yes, with a fallback
Effort                                    | n/a     | S                  | M                   | M
```

Question: D1 — A1: How should a Settings mention in a reply become a button?
Header: Approach
A) Agents write a link
Agents' rules say to write the place as an app link, `[Settings, Connections](settings:connections)`, which shows as a button; the app's own cards use it too. Effort S, risk low; works only once the rules reach each agent and the agent follows them.
B) App spots the words
The app turns "Settings, Connections" (and the → and > forms) into a button wherever an agent writes it, only for our own section names and not after another app's name. Effort M, risk medium; works with what Michael already writes, old replies included.
C) Both (recommended)
The link is the rule for agents, and the app also spots the plain words as a safety net, so a reply works whether or not the agent used the link. Effort M, risk low; covers old replies, app cards and agents that forget.

## currentDecision (G1, answered: D6 A)

Question: D6 — G1: Who gets the new mailbox before Michael can carry on?
Header: Who reads it
A) Michael asks, then carries on (recommended)
When a mailbox is added, Michael is told; if nobody can read it, his reply names the member who should, with a button to that member's Access tab, Email; when the grant lands he is told again and carries out the waiting request. Effort M, risk low; the owner still gives every grant (new hires start restricted).
B) Ask in the Connect dialog
The Add a mailbox dialog opened from Michael's button gets a "Who handles this email?" field, so the grant happens in the same step. Effort M, risk medium; reverses the skipped MB-5 and adds a grant path outside the Access tab.
C) Tell, don't follow up
Michael says the mailbox is connected and who to give it to, with the button, but does not carry the request on by himself. Effort S, risk low; the owner asks again after the grant.

## Accepted scope (A1, E1, E2, E3, G1)

### What the owner sees

1. **A button wherever an agent names a place in Settings.** In Michael's dock
   replies, Ask me questions and options, foundation cards and task results
   (everything `FileText` renders), "Settings, Connections, Mailboxes" shows as
   a button with those words and a small arrow. One click opens Settings on
   Connections, scrolls to Mailboxes, unfolds it and highlights it for about
   two seconds (A1, E1).
2. **Connect your email.** When work needs email and no mailbox is connected,
   Michael's reply ends with a "Connect your email" button that opens the Add a
   mailbox form directly, over Settings' Mailboxes group (E2).
3. **Michael follows up (E3, G1).** The dock shows only Michael's answers to
   an owner question, and only done or refuse closes one (hive.ts:3444,3454).
   So his "email isn't connected" answer is sent with act `query`: the dock
   shows it as waiting for you (ownerRequests.ts:680) and no "later than you
   said" sweep runs, and the question stays open. Every follow up answers that
   same question id. When the owner adds a mailbox (any new one, not a fix),
   Michael is told. If no team member can read it yet, he answers the open
   question naming who should, with a button to that member's Access tab,
   Email card. A member holds one mailbox (mail.ts:1683): Michael prefers a
   member whose job fits and who has none; if the best fit already has one,
   his answer says the new mailbox replaces that address for them. When the owner grants it, Michael is
   told again, does the work, and closes the question with done. The waiting
   requests are simply the owner's open dock questions: they survive a restart
   (the dock's own record), and with several open he answers each that
   needed email. The owner still gives every grant; Michael never grants.

### How it works

```
  agent text ──> FileText ──> MarkdownPreview
                    │  links  [words](dbm:settings/connections/mailboxes)      (the rule, A1)
                    │  words  "Settings, Connections, Mailboxes"               (safety net, A1)
                    v           only our section and group names; not after another app's name
                 a settings chip (button) ──click──> openPlace(target)
                    settings/<section>[/<group>[/add]] ──> cth:open-settings { section, group, add }
                    member/<agentId>/access/email      ──> close Settings, store.openAgentAccess(agentId, 'email')
  Settings: section, then scroll to group anchor, unfold, highlight 2 s; "add" opens the dialog

  main: mail:save (new mailbox, not a fix) ──> tell Michael "mailbox added" + open dock questions
        mail:setCapabilities (member now holds a mailbox id they did not) ──> pending note
        pending note ──(member's next session start, or now if not running)──> tell Michael "given to X"
        (hive.send act inform from system, the hooks.ts:1205 pattern)
```

- **One link form**, `dbm:` plus a place: `dbm:settings/<section>`,
  `dbm:settings/<section>/<group>`, `dbm:settings/connections/mailboxes/add`,
  `dbm:member/<agentId>/access/email`. The shared table: sections General,
  Company profile, Prerequisites, Agents, Skills, Connections, Research &
  privacy, Memory & Knowledge (Voice is hidden in this build, SHOW_VOICE, so
  it is left out and its words stay words); groups with anchors: Connections,
  Claude connectors and Connections, Mailboxes (`add` only on Mailboxes). MarkdownPreview gets a `urlTransform`
  that lets `dbm:` through and keeps react-markdown's default rules for
  everything else (MarkdownPreview.tsx:9: no other scheme is let in), and its
  `a` component checks `dbm:` first, before its external and named link
  branches (MarkdownPreview.tsx:95), and renders the chip, never a
  navigation. The chip's accessible name and the Open prefix are new locale
  keys (`markdown.openPlace`, en, ar, zh-CN; eng 2.1). This
  also applies to document previews (file tabs, the IDE); tests cover both. Section and group keys come from one table
  shared by the parser, the word spotter and Settings, so an unknown key
  renders as plain words, never a dead button.
- **Where spotting runs.** remarkSettingsLinks joins the plugin lists used
  only with `fileChip` (MarkdownPreview.tsx:46-47,89), so agent text
  (FileText) gets word spotting; document previews get `dbm:` link chips but
  never word spotting. In card text it runs before remarkSoftBreaks, like file
  chips (eng 1.2).
- **Word spotting** reads the comma, ">" and "→" forms when the word
  "Settings" is followed by one of our section names. It is blocked only when
  another name sits right before "Settings" joined by a path separator (">",
  "→", or a comma inside the same path), as in "HubSpot → Settings →
  Integrations", which stays words; "Open Settings, Connections, Mailboxes"
  matches. It takes the longest match
  against the shared table: section, then a group of that section if the next
  words name one, and stops at the first word that is not in the table
  ("Settings, Connections, Mailboxes and choose Fix" -> the button covers
  "Settings, Connections, Mailboxes"). English names only: an agent replying in
  Arabic or Chinese is told to use the link, whose words can be in any
  language.
- **Opening a place.** `cth:open-settings` carries `{ section, group?, add? }`
  and a sequence number; App passes it to SettingsModal as a request, so a link
  clicked while Settings is already open still moves to the place (today
  `initialSection` is read only at mount, SettingsModal.tsx:212). SettingsModal
  switches section, scrolls the group's anchor into view and highlights it for
  2 s; MailboxesSettings takes `open` and `add` requests (unfold, open the Add
  dialog). A member link asks Settings to close first; if Settings has
  unsaved changes and the owner cancels its confirm (SettingsModal.tsx:424),
  Settings stays open and nothing else happens. Once closed it calls a new
  `openAgentAccess(agentId, 'email')` beside `openAgentProfile` (store.ts:985):
  `ccTabRequest { tab: 'capabilities' }` plus a new store field
  `accessFocusRequest { agentId, card: 'email', seq }` that CapabilitiesTab
  reads to unfold and scroll to the Email card (it starts folded).
- **When Michael is told.** `mail:save` for a new mailbox (no fix id) sends
  "mailbox added". `mail:setCapabilities` records "mailbox given to <name>"
  only when the member now holds a mailbox id they did not hold before (a swap
  counts; a Sending change alone does not). A grant that brings mail tools the
  running member lacks needs their restart (restartNeeded; a swap, or a member
  who had the tools from a Send only grant, reads it at once and the note goes
  then; the member restarts when idle, up to 10 minutes,
  useHive.ts:1462-1490), so the note goes to Michael on that member's next
  session start (main's HookServer sees SessionStart per member, hooks.ts:626;
  eng 1.1; a compaction or a clear is the same process and does not count), or at once if they have no running session; he never hands
  mail work to someone without mail tools yet. The pending note is kept on
  disk in the app's private folder (`<home>/private/mailbox-grant-notes.json`,
  added to factoryReset's PRIVATE_ENTRIES and the office copy list, the
  held-has-no-record pattern), so a quit before the restart loses nothing. If
  15 minutes pass without a session start (a failed restart, useHive.ts:1480,
  included: nothing signals it sooner), the note goes anyway, saying the member is not active yet. Both notes list the open dock
  questions (id and text), the way `ownerRemind` does (hive.ts:4850), so he
  needs no memory of them. With no open dock question that needed email (the
  owner set email up unprompted), Michael says nothing: the dock shows only
  answers to questions, and there is nothing to answer. Send only grants (`mail:setSendOnly`) cannot read
  mail and send nothing.
- **What counts as "email not connected" (E2), two cases.** No app mailbox at
  all, and no mail connector (Gmail on the Claude account,
  MailboxesSettings.tsx:24) given to a member: Michael ends with Connect your
  email. A mailbox exists but no member holds it (possible since assigning in
  setup was skipped, multi-mailbox.md:242): Michael instead names who should
  read it, with the member Access link, so the owner never adds the same
  mailbox twice. Michael's office roster (accessLine, agentAccess.ts:48) gains
  a line for each mailbox nobody holds, so he can tell the cases apart. A team
  that reads mail through the Gmail connector gets neither button.
- **Agent rules** (hive.ts, agentAccess.ts and the app's own cards in
  main/index.ts): name a Settings place as a `dbm:` link; Michael ends with
  Connect your email when needed; Michael's follow up on the two informs.

### Agent behavior changes (owner rule: highlight each)

| Rule today | Proposed | Who | What the owner sees |
|---|---|---|---|
| Agents name a Settings place in words | write it as a dbm: link | every agent, Michael included | a button instead of a path to remember |
| Michael says email isn't set up | he also ends with Connect your email | Michael | one button to the Add a mailbox form |
| Nobody tells Michael a mailbox was added or granted | the app tells him both | app, Michael | Michael asks who should read it, then does the waiting job |

## NOT in scope

- Granting a mailbox from the Connect form (G1 option B, not taken).
- Links into places other than Settings sections and groups and a member's
  Access tab.
- Telling Michael when a mail connector (Gmail) is turned on or given; the
  follow up covers app mailboxes only.

## 0I. Temporal interrogation

```
  HOUR 1:  the place table (sections, groups, add, member); dbm: parser; urlTransform;
           the chip in MarkdownPreview's a component.
  HOUR 2:  remarkSettingsLinks word spotting (longest match, other app guard).
  HOUR 3:  opening: cth:open-settings {section, group, add, seq}; SettingsModal
           request handling while open; group anchors, scroll, unfold, highlight;
           MailboxesSettings open/add; openAgentAccess + accessFocusRequest.
  HOUR 4:  main: mailbox added note, grant note on disk, session start delivery,
           15 minute fallback; roster line for unheld mailboxes.
  HOUR 5:  Michael's rules (query reply, Connect your email, follow ups); agent rule
           for links; app cards use links; tests; docs.
```

Effort: human about 2 days; CC + gstack about 1.5 hours [estimated]. Blockers:
none. Rules reach a running Michael when his instructions next refresh; the
word spotting covers his old phrasing until then.

## Review sections (CEO review, 2026-10-26)

**Current scope** (SELECTIVE EXPANSION, D2 A): A1 (D1 C), E1 (D3 A), E2 (D4 A),
E3 (D5 A), G1 (D6 A); documents D7 A. Nothing deferred.

### Section 1: Architecture

```
  agent text ─ FileText ─ MarkdownPreview(urlTransform: dbm ok) ─ a: dbm -> <SettingsChip>
                       └─ remarkSettingsLinks (words -> same chip)
  SettingsChip click ─ openPlace(place)
      settings ─ window event cth:open-settings {section, group, add, seq} ─ App ─ SettingsModal
                    └─ section switch, anchor scroll, highlight; MailboxesSettings open / add
      member   ─ Settings close request (confirm may cancel) ─ store.openAgentAccess(id,'email')
                    └─ CommandCenterPanel tab capabilities; CapabilitiesTab reads accessFocusRequest
  main: mail:save(new) ─ note "added" + open dock questions ─ hive.send inform from system
        mail:setCapabilities(new mailbox id) ─ disk note ─ session start | not running | fail | 15 min ─ inform
```

- One place table shared by parser, spotter and Settings: an unknown or
  hidden place is never a button.
- Security: dbm: links only navigate; nothing is changed by a click. Agent
  text from outside sources can at most show a button into Settings. Notes to
  Michael come only from main as `system`.
- Rollback: revert; the disk note file is harmless if left.
Findings: 0 open.

### Section 2: Error & Rescue Map

```
  CODEPATH                         | FAILURE                              | RESCUE / USER SEES
  ---------------------------------|--------------------------------------|----------------------------------
  dbm: parse                       | unknown section/group/member          | plain words, no button
  member link                      | member deleted since the reply        | plain words (agent lookup fails)
  open Settings at a group         | group hidden (SHOW_MAILBOXES false)   | section opens, no scroll
  Settings close for member link   | owner cancels unsaved changes confirm | stays in Settings
  add dialog                       | Mailboxes hidden                      | section opens only
  grant note write                 | disk write fails                      | note sent at once, warn logged
  grant note delivery              | restart fails / 15 min pass           | sent, saying "not active yet"
  inform to Michael                | hive.send throws                      | warn logged; owner can ask again
```

Gaps: 0 silent paths that lose the owner's request: it stays an open question
showing "waiting for you".

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| Outside text (an email) makes an agent write a dbm: button | Med | Low | Yes: a button only opens Settings or a member tab; the owner acts |
| Other schemes slip through the new urlTransform | Low | High | Yes: only dbm: is added; the default rules stay for the rest; test |
| An agent forges "mailbox given" | Low | Med | Yes: notes are sent by main as system; agents cannot send as system |
| Michael grants access himself | Low | High | Yes: no grant path for agents; the owner grants on the Access tab |

### Section 4: Data flow and interaction edge cases

| INTERACTION | EDGE CASE | HANDLED? | HOW |
|---|---|---|---|
| chip click | Settings already open | Yes | seq request moves it |
| chip click | double click | Yes | same place, idempotent |
| member link | unsaved Settings changes | Yes | confirm; cancel stays |
| words | another app's path | Yes | name plus separator before Settings blocks |
| words | Arabic or Chinese reply | Yes | rule says use the link |
| follow up | owner set email up unprompted | Yes | Michael silent |
| follow up | several open questions | Yes | note lists them all |
| follow up | app quit before restart | Yes | disk note |

### Section 5: Code quality

- The place table lives in `src/shared/settingsPlaces.ts`, imported by the
  renderer (parser, spotter, Settings) and main (notes, roster line).
- The chip reuses the file chip's look (`cth-file-chip` style) with a gear icon.
- remarkSettingsLinks follows remarkFileChips' shape and runs beside it.
Findings: 0 open.

### Section 6: Tests

```
  settingsPlaces   parse dbm: (each section, group, add, member, unknown -> null)
  urlTransform     dbm kept; javascript:, file:, data: still dropped; document preview too
  spotter          comma/>/→ forms; longest match; "and choose Fix" stops; HubSpot path stays words;
                   Voice stays words (hidden); "Open Settings, ..." matches
  open             event carries section/group/add/seq; SettingsModal reacts when open (source)
  member           openAgentAccess sets ccTabRequest capabilities and accessFocusRequest email
  main notes       new mailbox -> added note with open questions; fix -> none;
                   grant new id -> disk note; Sending change -> none; swap -> note;
                   delivery on session start / not running / failed / 15 min; write failure -> sent now
  rules            Michael: query act for missing email, Connect your email, follow ups, silence;
                   agent rule: places as dbm: links; roster line for unheld mailboxes
  hand             dock reply with the button; Settings scrolls to Mailboxes; Add dialog opens
```

no_claim: Michael's actual wording follows the rules (rules are tested as
text; a live agent check is by hand).

### Section 7: Performance

A remark pass per rendered reply, like file chips; negligible. Findings: 0.

### Section 8: Observability

`[settings-link]` warn for an unknown place; `[mailbox-note]` logs for written,
sent, fallback. Findings: 0.

### Section 9: Deployment

No migration. The disk note file is new and private. Agent rule changes reach
running agents on their next instruction refresh. Windows: unchanged paths.
Findings: 0.

### Section 10: Long-term trajectory

Reversibility 5/5. The place table is the start of deep links for the app; the
follow up pattern (note on a setup event, answer the waiting question) can
serve other "not set up yet" moments later.

### Section 11: Design & UX

```
  dock reply ─ [⚙ Settings, Connections, Mailboxes] ─click─> Settings, Mailboxes open, highlighted 2 s
  dock reply ─ [Connect your email] ─click─> Add a mailbox form
  dock reply ─ [⚙ Nick, Access, Email] ─click─> Nick's Access tab, Email open
```

The chip reads as a button (gear icon, link color, hover underline), keyboard
reachable, aria-label "Open Settings, Connections, Mailboxes". Highlight uses
the existing focus ring color, 2 s fade. Recommend /plan-design-review only
for the chip's exact look.

## Outside voice

Skipped by owner rule (Codex only for the DeepSeek adversarial pass). No
outside coverage. Three in-host spec reviews ran.

## Approval readiness

Approval readiness: PASS. A1 (D1 C), E1 (D3 A), E2 (D4 A), E3 (D5 A), G1 (D6 A),
documents D7 A. Spec review fixes implement those answers.

## What already exists

cth:open-settings (extended), FileText and remarkFileChips (pattern reused),
openAgentProfile and ccTabRequest (pattern reused), tellMichael pattern,
ownerRemind's question listing, the query act's waiting-for-you state.

## Dream state delta

After this: "check my emails" with nothing set up becomes two buttons and a
grant, then the job. Still ahead: the same for Gmail connectors and other
first-time setups.

## Failure Modes Registry

```
  CODEPATH         | FAILURE MODE              | RESCUED? | TEST? | USER SEES?            | LOGGED?
  -----------------|---------------------------|----------|-------|-----------------------|--------
  dbm parse        | unknown place             | Y        | Y     | words                 | Y
  member link      | cancelled confirm         | Y        | Y     | stays in Settings     | N
  grant note       | write fails               | Y        | Y     | Michael told at once  | Y
  grant note       | restart fails / timeout   | Y        | Y     | Michael told, inactive| Y
  inform           | send throws               | Y        | Y     | question stays waiting| Y
```

CRITICAL GAPS: 0.

## Scope Expansion Decisions

Full record: ~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-26-settings-links-in-replies.md
- Accepted: E1 exact group, E2 Connect your email, E3 follow up, G1 Michael asks who reads it
- Deferred: none
- Skipped: none

## Stale Diagram Audit

None of the touched files hold an ASCII diagram this changes;
docs/designs/michael-replies.md gets a line on the query reply for missing setup.

## Reality rows

- REALITY: premise-table pass 14 claims checked (App.tsx:101, SettingsModal.tsx:176,212,424, MailboxesSettings.tsx:35, FileChip.tsx:249, store.ts:985, hive.ts:3444,3454,4850, ownerRequests.ts:680, mail.ts:1683, hooks.ts:1205, integrations.ts:354), unverified=0
- REALITY: already-done pass no settings links on origin/main; base commit 9104c25b, FileChip.tsx:249
- REALITY: surface-check pass react-markdown urlTransform prop and the cth:open-settings event exist (MarkdownPreview.tsx:9, App.tsx:112)
- REALITY: binding-decisions pass owner grants stay on the Access tab (new hires start restricted); MB-5 skip kept (multi-mailbox.md:242); ledger at docs/designs/settings-links-in-replies.md:52
- REALITY: numbers pass restart ceiling measured at useHive.ts:1462; highlight length and fallback delay are design choices stated at docs/designs/settings-links-in-replies.md:100; efforts tagged [estimated]
- REALITY: deferred-asks pass no linked issue; the ask at docs/designs/settings-links-in-replies.md:5 covered
- REALITY: pr-count pass no .gstack/ship-policy.json; same running branch on base 9104c25b

## Implementation Tasks

- [x] **T1 (P1, human: ~3h / CC: ~15min)** — shared/renderer — settingsPlaces.ts table and dbm: parser; urlTransform; SettingsChip in MarkdownPreview
  - Files: src/shared/settingsPlaces.ts, src/renderer/src/markdown/MarkdownPreview.tsx
  - Verify: node --test test/settings-links.test.cjs
- [x] **T2 (P1, human: ~3h / CC: ~15min)** — renderer — remarkSettingsLinks word spotting, wired with file chips
  - Files: src/renderer/src/markdown/remarkSettingsLinks.ts, src/renderer/src/components/FileChip.tsx
  - Verify: spotter tests
- [x] **T3 (P1, human: ~4h / CC: ~20min)** — renderer — opening: event payload, App, SettingsModal requests while open, group anchors, highlight, MailboxesSettings open/add, openAgentAccess, accessFocusRequest, CapabilitiesTab focus
  - Files: src/renderer/src/App.tsx, SettingsModal.tsx, MailboxesSettings.tsx, store.ts, CapabilitiesTab.tsx
  - Verify: source checks; hand check
- [x] **T4 (P1, human: ~4h / CC: ~20min)** — main — mailbox added note, grant note on disk with delivery and fallback, roster line, factory reset and office copy entries
  - Files: src/main/index.ts, src/main/mailboxNotes.ts, src/shared/agentAccess.ts, src/main/factoryReset.ts, src/main/homeFolder.ts
  - Verify: main note tests with fakes
- [x] **T5 (P1, human: ~2h / CC: ~10min)** — rules — Michael's query reply, Connect your email, follow ups, silence; every agent writes Settings places as dbm: links; app cards use links
  - Files: src/main/hive.ts, src/shared/agentAccess.ts, src/main/index.ts, locales (markdown.openPlace)
  - Verify: rule text tests
- [x] **T6 (P1, human: ~4h / CC: ~20min)** — tests — test/settings-links.test.cjs per Section 6
  - Files: test/settings-links.test.cjs
  - Verify: npm test
- [x] **T7 (P2, human: ~30min / CC: ~10min)** — docs — DESIGN.md chip, FEATURES.md, michael-replies.md line
  - Files: branding/DESIGN.md, docs/FEATURES.md, docs/designs/michael-replies.md
  - Verify: read through
- [ ] **T8 (P2, human: ~30min / CC: ~10min)** — QA — new office without email: "check my emails", Connect your email, grant, Michael does it
  - Files: none
  - Verify: results noted
  - Done so far (2026-10-26): a sample Michael reply ran through the real react-markdown pipeline with the plugin and the link filter: written links and spotted words arrive as places, javascript: is dropped, HubSpot's path stays words. The Settings scroll and unfold, the Add form, the Access tab and Michael's actual follow up are still to check by hand in a new office.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | Settings paths told in words; deep link     |
  |                      | event exists; dock shows answers only       |
  | Step 0               | A1 both; E1, E2, E3, G1 added; docs D7 A    |
  | Section 1  (Arch)    | 0 open issues                               |
  | Section 2  (Errors)  | 8 paths mapped, 0 GAPS                      |
  | Section 3  (Security)| 4 threats, all mitigated                    |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | 0 gaps                                      |
  | Section 9  (Deploy)  | 0 risks                                     |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 open issues                               |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 4 proposed, 4 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex skipped by owner rule (no coverage)   |
  | Lake Score           | 1/1 (D1 chose C, 9/10)                      |
  | Diagrams produced    | 4 (flow, architecture, error map, UI flow)  |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

## Eng review (2026-10-26)

Target: docs/designs/settings-links-in-replies.md. Report file: this file.

### Scope Challenge

Existing: `cth:open-settings` (App.tsx:101-113), FileText and remarkFileChips,
`openAgentProfile` and `ccTabRequest` (store.ts:985), `tellMichael`
(hooks.ts:1205), SessionStart per member (hooks.ts:626), PRIVATE_ENTRIES
(factoryReset.ts:39) and copyOfficeData (homeFolder.ts:62), the query act's
waiting-for-you state (ownerRequests.ts:680). No new library; react-markdown's
`urlTransform` is a documented prop. TODOS: nothing related.

Complexity: about 20 files and 3 new modules (settingsPlaces.ts,
remarkSettingsLinks.ts, mailboxNotes.ts) [counted from the CEO task list]. No
feature cut proposed: each piece carries an owner answer (D1, D3 to D6). No
smaller arrangement keeps the commitments: the three modules each need node
tests through load-ts (no `@/` imports), and the rest are edits to the places
that already own the behavior.

Scope record: feature answers: none asked; structure: original arrangement
confirmed, auto-decided under the owner's standing rule "never ask file or
module layout choices; pick the recommended one" (memory
no-code-arrangement-questions), not asked; accepted scope: A1, E1, E2, E3, G1
unchanged; pending remedies: none.

Scope Challenge result: scope accepted as-is.

### 1. Architecture

- [INFORMATIONAL] (confidence: 8/10) src/main/hooks.ts:626 — `if ((event === 'PostCompact' || event === 'SessionStart') && agentId) {`: main already sees each member's session start, so the pending grant note is delivered from HookServer on that event for that member; no renderer hop. (1.1)
- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/markdown/MarkdownPreview.tsx:46-47,89 — `const DOC_FILE_PLUGINS = [remarkGfm, remarkFileChips];` and the `fileChip ?` choice: word spotting joins only the fileChip lists, so it runs on agent text and never on documents; before remarkSoftBreaks in cards. (1.2)

Production failure per path: an agent writes `dbm:settings/voice` (hidden) ->
words, no button; the member was removed -> words; restart never comes -> the
15 minute fallback. All handled in the plan.

Dispositions: 1.1, 1.2 accepted as implementation of A1 and G1 (D1 C, D6 A).

### 2. Code quality

- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/markdown/MarkdownPreview.tsx:95 — `a: ({ href, children, node }) => {`: the card branch treats external links first (named links); the `dbm:` check must come before it, and the chip needs an accessible name in three languages (`markdown.openPlace`), which the plan's file list lacked. (2.1)
- The place table in src/shared keeps one list for renderer and main; no duplicate section lists (SettingsModal.tsx:176 imports the section keys or is checked against them by a test).

Dispositions: 2.1 accepted (implementation detail of A1).

### 3. Test review

```
CODE PATHS                                         USER FLOWS
[+] shared/settingsPlaces.ts parse/table [planned]   [+] "check my emails", nothing set up
[+] MarkdownPreview urlTransform         [planned]     ├── [planned rule] query reply + Connect your email
[+] a: dbm chip before named links       [planned]     ├── [hand] Add a mailbox form opens
[+] remarkSettingsLinks spotting         [planned]     ├── [planned main] added note lists open questions
[+] cth:open-settings payload + seq      [planned src] ├── [planned rule] Michael names reader + Access button
[+] SettingsModal request while open     [planned src] ├── [planned main] grant note after session start
[+] MailboxesSettings open/add           [planned src] └── [hand] Michael does the job, closes with done
[+] openAgentAccess + accessFocusRequest [planned]   [+] Settings button in a reply
[+] mailboxNotes write/deliver/fallback  [planned]     ├── [planned src] scroll, unfold, highlight
[+] roster line, unheld mailbox          [planned]     └── [planned] cancel confirm keeps Settings
[+] existing file chips (open-file-tab)  [★★★ TESTED] open-file-tab.test.cjs (must stay green)

COVERAGE (after planned tests): 11/11 code paths, 9/9 flows (3 by hand)
```

Value cards:
- Value: protects=only our own places become buttons and other schemes stay blocked; fails_when=the table, urlTransform or spotting guard regresses (HubSpot path becomes a button, javascript: passes); why_new=new link scheme; seam=none; no_claim=none beyond protects
- Value: protects=a link lands on the right section and group even with Settings open; fails_when=the seq request or anchors are dropped; why_new=new payload; seam=none (source checks); no_claim=the scroll itself (hand check)
- Value: protects=Michael is told about a new mailbox and a new reader only once each, after the reader can work, even across a quit; fails_when=a Sending change notifies, the note is lost, or it fires before the restart; why_new=new notes; seam=deps injected (clock, disk, hive); no_claim=Michael's actual wording (rules as text, live by hand)
- Value: protects=Michael's rules ask for the query reply, Connect your email, the reader question, silence with nothing waiting; fails_when=rule text drifts; why_new=behavior change; seam=none; no_claim=model compliance (hand check)

Regression: open-file-tab.test.cjs stays green (remarkFileChips untouched);
no existing test retires.

Dispositions: no gaps beyond planned tests.

### 4. Performance

One extra remark pass per rendered agent message, the same cost class as file
chips; the note file is a few hundred bytes. No findings.

### Outside voice

Skipped by owner rule (Codex only for the DeepSeek adversarial pass). No
native replacement. Outside coverage: none.

### TODOS.md

No new TODO.

### Approval readiness

Approval readiness: PASS. CEO answers D1 C, D3 A, D4 A, D5 A, D6 A, D7 A;
structure by the owner's layout rule; findings 1.1, 1.2, 2.1 implement those
approved contracts.

### Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Links and chips (T1, T2) | src/shared, src/renderer/src/markdown | — |
| Opening places (T3) | src/renderer (App, Settings, store, panel) | T1 (table) |
| Notes and rules (T4, T5) | src/main, src/shared | T1 (table) |
| Tests and docs (T6, T7) | test, docs | all |

Lane A: T1, T2, T3. Lane B (after T1): T4, T5. T3 and T5 share no files.
Sequential in one session is still the practical choice (about 1.5 hours of
CC time [estimated]).

### Reality rows (eng)

- REALITY: premise-table pass 7 claims checked (hooks.ts:626, MarkdownPreview.tsx:46,89,95, factoryReset.ts:39, homeFolder.ts:62, store.ts:985), unverified=0
- REALITY: already-done pass no settings links on origin/main; base commit 9104c25b, FileChip.tsx:249
- REALITY: surface-check pass urlTransform prop and SessionStart hook exist (MarkdownPreview.tsx:89, hooks.ts:626)
- REALITY: binding-decisions pass CEO answers kept; owner layout rule applied (docs/designs/settings-links-in-replies.md:3)
- REALITY: numbers pass file and module counts from the CEO task list (docs/designs/settings-links-in-replies.md:3); CC time tagged [estimated]
- REALITY: deferred-asks pass no linked issue; ask at docs/designs/settings-links-in-replies.md:7 covered
- REALITY: pr-count pass no .gstack/ship-policy.json; same running branch on base 9104c25b

### Completion summary

- Step 0: Scope Challenge — scope accepted as-is (original arrangement)
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 2 issues found
- Code Quality Review: 1 issue found
- Test Review: diagram produced, 0 gaps beyond planned tests
- Performance Review: 0 issues found
- NOT in scope: written (CEO section)
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, skipped (owner rule)
- Parallelization: 2 lanes possible, 1 recommended (sequential)
- Lake Score: N/A

### Suppressed findings

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 4 proposals, 4 accepted, 0 deferred |
| Outside Review | codex (skipped by owner rule) | Independent 2nd opinion | 0 | skipped | no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 3 issues, 0 critical gaps (all folded into the plan) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, skipped in both reviews (owner rule: Codex only for the DeepSeek adversarial pass); no completed external review.
- **VERDICT:** CEO CLEARED. Eng review complete: 3 issues found and folded into the plan, 0 critical gaps, 0 unresolved; logged as ISSUES OPEN because issues were found, not because any is open. Ready to implement.

NO UNRESOLVED DECISIONS
