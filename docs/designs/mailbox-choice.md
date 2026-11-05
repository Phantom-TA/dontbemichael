# Giving a team member a mailbox

Status: design reviewed and built 2026-10-30.
Mockups: [mailbox-choice-ux.html](mailbox-choice-ux.html), option A.

## Request (owner, 2026-10-30)

"when a new mailbox is connected it shows two options 'Watch the mailbox', 'send only'. For new
users it is confusing the way it shows. They dont understand clearly."

## What is wrong today

The panel lives on a member's Access tab, Email (`CapabilitiesTab.tsx`, `adding` branch).

1. **The names don't say what happens.** "Watch" reads as looking on, but the member reads, sorts
   and answers. "Send only" doesn't say the member can't read the inbox.
2. **The meaning is behind an info icon.** We moved it there on 2026-10-07 (less verbose screens),
   and removed `addWatchDesc` and `addSendOnlyDesc`. A new owner has no reason to hover.
3. **Send only is a trap on a new mailbox.** Nobody reads it yet, so the member's email pauses.
4. **"Add a mailbox" means two things.** In Settings it connects a new address. Here it gives a
   connected one to a member. The panel's main button says only "Add".
5. **Three verbs for one idea.** The panel says watches, the move line says checks, and Michael's
   roster and the app's notes already say reads.

## Design

Direction A in the mockups: plain words, one short line each.

### Information hierarchy

```
Give Pam a mailbox                       <- what this panel does (no info icon)
[ hello@example.com            v ]       <- which one; filled in when there is only one
What should Pam do with it?              <- the one question
(o) Read and answer email                <- the usual choice, first
    Pam reads what comes in, sorts it and replies.
( ) Only send email                      <- greyed when it can't work, with why
    Someone needs to read this inbox first.
[ Give to Pam ]  Cancel                  <- nothing happens until this
```

### Words

| Key | Today | New |
|---|---|---|
| `addMailboxUse` | Add a mailbox | Give {{name}} a mailbox |
| `addIt` | Add | Give to {{name}} |
| `addHow` | How {{name}} uses it | What should {{name}} do with it? |
| `addWatch` | Watch the inbox | Read and answer email |
| `addSendOnly` | Send only | Only send email |
| new `addReadsDesc` | none | {{name}} reads what comes in, sorts it and replies. |
| new `addSendsDesc` | none | {{name}} sends from this address but cannot read it. {{holder}} reads the replies and passes them on. |
| `addSendOnlyNobody` | Nobody watches it yet, so its email waits until someone does. | Someone needs to read this inbox first. |
| `addWatchMoves` | {{from}} watches it now. It moves to {{name}} after you confirm. | {{from}} reads it now. It moves to {{name}} after you confirm. |
| `addWatchTaken` | {{name}} already watches {{address}}. One each. | {{name}} already reads {{address}}. One each. |
| `addSendOnlyTaken` | {{name}} already sends only from {{address}}. One each. | {{name}} already only sends from {{address}}. One each. |
| `addMailboxBothUsed` | {{name}} already watches one and sends only from one. | {{name}} already reads one mailbox and only sends from another. |
| `inboxWatches` | {{name}} watches it | {{name}} reads and answers it |
| `inboxSendOnly` | {{holder}} watches it. {{name}} sends only. | {{holder}} reads it. {{name}} only sends. |
| `inboxNobody` | Nobody watches it. {{name}} sends only. | Nobody reads it. {{name}} only sends. |
| `sendOnlyPaused` | Paused: {{name}}'s email from here waits until someone watches this inbox. | Paused: {{name}}'s email from here waits until someone reads this inbox. |
| `removeWatchedSure` | Remove {{address}}? Send only access for {{names}} pauses until someone watches it. | Remove {{address}}? {{names}} can't send from it until someone reads it. |
| `moveMailbox` | {{from}} checks {{address}}. Move it to {{to}}? {{from}} stops checking email. | {{from}} reads {{address}}. Move it to {{to}}? {{from}} stops reading it. |
| `sendOnlyUse` | {{address}} (send only, {{sending}}) | {{address}} (only sends, {{sending}}) |
| `addMailboxInfo` | The info icon text | Removed, with its `InfoTip` |

