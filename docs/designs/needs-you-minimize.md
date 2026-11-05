# Minimize the Needs you column to a slim strip

Owner, 2026-11-05 (screenshot of a file tab with the Needs you column beside it): "give ability
to minimze the ask me side bar so that owner can have even bigger screen to read current tab".

Status: CEO review complete (mode HOLD SCOPE). D1 to D3 settled by the owner. Built 2026-11-05 (T1 to T6).

## 0A. Premise

- **Real problem.** While anything waits, the Needs you column is locked open (D12 of
  `needs-you-empty-state.md`, owner 2026-10-02): no X, Esc does nothing, and closing it reopens it
  (`App.tsx:422`). Its narrowest width is 320 px (`store.ts:1592`). Reading a report in a file tab
  with six asks waiting, the owner gives a quarter of the window to cards they are not reading.
- **The rule to keep.** D12's reason: an ask must never be out of sight. The owner's words then:
  "should not be collapsable or hidden as long as there is any ask me card".
- **Target.** The owner can shrink the column to a slim strip that still shows the coral count,
  read the tab at nearly full width, and open the column again in one click.
- **Do nothing.** Every report, email and file tab reads in three quarters of the window while
  asks wait, which on a busy office is most of the day.

## 0B. Existing code to reuse

| Sub-problem | Reuse |
|---|---|
| Column open, board or person | `rightColumn` and `setRightColumn` (`store.ts:228, 1148`) |
| The lock while asks wait | `columnLocked`, `closeTarget`, `columnEscAction` (`shell/rightColumn.ts`) |
| Keeping a terminal alive while hidden | the column stays mounted when off the office (`App.tsx:357`, `display: columnView ? 'flex' : 'none'`) |
| Stage and tab sizing beside the column | `columnShown`, `sidebarWidth`, `bleed` (`App.tsx:537, 616-673`) |
| The count | `useNeedsYouCount` (`shell/useNeedsYou.ts`) |
| The pill opening the board | `openNeedsYou` (`store.ts:1151`) |

No rebuild: minimized is one more state of the same column, not a new panel.

## 0C. Dream state

```
  CURRENT                          THIS PLAN                         12-MONTH IDEAL
  Column locked at 320 px or       A minimize button shrinks it to   The office arranges itself to
  more while any ask waits;        a slim strip with the coral       what the owner is doing: reading
  the tab reads beside it          count; one click opens it again   gets the room, asks stay in sight
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| M mode | One behavior on one column, about 9 files | n/a | HOLD SCOPE | approved | Owner chose "HOLD SCOPE (recommended)", 2026-11-05 |
| D1 look (App, new strip) | D12: asks never out of sight | open at 320 px or more, or closed only at zero | minimized: a slim strip (about 44 px) on the right edge with the coral count and an expand arrow; the tab or office takes the rest | approved | Owner chose "Slim strip with the count (recommended)" in D1. Scope: the minimized look. D12 stands: the column is never hidden while asks wait |
| D2 where (column headers) | Board and person panel share the column | n/a | one minimize button in the column's header on every view the column shows (office and file tabs), board or person panel; it stays minimized across views until expanded | approved | Owner chose "Everywhere it shows (recommended)" in D2 |
| D3 new ask (strip) | D12: an arriving ask opens a closed board | n/a | while minimized a new ask keeps it minimized; the count on the strip and the pill go up and the strip pulses once | approved | Owner chose "Stay minimized, count updates (recommended)" in D3 |
| E1 mounted (App) | A person's terminal must not remount (`App.tsx:357` comment) | n/a | minimized keeps the column mounted and hidden, so a terminal, a half written reply and drafts survive | decided (mechanic) | Owner rule: decide small mechanics |
| E2 not saved (store) | D12's intent at launch | n/a | minimized lives for the session only; a fresh start shows the column as today | decided (mechanic) | same |
| E3 expand triggers (store) | explicit opens show what was asked for | n/a | the strip, the pill, opening a person (pod, chips, Talk to) and Esc never minimize; all those opens expand it | decided (mechanic) | same |
| E4 wide panel (headers) | wide panel WD rules | n/a | no minimize button while a panel is wide; it goes back to the side first | decided (mechanic) | same |

## Reality rows

| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| P1 | The column cannot close while asks wait | `src/renderer/src/shell/rightColumn.ts:13` | verified |
| P2 | Closing reopens it while locked | `src/renderer/src/App.tsx:422` | verified |
| P3 | Narrowest width is 320 px | `src/renderer/src/store/store.ts:1592` | verified |
| P4 | The column stays mounted when hidden off the office | `src/renderer/src/App.tsx:357` | verified |
| P5 | Owner rule D12 forbids hiding while asks wait | `docs/designs/needs-you-empty-state.md:116` | verified |

unverified=0

REALITY: premise-table pass 5 claims verified, unverified=0 src/renderer/src/shell/rightColumn.ts:13
REALITY: already-done pass no minimize on origin/main since 2026-11-04 src/renderer/src/App.tsx:422
REALITY: surface-check pass no CLI flag or route named; store actions only src/renderer/src/store/store.ts:1148
REALITY: binding-decisions finding D12 stands; D1 keeps it with a strip, not a hide docs/designs/needs-you-empty-state.md:116
REALITY: numbers pass 320 px measured from the clamp; 44 px strip [estimated]; about 9 files [estimated] src/renderer/src/store/store.ts:1592
REALITY: deferred-asks pass no linked issue docs/designs/needs-you-minimize.md:1
REALITY: pr-count pass one PR on the running branch docs/designs/needs-you-minimize.md:1

## Behavior changes

No agent or orchestration behavior changes. For the owner:

| What | Rule today | Proposed | What the owner sees |
|---|---|---|---|
| Column while asks wait | open, at least 320 px | open, or minimized to a slim strip with the count | a minimize button in the column header; a strip with the count |
| A new ask while minimized | n/a (never minimized) | stays minimized, count goes up, strip pulses once | the number changes |
| After a restart | column open | column open (minimized is not kept) | as today |

## Review sections

**1. Architecture.**

```
  store: rightColumn ('closed' | 'board' | 'person')  +  columnMinimized (session only)
            │                                              ▲ set by the header button
            ▼                                              │ cleared by: strip, pill, open person, any explicit open
  App: column mounted as today ──► minimized ? hidden : shown at sidebarWidth
       strip (minimized && column open) ──► count, pulse on rise, click = expand
       stage / file tab width = window − (minimized ? strip : sidebarWidth)
