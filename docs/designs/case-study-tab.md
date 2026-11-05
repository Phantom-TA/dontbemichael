# The case study opens as a tab, and the owner can't change it

Owner, 2026-11-04 (screenshot of the full window case study overlay): "the case study should open
like a tab in the app rather a whole big overlay". In review the owner added: "lets fully hide
customization options. case study wont be modifiable by business owner", and then chose to keep
only Send and Save.

Status: CEO review complete (mode HOLD SCOPE). D1, D2, D3 settled by the owner. Built 2026-11-04 (T1 to T7).

## 0A. Premise

- **Real problem.** The case study is a full window dialog over a dimmed office
  (`CaseStudyScreen.tsx:258`, `Dialog ... fill width={1120}`). While it is up the owner can't
  reach their tabs, Pulse's numbers or Ask me, and Escape or a stray click drops it. It reads as a
  blocking popup, not a place in the app.
- **Second problem (owner, in review).** The words panel lets the owner rewrite every part of a
  page that says it was "Counted by the app". The owner wants the page to be the app's own: drafted
  from the office's facts and not changed by hand.
- **Target.** The case study opens as a tab in the top bar, beside the owner's other tabs. It shows
  the finished page and only what sending needs: the permission tick, the mailbox, Send and Save.
- **Do nothing.** The overlay keeps blocking the app, and the page keeps owner written words beside
  Pulse's numbers.

## 0B. Existing code to reuse

| Sub-problem | Reuse |
|---|---|
| A closable tab in the top bar | `ViewTabs` file tabs after a hairline (`shell/TopBar.tsx:132`), `closeFileTab` rules (`store/fileTabs.ts`) |
| A view that fills the window below the top bar | the view overlay (`App.tsx:559`), `barHidden` (`App.tsx:359`), Pulse's whole window rule |
| Opening it from anywhere | the existing `setCaseStudyOpen` callers: Pulse's button (`PulseView.tsx:862`), Michael's Ask me card (`CaseStudyCard.tsx`), the desktop notice (`CaseStudyEvents.tsx`) |
| The page's words without the owner | `startingEdits(facts, draft)` (`shared/caseStudy.ts:626`), the draft main already holds (`heldDraft`, `main/caseStudy.ts`) |
| Sending and saving | `CaseStudyService.send` and `pdf` (`main/caseStudy.ts:293-330`), unchanged but for where the words come from |

No rebuild. The screen keeps its preview, drafting and sending code; it loses the dialog frame and
the panel's editing groups.

## 0C. Dream state