`addMailboxUse` is also the link that opens the panel, so that link reads "Give Pam a mailbox" too.
Every string names the member; none uses a pronoun, so it reads the same in each language.
All of it ships in English, Chinese and Arabic.

### Which line shows under which choice

| Situation | Read and answer email | Only send email | Chosen at first |
|---|---|---|---|
| Nobody reads the mailbox, member reads none | `addReadsDesc` | Greyed, `addSendOnlyNobody` | Read and answer |
| A teammate reads it, member reads none | `addWatchMoves` | `addSendsDesc` | Only send |
| A teammate reads it, member already reads another | Greyed, `addWatchTaken` | `addSendsDesc` | Only send |
| Nobody reads it, member already reads another | Greyed, `addWatchTaken` | Greyed, `addSendOnlyNobody` | None, button off |
| Member already sends from another | as above | Greyed, `addSendOnlyTaken` | Read and answer if it can |

### Behavior changes

- **Only send email is greyed while nobody reads the mailbox.** Today an owner may choose it and the
  member's email pauses at once. The rule lives in the panel only: a saved Send only grant is never
  touched, and the paused note stays for a mailbox that loses its reader later.
- **The only mailbox is chosen for the owner.** With one mailbox that can be given, the panel opens
  with it chosen, so the question shows straight away. With two or more the dropdown starts empty.
- **No agent behavior changes.** Mail rules, Michael's roster and the tool text stay as they are.

### States

| State | What the owner sees |
|---|---|
| No mailbox connected | Today's note and link to Settings, unchanged |
| One mailbox can be given | Panel opens with it chosen, question and lines showing |
| Several can be given | Empty dropdown; question appears once one is picked |
| Neither choice possible | Both greyed with their reasons, Give to Pam off |
| Nothing left to give | Today's greyed link with why, in the new words |
| Taking over from a teammate | Today's move confirmation, in the new words |
| Mailbox needs attention | Today's dropdown note, unchanged |
| Saving fails | Today's `capabilities.saveFailed` line, unchanged |

### Journey

| Step | Owner does | Owner feels | Supported by |
|---|---|---|---|
| 1 | Connects a mailbox in Settings | Done with the hard part | Unchanged |
| 2 | Follows Michael's link to Access, Email | Led to the right place | Unchanged; the panel starts closed |
| 3 | Opens Give Pam a mailbox | Knows what this is | The title says what it does |
| 4 | Reads the question | Clear, one thing to decide | Mailbox already chosen; usual choice already picked |
| 5 | Sees Only send email greyed | Not lost: a reason, nothing to fix now | The reason is at full strength |
| 6 | Presses Give to Pam | Sure what will happen | The button names who gets it |
| 7 | Sees the mailbox row | It worked, same words as the choice | "Pam reads and answers it" |

### Design system

No new component. It stays the `card-2` panel with `RadioRows`, `Select` and `MiniButton`, with
descriptions in `hint` (12/17, `ink-3`).

One fix in `RadioRows`: a greyed row dims the whole row to 0.55, which takes the reason below 4.5:1,
and that reason is what the owner must read. Dim the radio and label only and keep the reason at
full `hint` colour. Research privacy uses the same rows and gets the same fix.

### Accessibility and sizes

- The question is the radio group's label. Arrow keys, tab order and the greyed rows' `aria-disabled`
  stay as `RadioRows` has them; each description sits inside its radio, so it is read with the name.
- Long member names wrap in the button and the title; the two buttons may wrap to a second line.
- Arabic mirrors as the panel does today. Choices stay in one column at any panel width.

## NOT in scope

- **The Sending choice** (Can send, Send on approval, Draft only): its names already say what they do.
- **Opening the panel from Michael's link:** the link still lands on a closed panel, one click away.
- **Hiring a member with a mailbox:** the hire binds a mailbox with no choice to make.
- **Agent facing text:** tools and the roster keep "sends only from", which they read correctly.

## What already exists

`RadioRows` (`desc`, `disabled`), the greyed with a reason rule (owner, 2026-10-03), `pickAdd`'s first
choice, the move confirmation, and the "reads" wording in `agentAccess.ts` and `index.ts`.

