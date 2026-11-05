# The Needs you pill hides while the column shows

Owner, 2026-11-05 (screenshot: the coral "Needs you 5" pill above the open Needs you board, which
shows "Needs you 5" again): "when ask me is already visible the big red ask me pill is redundant
and should be hidden to look top area less cluttered".

Status: CEO review complete (mode HOLD SCOPE). D1 and D2 settled by the owner. Built 2026-11-05 (T1 to T4).

## 0A. Premise

- **Real problem.** With the column open, the count shows twice a few centimeters apart: the coral
  pill in the top bar (`TopBar.tsx`, `NeedsYouButton`) and the board's heading badge
  (`NeedsYouBoard.tsx`). The pill is the loudest thing on screen and says nothing new.
- **What the pill also does** (`needs-you-empty-state.md` D1, D10): Michael's paper plane lands on
  it and it bumps (`cth:needs-you-ping`, `scene/studio/life.tsx:160`); it carries the screen reader
  line for a new ask; focus returns to it when the column closes (`focusNeedsYouPill`); a click on
  it is not an outside click (`App.tsx`).
- **Target.** The pill shows only when the column does not: the count stays visible in exactly one
  place.
- **Do nothing.** Two counts and a pulsing coral pill on every view where the column is open.

## 0B. Existing code to reuse

| Sub-problem | Reuse |
|---|---|
| Whether the column shows | `rightColumn`, `floorView` (store); App's `columnShown` rule (`App.tsx:360`) |
| The pill and its states | `NeedsYouButton`, `pillState` (`TopBar.tsx:333`, `useNeedsYou.ts`) |
| Plane ping | `cth:needs-you-ping` event |
| Focus back | `focusNeedsYouPill` (`shell/rightColumn.ts`) |

## 0C. Dream state

```
  CURRENT                          THIS PLAN                        12-MONTH IDEAL
  Pill and board both show the     One count on screen: the pill    The top bar holds only what the
  count; the pill pulses above     when the column is away, the     current view lacks
  an open board                    column's own count when it shows
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| M mode | One button, about 5 files | n/a | HOLD SCOPE | approved | Owner chose "HOLD SCOPE (recommended)", 2026-11-05 |
| D1 when (TopBar) | Board, person panel (its coral strip) and the minimized strip each show the count | pill always shows | the pill, in every state (blank, quiet, reports, coral), hides whenever the column shows on the current view: board, a person's panel or the minimized strip; it shows on Tasks, Pulse, Who talks to whom and the case study, and when the column closes | approved | Owner chose "Whenever the column shows (recommended)" in D1 |
| D2 space (TopBar) | the cluster to its left | n/a | the pill leaves the layout and the other top bar buttons close the gap | approved | Owner chose "Close the gap" in D2 (my recommendation was to keep the space) |
| E1 announce (TopBar) | D10 screen reader line | lives inside the pill | the live region stays mounted while the pill is hidden, so a new ask is still announced | decided (mechanic) | Owner rule: decide small mechanics |
| E2 focus (rightColumn) | D10 focus back to the pill | `getElementById` after leave | waits one frame for the pill to come back, then focuses it | decided (mechanic) | same |
| E3 plane (NeedsYouBoard) | D1 plane lands on the pill | pill bumps | with the pill hidden, the board's count badge bumps on the ping; the minimized strip already pulses on a rise | decided (mechanic) | same |

## Reality rows

| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| P1 | The board heading shows the count | `src/renderer/src/shell/NeedsYouBoard.tsx:41` | verified |
| P2 | The pill holds the screen reader line | `src/renderer/src/shell/TopBar.tsx:353` | verified |
| P3 | The plane pings the pill | `src/renderer/src/scene/studio/life.tsx:160` | verified |
| P4 | The column shows only on the office and file tabs | `src/renderer/src/App.tsx:360` | verified |
| P5 | Focus returns to the pill on close | `src/renderer/src/shell/rightColumn.ts:46` | verified |

unverified=0

REALITY: premise-table pass 5 claims verified, unverified=0 src/renderer/src/shell/TopBar.tsx:353
REALITY: already-done pass no pill hiding on origin/main since 2026-11-04 src/renderer/src/shell/TopBar.tsx:333
REALITY: surface-check pass no CLI flag or route; store and component only src/renderer/src/shell/TopBar.tsx:333
REALITY: binding-decisions finding needs-you-empty-state.md D1 (plane lands on the pill) and D10 (focus to the pill) adjusted by E2 and E3 docs/designs/needs-you-empty-state.md:62
REALITY: numbers pass about 5 files [estimated] docs/designs/needs-you-pill-hides.md:1
REALITY: deferred-asks pass no linked issue docs/designs/needs-you-pill-hides.md:1
REALITY: pr-count pass one PR on the running branch docs/designs/needs-you-pill-hides.md:1

## Behavior changes

No agent or orchestration behavior changes. For the owner:

| What | Rule today | Proposed | What the owner sees |
|---|---|---|---|
| Top bar pill with the column open | coral pill with the count | hidden; the other buttons slide right | one count, in the column |
| Top bar on Tasks, Pulse, graph, case study | pill shows | pill shows | as today |
| A new ask with the column open | plane lands on the pill, which bumps | plane lands top right, the board's count bumps | the column's count |

## Review sections

**1. Architecture.**

```
  store: rightColumn, floorView ──► pillHidden(rightColumn, floorView)  (pure, rightColumn.ts)
  TopBar NeedsYouButton: live region always; pill only when !pillHidden
  NeedsYouBoard: count badge bumps on cth:needs-you-ping
  focusNeedsYouPill: next frame, then focus