```

D12's lock is unchanged: `columnLocked` still keeps `rightColumn` open; minimized is a separate
flag, so the lock never fights it.

**2. Error and rescue map.** No new failure paths: pure UI state. A count read that fails keeps
the last count (the feed's rule).

**3. Security.** None: no data, no IPC.

**4. Edge cases.**

| Case | Result |
|---|---|
| Minimize with a person's terminal open | terminal stays mounted; expand shows it as it was |
| New ask while minimized | strip and pill count rise, strip pulses once (D3) |
| Count reaches 0 while minimized | strip shows no count; its X closes the column as today at zero |
| Pill click while minimized | expands on the board |
| Pod click or a "for you" chip | expands on that person or ask |
| Wide panel | no minimize button (E4) |
| Pulse, Tasks, case study views | the column is not shown there today; nothing changes |
| Restart | column open (E2) |
| Keyboard | the button and the strip are buttons with labels; Esc unchanged |

**5. Code quality.** One store flag and one small strip component; headers gain one button.

**6. Tests.**

```
  store: minimize sets the flag; strip, pill, open person, openNeedsYou clear it     [unit, new]
  App: minimized keeps the column mounted and hides it; stage width uses the strip   [source pin, new]
  strip: count shows and pulses on a rise, not on a fall                            [unit, new]
  headers: button on board and person panel, not when wide                          [source pin, new]
  rightColumn: columnLocked unchanged (D12)                                         [existing]
```

**7. Performance.** None.

**8. Observability.** None needed.

**9. Deployment.** Ships with 0.3.6. No migration.

**10. Long-term.** Reversible. Debt: none.

**11. Design.** The strip: card background, a hairline on its left, the coral count near the top
and an expand chevron, full height. Header button: a small "minimize" chevron beside the info
icon, labelled "Minimize Needs you". No dashes in new text.

## Error and rescue registry

| Error | Trigger | Handler | Owner sees | Test |
|---|---|---|---|---|
| none new | | | | |

0 critical gaps.

## Failure modes

| Mode | Effect | Guard |
|---|---|---|
| Column unmounts on minimize | a terminal or a half written reply is lost | E1, source pin |
| Lock fights minimize | column flickers open | separate flag, store test |
| Ask hidden | owner misses it (breaks D12) | strip always shows the count while minimized |

## NOT in scope

- Remembering minimized across restarts.
- Minimizing on Pulse, Tasks or the case study (no column there).

## Implementation tasks

- [x] T1 store: `columnMinimized`, `setColumnMinimized`; explicit opens clear it
- [x] T2 App: hide the mounted column when minimized; render the strip; size the stage and tab to it
- [x] T3 Strip component: count, pulse on a rise, click to expand, labels
- [x] T4 Header button in NeedsYouBoard and the person panel header, hidden when wide
- [x] T5 locales (en, ar, zh-CN); FEATURES; D12 note in needs-you-empty-state.md
- [x] T6 tests as in Section 6

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW: COMPLETION SUMMARY                    |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | column lock D12; mounted column reusable    |
  | Step 0               | premise verified; D12 kept by the strip     |
  | Section 1  (Arch)    | 1 diagram, one store flag                   |
  | Section 2  (Errors)  | 0 new error paths                           |
  | Section 3  (Security)| none                                        |
  | Section 4  (Data/UX) | 9 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | diagram produced, 5 tests, 0 gaps           |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | 0 gaps                                      |
  | Section 9  (Deploy)  | no migration                                |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 0 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 3 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 0 proposed (HOLD)                           |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex: skipped (owner rule, adversarial only)|
  | Diagrams produced    | 2 (architecture, tests)                     |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

Approval readiness: PASS (M, D1, D2, D3 answered by the owner, 2026-11-05; E1 to E4 are mechanics)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps; D12 kept |
| Outside Review | codex, `/plan-eng-review` | Independent 2nd opinion | 0 | skipped | owner rule: Codex adversarial only |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | none | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | none | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex, plan review: skipped by the owner's standing rule (Codex only for the adversarial pass). No outside provider ran.
- **VERDICT:** CEO CLEARED. Eng review not run.

NO UNRESOLVED DECISIONS
