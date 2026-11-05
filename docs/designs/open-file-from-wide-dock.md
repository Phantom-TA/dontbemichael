# A file opened from the wide 1:1 shows

Design review of the owner's report, 2026-10-26. Status: built (design and eng reviewed).

## Original report (owner, verbatim)

"owner had 1:1 michael opened up in expanded mode. they asked a question to michael for which he created some content and gave the link to open in the app. when business owner clicked the link it did open as expected. however, business owner did not noitce it if that happened due to expanded chat window size."

## What happens today

```
 wide 1:1 holds the center (dockCentered, shell/wideCenter.ts)
   └─ owner clicks Michael's file chip (FileChip.tsx:112)
        └─ openFileTab (store.ts:1478): floorView = 'file', a tab in the top bar
             └─ the file view draws behind the wide 1:1, the office dimmed and out of reach
                  owner sees: nothing changes, except a new tab in the top bar
```

- The wide 1:1 is drawn over the office's center (michael-replies.md item 23). Its rule:
  one thing holds the center, whichever the owner opened last, the other back to the side
  for now (8A, `wideCenter.ts`). Only the 1:1 and a wide panel take part in that rule; a
  file tab does not, so a file opened from the 1:1 loses to it.
- The Needs you board sits beside the wide 1:1 and its cards carry file links too
  (AskMeTab, FileText): they open hidden the same way.
- Not this report: a ⌘ click on a path in a member's terminal opens Finder or the IDE
  (`terminalPool.ts:1001`), not a file tab.

## Design decisions

Mockup: `docs/designs/open-file-from-wide-dock-mockup.html` (HTML with the app's tokens; three
ways the click could behave; A was chosen).