## Rules this changes

- **Less verbose screens:** this one choice keeps its short lines on screen (owner, D2, 2026-10-30).
- `branding/DESIGN.md` line 846 (Email row) needs the new words and the Only send rule.

## Decision ledger

| Decision | Answer | Approval |
|---|---|---|
| D1 scope | The whole mailbox flow, including the words after Add | Owner, 2026-10-30 |
| D2 direction | A: plain names, one visible line each, Only send greyed with why | Owner, 2026-10-30 |
| Title and button | Give Pam a mailbox, Give to Pam, as in mockup A | Shown in D2's mockup |
| D3 only mailbox | Chosen for the owner | Owner, 2026-10-30 |
| Reason stays readable on a greyed row | Dim radio and label only | Decided, no behavior change |
| Only send rule lives in the panel | Saved grants untouched | Decided, implementation |
| Neither choice possible | Both greyed, button off | Follows D2 |

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** Words: change the keys above in en, zh-CN and ar; remove `addMailboxInfo`.
  - Surfaced by: Pass 1, problems 1, 4 and 5.
  - Files: `src/renderer/src/i18n/locales/{en,zh-CN,ar}.json`.
  - Verify: the locale tests pass; no em or en dash in the new strings.
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** Panel: show the lines by the table above, remove the `InfoTip`, grey Only send while nobody reads, pick the only mailbox, name the member on the button.
  - Surfaced by: Pass 1 and 2, problems 2 and 3; D2, D3.
  - Files: `src/renderer/src/components/CapabilitiesTab.tsx`.
  - Verify: `test/multi-mailbox-ui.test.cjs`, `test/send-only-grants.test.cjs`, `test/ship-fixes-2026-10-07.test.cjs` updated and passing.
- [ ] **T3 (P2, human: ~1h / CC: ~10min)** `RadioRows`: keep the reason at full strength on a greyed row.
  - Surfaced by: Pass 5.
  - Files: `src/renderer/src/components/CapabilitiesTab.tsx`.
  - Verify: a source pin, then look at Access and Research privacy in the app.
- [ ] **T4 (P2, human: ~30min / CC: ~5min)** Docs: `branding/DESIGN.md` Email row and `docs/FEATURES.md`.
  - Surfaced by: Pass 5.
  - Files: `branding/DESIGN.md`, `docs/FEATURES.md`.
  - Verify: read both against the words above.

## Design Review Completion Summary

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | branding/DESIGN.md exists; UI scope yes     |
| Step 0               | 4/10, whole mailbox flow                    |
| Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes                     |
| Pass 2  (States)     | 5/10 → 9/10 after fixes                     |
| Pass 3  (Journey)    | 4/10 → 8/10 after fixes                     |
| Pass 4  (AI Slop)    | 9/10 → 9/10, no new pattern                 |
| Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
| Pass 6  (Responsive) | 6/10 → 9/10 after fixes                     |
| Pass 7  (Decisions)  | 2 resolved, 0 deferred                      |
+--------------------------------------------------------------------+
| NOT in scope         | written (4 items)                           |
| What already exists  | written                                     |
| TODOS.md updates     | 0 items proposed                            |
| Approved Mockups     | 3 built (HTML/CSS), 1 approved              |
| Decisions made       | 2 added to plan                             |
| Decisions deferred   | 0                                           |
| Overall design score | 4/10 → 8/10                                 |
+====================================================================+
```

Pass 3 stays at 8 because Michael's link lands on a closed panel, left out of scope on purpose.

### Unresolved Decisions

None.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Give a mailbox panel | docs/designs/mailbox-choice-ux.html | Option A | Built as HTML/CSS with app tokens, per the owner's mockup rule |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | none |
| Outside Review | none | Independent 2nd opinion | 0 | skipped | none |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 4/10 → 8/10, 2 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | none |

- **OUTSIDE COVERAGE:** skipped. Codex is limited to adversarial passes unless the owner says otherwise, and the owner's mockup rule rules out the designer.
- **VERDICT:** Design Review CLEAR; eng review required.

NO UNRESOLVED DECISIONS