```
  CURRENT                        THIS PLAN                          12-MONTH IDEAL
  A dimmed full window dialog;   A Case study tab in the top bar;   Case studies are a page the app
  the owner rewrites every       the page is the app's own draft;   writes from measured work alone,
  word, picks the headline,      the owner reads it and sends or    refreshed each month, that the
  period, name and logo          saves; nothing to edit             owner reads and sends in one click
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| M mode | One UI move, about 6 files, existing tabs | n/a | HOLD SCOPE | approved | Owner chose "HOLD SCOPE (recommended)", 2026-11-04 |
| D1 layout (App, TopBar) | Owner: "open like a tab"; Pulse fills the window below the top bar | full window dialog over a dimmed office | a closable Case study tab after the hairline with file tabs; it fills the window below the top bar like Pulse, no bottom bar, the Ask me column closed and opened over it from Needs you as on Pulse | approved | Owner chose "Whole window, like Pulse (recommended)" in D1, 2026-11-04. Scope: tab place and layout |
| D2 customization (CaseStudyScreen, main) | Owner: "fully hide customization options. case study wont be modifiable by business owner" | Headline choice; The words panel (subtitle, before, your words, each team line, why); period; Show the business name; logo pick and brand colour | none of these. The page uses the app's draft: the first headline choice, the drafted subtitle, about, team lines and why; no Before chapter and no owner quote | approved | Owner answer to D2, 2026-11-04. Scope: every wording control. Replaces case-study.md D22 (words panel) and the owner's headline pick in D24 |
| D3 other controls (CaseStudyScreen, main) | Period, name switch, logo fix change what shows, not the wording | period (last 30 days or this month), Show the business name, logo fix | only Send and Save stay, with the permission tick and the mailbox that sending needs: always the last 30 days, the business name always shown, the website logo or none | approved | Owner chose "Only Send and Save" in D3, 2026-11-04. Scope: the panel's other controls. Replaces case-study.md D8's switch and D3's file pick fallback |
| D4 close (TopBar) | D2 leaves nothing to lose | the dialog's X and Escape | the tab's X closes it at once | settled by D2 | The close question (original D2) became moot with D2's answer |
| E1 tab life (store, App) | Design: "Edits last while the screen is open" (`case-study.md:194`) | n/a | the screen stays mounted while its tab is open, hidden when another view shows, so a send in flight, the draft and the preview survive a switch; never kept across a restart (main's preparation is in memory too) | decided (mechanic) | Small mechanic, decided by the reviewer (owner rule: decide small choices) |
| E2 words source (main) | D24: main fills the headline words itself | main cleans words sent by the screen (`cleanEdits`) | main ignores anything the screen sends and builds the words from `startingEdits(facts, heldDraft)`; the IPC no longer carries words | decided (mechanic) | Follows from D2: the only words are the app's |
| E3 draft failed (CaseStudyScreen) | With no fields, a failed draft would leave parts blank | Retry next to empty fields | one Try again on the page when the draft failed; it redrafts and changes nothing else | decided (mechanic) | Recovery, not customization; reviewer's call |

## Reality rows

| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| P1 | The case study is a full window dialog | `src/renderer/src/components/pulse/CaseStudyScreen.tsx:258` | verified |
| P2 | It is mounted inside Pulse | `src/renderer/src/components/pulse/PulseView.tsx:862` | verified |
| P3 | Closable view tabs exist after a hairline | `src/renderer/src/shell/TopBar.tsx:132` | verified |
| P4 | Pulse fills the window with no bottom bar | `src/renderer/src/App.tsx:359` | verified |
| P5 | Main builds words from a draft with `startingEdits` available | `src/shared/caseStudy.ts:626` | verified |
| P6 | Main takes the screen's words today | `src/main/caseStudy.ts:296` | verified |
| P7 | Public text promises editing every word and a name switch | `TELEMETRY.md:174`, `TELEMETRY.md:182` | verified |

unverified=0

REALITY: premise-table pass 7 claims verified, unverified=0 src/renderer/src/components/pulse/CaseStudyScreen.tsx:258
REALITY: already-done pass no case study tab or wording lock on origin/main since 2026-11-03 src/renderer/src/store/fileTabs.ts:1
REALITY: surface-check pass no CLI flag or route named; IPC `caseStudy:send` and `caseStudy:savePdf` change signature src/main/index.ts:7624
REALITY: binding-decisions finding D2 and D3 replace case-study.md D22, D24 (headline pick), D8 (name switch) and D3 (file pick); recorded above docs/designs/case-study.md:105
REALITY: numbers pass about 14 files [estimated]; no measured baseline used docs/designs/case-study-tab.md:1
REALITY: deferred-asks pass no linked issue docs/designs/case-study-tab.md:1
REALITY: pr-count pass one PR on the running branch docs/designs/case-study-tab.md:1

## Behavior changes

No agent or orchestration behavior changes: Michael, the team, prompts and schedules are untouched.
What the owner sees changes:

| What | Rule today | Proposed | Who | What the owner sees |
|---|---|---|---|---|
| Where the case study opens | a full window dialog | a Case study tab in the top bar | owner | a tab with an X beside their other tabs |
| Who writes the page | the app drafts, the owner edits every word | the app drafts; nobody edits | owner | the finished page, Send and Save |
| Headline | owner picks one of the drafted choices | the first drafted choice | owner | one headline |
| Period | last 30 days or this month | always the last 30 days | owner | no period picker |
| Business name | a switch can hide name, logo and website | always shown | owner | no switch; not sending is the way out |
| Logo | from the website, or a file the owner picks | from the website, or none | owner | no Change logo |
| Owner quote and Before | owner typed | gone | owner | no quote, no Before chapter |

## Review sections

**1. Architecture.**

```
  Pulse "Get featured" ─┐
  Ask me card View ─────┼─► store.openCaseStudy() ─► floorView 'case-study', caseStudyOpen true
  Desktop notice ───────┘                                  │
                                                           ▼
  TopBar ViewTabs: Office Tasks Pulse Who │ files… │ [Case study ×]
  App view overlay: <CaseStudyScreen> mounted while open; shown only on 'case-study'
                                                           │
                         caseStudyOpen(input fixed: last-30, name shown) ─► main facts + held draft
                         Send / Save ─► main: pdf(input) builds words from startingEdits(heldDraft)