1. **The file takes the center (D2 A, owner 2026-10-26).** Opening a file tab from the wide 1:1
   shows the file in the center, and the 1:1 goes back to the side for now, still open, with its
   draft and reading spot kept. This extends rule 8A ("whatever the owner opened last holds the
   center") to file tabs. Only a file that opens in a tab moves it: a file shown in Finder or
   one that can no longer be found leaves the 1:1 wide, as nothing appears in the center.
2. **Closing the file brings the 1:1 back (D3 A).** When the file view the 1:1 made way for
   closes (its last file tab closed, so no file is shown), the 1:1 returns to the center. Only
   a move the file caused is undone: a 1:1 the owner sent to the side with Esc stays there.
   Choosing Office, Tasks or another view instead keeps the 1:1 at the side.
3. **Keyboard and screen reader (D4 A).** When the file takes the center, focus moves to the
   file view's title and a polite live line reads "<file name> opened". When the 1:1 comes
   back on close, focus returns to its message box at the end of the text (the move already
   does this: BottomBar's `moved` effect).
4. **One rule for every file (D5 A).** Any file tab shown while the 1:1 is wide takes the
   center the same way: a link in the 1:1, a file link on a Needs you card beside it, or a
   file tab picked in the top bar.

## Screen after the click

```
 ┌ top bar: Office  Tasks  Pulse │ [Spring menu post ✕] (selected) ───────────────┐
 │ ┌ file view (center, focus on its title) ─────────┐ ┌ 1:1 at the side ────────┐ │
 │ │ Spring menu post                       [Copy]   │ │ Michael      Open wide  │ │
 │ │ ...the file...                                  │ │ ...conversation...      │ │
 │ │                                                 │ │ [Message Michael     ]  │ │
 │ └─────────────────────────────────────────────────┘ └─────────────────────────┘ │
 └─────────────────────────────────────────────────────────────────────────────────┘
 1st: the file (center)  2nd: its tab, selected  3rd: the conversation, waiting at the side
```

## States

| Click on a file | What the owner sees |
|---|---|
| Opens in a tab | The file in the center, the 1:1 at the side, "<name> opened" read out |
| Shown in Finder (no tab for that kind) | Finder opens; the 1:1 stays wide (today's behavior) |
| File gone | The chip says it can't be found (today's FileChip behavior); the 1:1 stays wide |
| Already open in a tab | That tab is selected and takes the center, same as a new one |
| 1:1 already at the side (Esc or narrow) | The file opens as today; nothing to move |

## Journey

| Step | Owner does | Owner feels | Plan specifies |
|---|---|---|---|
| 1 | Asks Michael, wide, for a blog post | focused | unchanged |
| 2 | Clicks the file in Michael's reply | expects to see it | the file takes the center (1) |
| 3 | Reads, copies | in control, conversation still there | 1:1 at the side, focus on the file (1, 3) |
| 4 | Closes the file | wants to carry on talking | 1:1 back in the center, focus in its box (2, 3) |

## NOT in scope

- A "Back to the conversation" button on the file view: closing the file and the side 1:1's
  Open wide already cover it (dropped from mockup A).
- A split center (mockup B): not chosen.
- Paths ⌘ clicked in a member's terminal: they open Finder or the IDE, never a file tab.

## What already exists

- `shell/wideCenter.ts` (rule 8A, `dockCentered`), the store's `dockSideForNow` (side for now,
  cleared when the 1:1 closes) and `centerClaim`, `openFileTab` / `selectFileTab` / `closeTab`
  in `store/fileTabs.ts`, the move's focus to the message box (BottomBar), FileTabView's live
  region (`aria-live` for Copy).

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — store — a file tab shown while the 1:1 is wide sends it to the side for now, remembering the file moved it
  - Surfaced by: decisions 1 and 4
  - Files: src/renderer/src/store/store.ts, src/renderer/src/shell/wideCenter.ts
  - Verify: test/wide-dock.test.cjs rows for open, select and Esc kept
- [ ] **T2 (P1, human: ~2h / CC: ~10min)** — store — closing the last file view the 1:1 made way for returns it wide; another view keeps it at the side
  - Surfaced by: decision 2
  - Files: src/renderer/src/store/store.ts
  - Verify: test rows for close, close with tabs left, view switch
- [ ] **T3 (P1, human: ~2h / CC: ~10min)** — file view — focus the title and read "<name> opened" when it takes the center from the 1:1
  - Surfaced by: decision 3
  - Files: src/renderer/src/components/FileTabView.tsx, three locale files
  - Verify: source pins; hand check with VoiceOver
- [ ] **T4 (P2, human: ~30min / CC: ~5min)** — docs — michael-replies.md item 23 and FEATURES.md
  - Surfaced by: decision 1 (rule 8A changes)
  - Files: docs/designs/michael-replies.md, docs/FEATURES.md
  - Verify: read through

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope: wide 1:1, file  |
  |                      | tab, Needs you board                         |
  | Step 0               | 2/10, all seven passes                       |
  | Pass 1  (Info Arch)  | 2/10 → 9/10 after fixes                      |
  | Pass 2  (States)     | 5/10 → 9/10 after fixes                      |
  | Pass 3  (Journey)    | 4/10 → 9/10 after fixes                      |
  | Pass 4  (AI Slop)    | 9/10 → 9/10 (no new visuals; app UI rules)   |
  | Pass 5  (Design Sys) | 9/10 → 9/10 (existing tab, dock, tokens)     |
  | Pass 6  (Responsive) | 3/10 → 9/10 after fixes                      |
  | Pass 7  (Decisions)  | 1 resolved, 0 deferred                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                            |
  | What already exists  | written                                      |
  | TODOS.md updates     | 0 items proposed                             |
  | Approved Mockups     | 3 sketched (HTML), 1 approved (A)            |
  | Decisions made       | 4 added to plan                              |
  | Decisions deferred   | 0                                            |
  | Overall design score | 2/10 → 9/10                                  |
  +====================================================================+
```

Pass notes: Pass 2 rose with decision 1 (a Finder or missing file leaves the 1:1 wide) and the
states table. Pass 4: an OPERATE surface, no new visual element, no hard rejection. Pass 5:
reuses the file tab, the side 1:1 and their tokens. Pass 6: no new narrow layout (the side 1:1
and file view behave as today); decision 3 covers keyboard and screen reader. Outside voices
were not run (owner rule: Codex only for the DeepSeek adversarial pass).

### Unresolved Decisions

None.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|---|---|---|---|
| File opened from the wide 1:1 | docs/designs/open-file-from-wide-dock-mockup.html (option A) | file in the center, 1:1 at the side | HTML sketch with the app's tokens (owner rule, no image designer); emoji stand in for the file icon |

## Eng review (2026-10-26)

Target: this plan. Scope Challenge: scope accepted as-is.

### Scope Challenge

- Already there: `dockSideForNow` (side for now, cleared when the 1:1 closes, `store.ts:1359`),
  `setDockWide` clears it (`store.ts:1054`), `openFileTab` / `selectFileTab` / `closeFileTab`
  (`store.ts:1478-1483`), the move's focus to the message box (BottomBar `moved` effect).
- Complexity: about 9 files (wideCenter.ts, store.ts, FileTabView.tsx, three locales,
  test/wide-dock.test.cjs, michael-replies.md, FEATURES.md), 0 new classes: the gate trips on
  files; the arrangement below is taken without a question (owner standing rule: no code
  arrangement questions).
- Arrangement: two pure helpers in `shell/wideCenter.ts` beside `dockCentered`, the store
  calls them; no new store module.

### 1. Architecture

```
 FileChip click (1:1 or Needs you card) ── openFileTab ─┐
                                                       ▼
                         fileShownPatch(s): 1:1 open, chosen wide, not side for now?
                           ├ yes ─> dockSideForNow = true, dockAsideForFile = true,
                           │        fileOpened = { id, seq+1 }   (FileTabView: focus + "opened")
                           └ no  ─> nothing (file opens as today)
 closeFileTab ─> view after close ─> fileClosedPatch(s, view):
                                       dockAsideForFile and view != 'file'
                                         └ dockSideForNow = false, dockAsideForFile = false
                                           (1:1 back wide; BottomBar's move focuses its box)
 setFloorView(office/tasks/...) ─> dockAsideForFile = false (1:1 stays at the side)
 setDock(false) / setDockWide(true) ─> dockAsideForFile = false
```

- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/store/store.ts:1359 — `dockSideForNow: false` is also what Esc sets (`MichaelDock.tsx:225`, `BottomBar.tsx:126`); decision 2 undoes only the file's move, so a second flag, `dockAsideForFile`, marks it. Necessary for decision 2.
- [INFORMATIONAL] (confidence: 8/10) src/renderer/src/App.tsx:369 — `useEffect(() => { stageRef.current?.toggleAttribute('inert', wide || dockWide); }` runs after FileTabView's own effects (a parent's effects run after its children's), so focusing the file title at once lands in an inert tree and does nothing. FileTabView focuses on the next frame (requestAnimationFrame). Necessary for decision 3.
- [INFORMATIONAL] (confidence: 9/10) src/renderer/src/shell/TopBar.tsx:143 — the top bar is in the inert stage while the 1:1 is wide, so "a file tab picked in the top bar" (decision 4) cannot happen then; `selectFileTab` still calls the same helper, which covers the board and any later caller. Factual correction, no behavior change.
- Failure in production: the file view fails to read the file. FileTabView shows its own error as today; the 1:1 is at the side and comes back when that tab closes.

### 2. Code quality

- The two helpers take the store's plain fields and return a patch, like `dockCentered`; the
  store stays the one writer. No shared code to extract.

### 3. Test review

```
CODE PATHS                                                USER FLOWS
[+] fileShownPatch                                          [+] Wide 1:1, click Michael's file
  ├── [GAP] wide and open -> side for now + flag + notice     ├── [GAP] file in the center, 1:1 at the side [→ hand]
  ├── [GAP] already at the side (Esc) -> nothing              ├── [GAP] close it -> 1:1 back wide, box focused [→ hand]
  ├── [GAP] closed, or chosen narrow -> nothing               └── [GAP] VoiceOver hears "<name> opened" [→ hand]
[+] fileClosedPatch                                         [+] Needs you card file, 1:1 wide
  ├── [GAP] flag and view leaves file -> back wide            └── [GAP] same as above (one path)
  ├── [GAP] another file still shown -> stays at the side
  └── [GAP] no flag (Esc side) -> stays at the side
[+] store wiring (openFileTab, selectFileTab, closeFileTab, setFloorView, setDock, setDockWide) [GAP, source pins]
[+] FileTabView focus on the next frame + live line [GAP, source pins]
[+] 8A rule rows today [★★★ TESTED] test/wide-dock.test.cjs:21
COVERAGE: 1/13 tested today | all gaps planned: table rows, pins, three hand checks
```

- Value: protects=a file shown while the 1:1 is wide takes the center and only the file's move is undone on close; fails_when=the helper ignores Esc's side, the flag is not cleared, or a remaining file tab returns the 1:1; why_new=new rule; seam=pure helpers; no_claim=the layout and focus on screen (hand check)
- Value: protects=focus reaches the file title after the stage stops being inert, and the live line names the file; fails_when=focus runs in the same effect as the inert change or the live line is missing; why_new=decision 3; seam=none (source pin); no_claim=VoiceOver reading it (hand check)
- Regression: test/wide-dock.test.cjs keeps its rows; `dockCentered` itself does not change.

### 4. Performance

No issues found: the helpers read a few fields on a click.

### Approval readiness

PASS: decisions 1 to 4 approved in the design review (D2 to D5); the findings above are
necessary mechanics of those decisions, no new choice. Outside voice skipped (owner rule).

### Eng implementation tasks (refine T1 to T3)

- [ ] **T1** — `fileShownPatch` and `fileClosedPatch` in `shell/wideCenter.ts`; store fields
  `dockAsideForFile`, `fileOpened: { id, seq } | null`; `openFileTab` and `selectFileTab` apply
  the first, `closeFileTab` the second; `setFloorView` to a fixed view, `setDock(false)` and
  `setDockWide(true)` clear the flag. Verify: rows in test/wide-dock.test.cjs.
- [ ] **T2** — FileTabView: on a new `fileOpened` for its tab, focus the title (tabIndex -1) on
  the next frame and set the live line `fileTab.opened` "{{name}} opened" (three languages).
  Verify: source pins; hand check with VoiceOver.
- [ ] **T3** — docs: rule 8A in michael-replies.md item 23, FEATURES.md.

REALITY: premise-table pass 7 claims checked (store.ts:1054, store.ts:1359, store.ts:1478, App.tsx:369, MichaelDock.tsx:225, TopBar.tsx:143, FileChip.tsx:112), unverified=0
REALITY: already-done pass no change on origin/main since 2026-10-20 to wideCenter.ts or fileTabs.ts beyond 650bbe89 (close background tab); wideCenter.ts:28
REALITY: surface-check pass requestAnimationFrame and the inert attribute are what App.tsx:369 already uses
REALITY: binding-decisions pass design decisions D2 to D5 kept; rule 8A extended, not changed (wideCenter.ts:28)
REALITY: numbers pass 9 files [estimated], 13 paths in the diagram [measured: diagram above] docs/designs/open-file-from-wide-dock.md:1
REALITY: deferred-asks pass no linked issue; the owner's report (file unseen in the wide 1:1) is decision 1 at FileChip.tsx:112
REALITY: pr-count pass no ship policy; same running branch at c335dbba

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run for this plan | none |
| Outside Review | codex | Independent 2nd opinion | 0 | skipped (owner rule) | none |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (all mapped to T1 to T3) | 3 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 2/10 → 9/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | none |

- **OUTSIDE COVERAGE:** codex not run in either review (owner rule: Codex only for the DeepSeek adversarial pass); no outside coverage.
- **VERDICT:** DESIGN + ENG CLEARED — ready to implement (T1 to T3).

NO UNRESOLVED DECISIONS