```

`pillHidden` mirrors App's `columnShown` (column open and the view is the office or a file tab),
so the two can't disagree; a test pins them together.

**2. Errors.** None new.
**3. Security.** None.

**4. Edge cases.**

| Case | Result |
|---|---|
| Column opens or closes | the pill hides or shows; the top bar buttons shift (D2) |
| Switch to Tasks with the column open | the pill shows there (the column is hidden on Tasks) |
| Column at zero (All clear) | no quiet pill while the column shows; "Nothing needs you" once it closes |
| Launch, count unknown | the column is closed then, so the blank pill shows as today |
| New ask with the column open | screen reader still hears it (E1); board badge bumps (E3) |
| Esc or X closes the column | focus lands on the pill once it is back (E2) |
| Minimized strip | the pill stays hidden; the strip shows the count (D1) |

**5. Code quality.** One pure rule, a conditional render, one listener moved.

**6. Tests.**

```
  pillHidden: open on office or file hides; closed or other views shows            [unit, new]
  pillHidden matches App's columnShown rule                                          [source pin, new]
  TopBar: live region rendered outside the hidden branch                             [source pin, new]
  focusNeedsYouPill waits a frame                                                    [source pin, new]
```

**7. Performance.** None. **8. Observability.** None. **9. Deployment.** Ships with 0.3.6.
**10. Long-term.** Reversible. **11. Design.** No new text.

## Error and rescue registry

| Error | Trigger | Handler | Owner sees | Test |
|---|---|---|---|---|
| none new | | | | |

0 critical gaps.

## Failure modes

| Mode | Effect | Guard |
|---|---|---|
| Live region unmounts with the pill | a new ask is not announced | E1, source pin |
| Focus lost on close | keyboard users land nowhere | E2 |
| pillHidden and columnShown drift | pill hidden while no column shows | shared rule test |

## NOT in scope

- Any other top bar change.

## Implementation tasks

- [x] T1 `pillHidden` in rightColumn.ts; TopBar hides the pill, keeps the live region
- [x] T2 focus waits a frame; board badge bumps on the ping
- [x] T3 FEATURES; note in needs-you-empty-state.md (D1 plane, D10 focus)
- [x] T4 tests as in Section 6

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW: COMPLETION SUMMARY                    |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | pill has 4 side jobs; all kept              |
  | Step 0               | premise verified                            |
  | Section 1  (Arch)    | 1 diagram, one pure rule                    |
  | Section 2  (Errors)  | 0 new                                       |
  | Section 3  (Security)| none                                        |
  | Section 4  (Data/UX) | 7 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | diagram produced, 4 tests, 0 gaps           |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | 0 gaps                                      |
  | Section 9  (Deploy)  | no migration                                |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (1 item)                            |
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

Approval readiness: PASS (M, D1, D2 answered by the owner, 2026-11-05; E1 to E3 are mechanics)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | codex, `/plan-eng-review` | Independent 2nd opinion | 0 | skipped | owner rule: Codex adversarial only |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | none | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | none | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex, plan review: skipped by the owner's standing rule (Codex only for the adversarial pass). No outside provider ran.
- **VERDICT:** CEO CLEARED. Eng review not run.

NO UNRESOLVED DECISIONS