```

The tab is a fixed kind, not a file tab: it does not count toward the five file tabs and never
closes the oldest one. Closing it (X) returns to the view the owner came from, as closing a file
tab does.

**2. Error and rescue map.** See the registry below. Every failure keeps a line on the page.

**3. Security and threat model.** Removing the editing closes the path for owner typed words or
numbers beside Pulse's figures: main stops reading words from the screen at all (E2), so a tampered
renderer can't put text on the page we receive. The permission tick and the owner's own mailbox
stay as they are (D1, D9 of case-study.md). Privacy cost, accepted by the owner (D3): the page
always names the business, with its logo and website; the owner's protection is that nothing leaves
unless they press Send.

**4. Data flow and edge cases.**

| Case | Result |
|---|---|
| Open while preparing | the tab opens and says it is preparing; the page appears when main is ready |
| Switch tabs mid send | the screen stays mounted; the send finishes and the result shows on return |
| Close mid send | the X is disabled while sending or saving (the dialog's `busy` today) |
| Open twice (card, then Pulse) | selects the one tab |
| Draft failed | the page shows built in words where the draft is missing, and one Try again |
| No work in the period | the empty state, as today; Send and Save disabled |
| No mailbox can send | Save and open my mail app, as today |
| Restart | no tab; main's preparation is gone too, so Get featured starts again |

**5. Code quality.** Mostly deletion: the words panel, headline radios, period select, name toggle,
logo change control and their state go. `cleanEdits` and its typed number check lose their caller;
remove them with their tests rather than keep dead code (D20's guard is moot once no words come in).

**6. Tests.**

```
  store: openCaseStudy selects one tab; close returns to the prior view   [unit, new]
  TopBar: the Case study tab renders after the hairline with an X          [source pin, new]
  main: pdf/send ignore any words sent and use startingEdits(heldDraft)    [unit, new; fails today]
  main: input is always last-30 with the name shown                        [unit, new]
  screen: no headline, words, period, name or logo controls                [electron screen test, updated]
  card and notice: View opens the tab                                      [unit, updated]
  docs: TELEMETRY no longer promises editing or the name switch            [docs test, updated]
```

**7. Performance.** None: one fewer dialog, same preview.

**8. Observability.** The existing `case-study-*` log entries stay. No new metric.

**9. Deployment.** Ships in 0.3.6 with the rest of the running branch. No migration: nothing about
the case study is saved but the logo.

**10. Long-term.** Reversible: the words panel can come back from git. Debt: none added.

**11. Design.** The tab label is "Case study". The page fills the left, a narrow column on the
right holds the permission tick, the mailbox, Send and Save, and the info icon. No dashes in any
new text.

## Error and rescue registry

| Error | Trigger | Handler | Owner sees | Test |
|---|---|---|---|---|
| Facts unreadable | `caseStudyOpen` null | screen | "couldn't load" line, as today | screen test |
| Draft failed | model error or timeout | screen | built in words and Try again | new unit |
| Send refused | mailbox error | screen | the mailbox's reason, as today | existing |
| Send may have gone | timeout or interrupt | screen | "may have been sent, check Sent", as today | existing |
| PDF failed | printToPDF error | screen | save failed line, as today | existing |

0 critical gaps.

## Failure modes

| Mode | Effect | Guard |
|---|---|---|
| Tab unmounts on switch | an in flight send result is lost | keep mounted while open (E1) |
| Main still reads screen words | owner words reach the page | E2 unit test |
| Two tabs | confusion | one fixed tab, open selects it |
| Hidden name text left in prompts | page mentions a hidden name | moot: the name always shows (D3) |

## NOT in scope

- Saving the case study across restarts.
- A monthly refreshed case study (12 month ideal).
- Owner edits by any other route (Michael, a file).

## Implementation tasks

- [x] T1 store: `openCaseStudy` and `closeCaseStudy` with floorView 'case-study'; tab not counted with file tabs
- [x] T2 TopBar and App: the Case study tab with X; the screen mounted while open, shown on its view, no bottom bar, column closed
- [x] T3 CaseStudyScreen: no Dialog; remove headline, words, period, name and logo controls; fixed input; Try again on a failed draft
- [x] T4 main and IPC: words from `startingEdits(facts, heldDraft)` only; drop words from `caseStudy:send` and `caseStudy:savePdf`; remove `cleanEdits`
- [x] T5 callers: Pulse button, Ask me card, desktop notice open the tab
- [x] T6 text: unused locale keys removed in three languages; TELEMETRY.md, README, FEATURES and case-study.md (new D29 and D30 rows) updated
- [x] T7 tests as in Section 6

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW: COMPLETION SUMMARY                    |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | dialog in Pulse; file tabs reusable         |
  | Step 0               | premise verified; owner widened scope (D2)  |
  | Section 1  (Arch)    | 1 diagram, tab is a fixed kind              |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 1 risk closed (screen words), 1 accepted    |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | dead code removed with its caller           |
  | Section 6  (Tests)   | diagram produced, 7 tests, 0 gaps           |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | 0 gaps                                      |
  | Section 9  (Deploy)  | no migration                                |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 4 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 0 proposed (HOLD); owner widened D2, D3     |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex: skipped (owner rule, adversarial only)|
  | Diagrams produced    | 2 (architecture, tests)                     |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

Approval readiness: PASS (M, D1, D2, D3 answered by the owner, 2026-11-04; E1 to E3 are mechanics)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps; owner removed customization |
| Outside Review | codex, `/plan-eng-review` | Independent 2nd opinion | 0 | skipped | owner rule: Codex adversarial only |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | none | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | none | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex, plan review: skipped by the owner's standing rule (Codex only for the adversarial pass). No outside provider ran.
- **VERDICT:** CEO CLEARED. Eng review not run.

NO UNRESOLVED DECISIONS
