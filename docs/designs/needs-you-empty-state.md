# Needs you: when nothing needs the owner

Status: built in the working tree (2026-10-02), not yet run in the app or
shipped. Owner decisions D1 to D11 and eng R1 to R5 below.

## Problem

Owner, 2026-10-02: "when there is nothing for the owner, this area is useless and
looks ugly. probably hide it and make office visualization full size to take the
space. explore other ideas"

Most of the day nothing waits on the owner, so the right column shows the empty
Needs you board: the heading "Needs you", an info icon, and two centered lines,
"Nothing needs you right now." and "Michael is handling it. Questions for you land
here." It takes 380 px (about 30% of a 1280 px window) for the most common state,
and says "nothing needs you" three times on one screen (pill, heading, body).

## What already exists

- Shell (branding/DESIGN.md 5.2): top bar, stage (fills), right column 380 px
  default, 340 min, 520 max, resizable with `SidebarSplitter`. The column has no
  ground of its own: the office runs on underneath it (`StudioStage` `bleed`,
  `fitW = box.w - bleed`, `src/renderer/src/scene/studio/StudioStage.tsx:190`).
  Collapsing the column is setting `bleed` to 0; the scene already re-fits.
- Right column states (DESIGN.md 7.6): 1. Needs you board (default),
  2. a person's panel, 3. Michael's panel. In 2 and 3 a coral "Needs you N" strip
  (`NeedsYouStrip`) sits on top, hidden when nothing waits.
- `App.tsx:412`: the board shows when `needsYouOpen || !agent`.
- Needs you count (`src/renderer/src/shell/useNeedsYou.ts`): open Ask me cards
  plus schedule requests, polled every 5 s, separately by each caller.
  `StudioStage` keeps its own per person `forYouBy` count for the pod chips.
- Top bar Needs you button (DESIGN.md 7.5, `TopBar.tsx`): coral pill with a count,
  or a quiet white pill "Nothing needs you". Michael's paper plane lands on it
  (`cth:needs-you-ping`) and the button bumps.
- For you badge on a pod (DESIGN.md 7.15): "N for you", not clickable today.
- Restore banner (`NeedsYouBoard.tsx`, `RestoreTeamBanner`) at the top of the board.
- "Michael is clocking in" and "No team yet" cards float over the stage
  (`App.tsx`), the pattern the restore card follows.
- Michael's idle desktop notification rotates "I'm free" lines
  (`NOTIFY_IDLE_LINES`, `src/main/hooks.ts`), at most once every 3 hours.
- Owner rules: less verbose UI (explanations behind an InfoTip), no dashes in
  user-facing copy, neutral examples, every renderer string in every locale.

## Directions explored

HTML mockups of today and four directions, each at three moments (nothing
waits, an ask arrives, you open it):
https://claude.ai/artifact/HbTomdPsAGtzCemotorLi6

- **A. Collapse** (chosen, D1).
- **B. Make it useful:** keep the column, fill it with jobs to hand off and what
  runs next. Rejected: repeats the pod chips and adds words.
- **C. Popover from the pill:** rejected: replies and approvals in a popover a
  stray click closes.
- **D. Slim rail:** rejected: repeats the pill's count and still costs a strip.

## Decisions

- **D1, direction: A, collapse.** The right column is not rendered while nothing
  waits and no person or Michael is selected; the office fills the window
  (`bleed` 0, splitter not rendered, the saved column width kept for when it
  returns). When an ask arrives the layout does not change: the top bar pill
  turns coral with its count, Michael's paper plane flies to it, and the asking
  person's pod shows "1 for you". The column opens only on an owner action:
  clicking the pill, a "for you" chip (D11), or a pod (which opens that
  person's panel, as today). Exception at launch: D7.
- **D2, the pill at zero: plain status.** With nothing waiting the top bar pill
  is a non-interactive label, "Nothing needs you" (no button role, no hover,
  default cursor). It becomes the coral button again when something waits. The
  empty board is never shown.
- **D3, one count.** A single store-level Needs you count with three states,
  unknown, 0 and n, replaces the separate polls in the top bar, the board and
  the coral strip; the pod "for you" chips read the same source. While it is
  unknown (launch, before the first poll returns) the pill renders as an empty
  quiet pill with no text, never "Nothing needs you". A failed poll keeps the
  last known value.
- **D4, after the last answer.** When the owner answers the last open ask with
  the column open, the column stays, showing the All clear moment (D8) with the
  answered card below it. It collapses on the owner's next click outside the
  column, on Esc, or when they open a pod. It never collapses on a timer.
- **D5, restore banner.** "Last session's team is not back yet" moves out of the
  column to a floating card at the stage's top left (top right in RTL), same
  content and actions (Bring back all N, leave one out). It does not count
  toward Needs you and does not open the column. It goes away once the team is
  back or every person is dismissed.
- **D6, closing the column.** The Needs you heading gets a close (x) button at
  its end; Esc closes the column; clicking the coral pill while the column shows
  the board closes it. With asks still waiting, a click on the office does not
  close it (that applies only after the last answer, D4). Closing a person's or
  Michael's panel returns to the collapsed state, not to the board.
- **D7, at launch.** When the app starts and the first count (D3) comes back
  above 0, the column opens on the board without a click. Once per launch,
  during the office's lights-up start (DESIGN.md 8.12), before the owner has
  touched anything. Every later arrival follows D1.
- **D8, All clear.** The D4 moment reads "All clear." (`t-panel`, 15 px 600,
  `ink`), then one line from a short rotating set of Office humor lines (13 px,
  `ink-3`), then the answered card. Same voice as Michael's idle notification
  (`NOTIFY_IDLE_LINES`), added as renderer i18n keys in every locale; no dashes.
  This is where DESIGN.md 7.24's "one line of Office humor" now lives.
- **D9, resize motion.** Opening or closing the column animates the column
  width and the stage `bleed` together, ease-out, 240 ms, so the office eases to
  its new size. Under `prefers-reduced-motion` both snap. Check the stage holds
  frame rate while it re-fits; if not, animate the scene's scale transform and
  re-fit once at the end.
- **D10, keyboard and screen reader.** A visually hidden `aria-live="polite"`
  region announces "{godName} needs you: N" (i18n, every locale) once each time
  the count rises. Opening the column from the pill or by keyboard moves focus
  to the first card's reply field, or its heading when the card has none;
  closing returns focus to the pill. The launch auto-open (D7) does not move
  focus.
- **D11, the "for you" chip.** The pod's "N for you" chip becomes a button:
  it opens the column on the board, scrolls to and expands that person's newest
  ask, and focuses its reply field (D10). It gets a visible hover and focus
  state. The rest of the pod keeps opening the person's panel.

- **D12, locked open while anything waits (owner, 2026-10-02, after the build).**
  "The side panel should not be collapsable or hidden as long as there is any ask
  me card. That option to make office full screen is when there is absolutely
  nothing for owner to respond." Supersedes parts of D1, D6 and D7: when the
  count is above 0 the column is open and cannot be closed. An arriving ask (or
  one waiting at launch) opens the board at once, the office easing smaller
  (D9); focus does not move. No ✕, Esc and outside clicks do nothing to it, the
  coral pill only opens or focuses the board, and closing a person's panel goes
  back to the board. The column collapses only at zero: after All clear (D4), or
  with the ✕ that appears then. Code: `columnLocked` and `closeTarget` in
  `src/renderer/src/shell/rightColumn.ts`; the launch check (`launchCheck`) is
  gone, the App effect covers launch and arrival alike.
  Since 2026-11-05 (owner) the column can be minimized to a slim strip that keeps
  the coral count in sight; it is never hidden while asks wait, so D12 holds
  (docs/designs/needs-you-minimize.md).
  Since 2026-11-05 (owner) the top bar pill hides while the column shows, which
  shows the count itself; the plane's landing bumps the board's count then, and
  focus returns to the pill once it is back (docs/designs/needs-you-pill-hides.md).

Follows from the decisions above, no separate choice:

- **Every view.** D1 to D11 apply on Office, Tasks and Who talks to whom alike;
  the "No team yet" card centers on the full-width stage.
- **Reused as is.** The restore card (D5) keeps `RestoreTeamBanner`'s styling,
  with `shadow-lg` like the "clocking in" card because it floats over the stage.
  The close button (D6) uses the existing dismiss control's style (18 px,
  transparent, `ink-3` ✕) with the label "Close".
- **RTL** mirrors the column, restore card and pill side per DESIGN.md 5.2.
- **1280 × 800 minimum window:** collapsed, the office gets the full stage;
  open, the column keeps its 340 px minimum.

## Layout

```
Nothing waits (D1, D2)                        An ask arrives (D1): nothing moves
+------------------------------------------+  +------------------------------------------+
| lockup  tabs     clock  v  ☾ ⚙ [Nothing] |  | lockup  tabs     clock  v  ☾ ⚙ [●Needs 1]|
+------------------------------------------+  +------------------------------------------+
| [restore card, D5, only after restart]   |  |              . . . plane . . . . ↗       |
|                                          |  |                                          |
|        the office, full width            |  |     the office, full width               |
|                                          |  |     Kelly's pod: [1 for you] (D11)       |
| [Talk to Michael...] [Next: ...] [Hire]  |  | [Talk to Michael...] [Next: ...] [Hire]  |
+------------------------------------------+  +------------------------------------------+

You open it (pill, chip, or launch D7)        After the last answer (D4, D8)
+-----------------------------+------------+  +-----------------------------+------------+
| ...               [●Needs 1]|            |  | ...            [Nothing ...]|            |
+-----------------------------+------------+  +-----------------------------+------------+
|                             | Needs you 1 x  |                          | All clear. |
|  the office, eased smaller  | [ask card] |  |  the office                 | humor line |
|  over 240 ms (D9)           |  reply ▮   |  |                             | [answered] |
| [composer] [next] [hire]    |            |  | [composer] [next] [hire]    |            |
+-----------------------------+------------+  +-----------------------------+------------+
                                                 next click outside, Esc, or a pod: collapse
```

What the owner sees first, second, third: nothing waiting, the office then the
quiet pill; an ask arriving, the coral pill and plane, then the person's chip,
then (on click) the card with focus in its reply field.

## States

```
FEATURE           | LOADING             | EMPTY              | ERROR              | SUCCESS              | PARTIAL
------------------|---------------------|--------------------|--------------------|----------------------|---------------------
Top bar pill      | empty quiet pill,   | label "Nothing     | keeps last count   | coral "Needs you N", | n/a
                  | no text (D3)        | needs you" (D2)    | (D3)               | bumps on the plane   |
Right column      | not rendered        | not rendered (D1)  | as last shown      | board with cards     | All clear + answered
                  |                     |                    |                    | (on click or D7)     | card until click (D4)
For you chip      | hidden              | hidden             | keeps last count   | "N for you", button  | n/a
                  |                     |                    |                    | (D11)                |
Restore card      | n/a                 | hidden             | n/a                | floating card (D5)   | restoring text
Screen reader     | silent              | silent             | silent             | "{godName} needs     | n/a
                  |                     |                    |                    | you: N" (D10)        |
```

## Journey

```
STEP | OWNER DOES                       | OWNER FEELS                 | PLAN SPECIFIES
-----|----------------------------------|-----------------------------|-------------------------------
1    | Opens the app, nothing waiting   | Calm, the office is the     | Full-width office, quiet
     |                                  | whole screen                | pill (D1, D2, D3 loading)
2    | Opens the app, asks waited       | Oriented: here is what      | Column opens once at launch,
     | overnight                        | piled up                    | no focus steal (D7, D10)
3    | Working, Michael asks something  | Noticed it, not interrupted | Pill, plane, chip; nothing
     |                                  |                             | moves (D1, D10 announce)
4    | Clicks the chip or the pill      | In control: it moved        | Column eases in 240 ms, focus
     |                                  | because I clicked           | in the reply field (D9, D10, D11)
5    | Answers the last ask             | Done, and it landed         | All clear + a light line,
     |                                  |                             | answered card stays (D4, D8)
6    | Clicks the office or presses Esc | The space is back           | Column eases out (D4, D6, D9)
```

Five seconds: the office is the hero. Five minutes: asks never shove the office
around. Long term: the column means "something needs you", nothing else.

## NOT in scope

- The person panel and Michael's panel themselves: unchanged, they still open in
  the column.
- Translating the desktop notification lines in main: already tracked
  ("Translate the update surfaces" in TODOS.md).
- Directions B, C and D: explored and rejected (see the mockups).
- AI-generated image mockups: the design generator's OpenAI key was rejected
  (401); the HTML mockups replaced them at the owner's request.

## Implementation Tasks

Synthesized from the design decisions and the eng review (R1 to R5). Each task
derives from a decision; checkbox as you ship.

- [x] **T1 (P1, human: ~4h / CC: ~25min)** Shared task poller: `useNeedsYou.ts`
  owns one 5 s poll of `hiveTasks()` plus escalated schedule requests (push via
  `onScheduleRequestsUpdated`), publishes `{ status: 'unknown' | 'ready', tasks,
  requests, count }` through `useSyncExternalStore`, exposes `refresh()`, pauses
  while `document.hidden`. `TopBar`, `NeedsYouStrip`, `NeedsYouBoard`, `AskMeTab`,
  `StudioStage` (`forYouBy`, `toYou`) and `TasksKanban` subscribe and drop their
  own timers; every write calls `refresh()`.
  - Surfaced by: D3, eng R4, structure B
  - Files: `src/renderer/src/shell/useNeedsYou.ts`, `src/renderer/src/shell/TopBar.tsx`,
    `src/renderer/src/shell/NeedsYouBoard.tsx`, `src/renderer/src/components/AskMeTab.tsx`,
    `src/renderer/src/scene/studio/StudioStage.tsx`, `src/renderer/src/components/TasksKanban.tsx`
  - Verify: new `test/needs-you-poller.test.cjs` (unknown then ready; a failed poll keeps the last value; one timer for many subscribers; `refresh()` polls at once; count = open asks + escalated requests)
- [x] **T2 (P1, human: ~4h / CC: ~30min)** Right column state: replace
  `needsYouOpen` with `rightColumn: 'closed' | 'board' | 'person'` (default
  'closed'); App renders nothing, the board or the panel from it; no splitter
  when 'closed'; launch open once when the first count is above 0 (D7); All
  clear stays until an outside click, Esc or a pod (D4); the panel close and the
  column x set 'closed' (D6); Esc only with focus in the column, not
  `defaultPrevented`, no dialog open, first Esc in a filled reply field blurs (R2).
  - Surfaced by: D1, D4, D6, D7, eng R1, R2
  - Files: `src/renderer/src/store/store.ts`, `src/renderer/src/App.tsx`,
    `src/renderer/src/shell/NeedsYouBoard.tsx`, `src/renderer/src/shell/PanelChrome.tsx`
  - Verify: rewritten `test/needs-you-state.test.cjs` (R5); a pure Esc helper test (focus in or out, defaultPrevented, dialog, filled field)
- [x] **T3 (P1, human: ~1h / CC: ~10min)** The pill: a non-interactive label at
  zero, an empty quiet pill while unknown, the coral button (toggle) above zero.
  - Surfaced by: D2, D3, D6
  - Files: `src/renderer/src/shell/TopBar.tsx`
  - Verify: a pure `pillState(status, count)` test for the three renders
- [x] **T4 (P1, human: ~2h / CC: ~15min)** All clear: "All clear." plus one
  rotating humor line (new i18n keys in en, zh-CN and ar, no dashes) above the
  answered card.
  - Surfaced by: D4, D8
  - Files: `src/renderer/src/components/AskMeTab.tsx`, `src/renderer/src/i18n/locales/*.json`
  - Verify: the existing every-locale test passes; a no-dash check on the new strings
- [x] **T5 (P1, human: ~1h / CC: ~10min)** Restore card over the stage, top left
  (top right in RTL), out of the column.
  - Surfaced by: D5
  - Files: `src/renderer/src/shell/NeedsYouBoard.tsx`, `src/renderer/src/App.tsx`
  - Verify: manual run after a restart with a team to bring back; it never changes `rightColumn`
- [x] **T6 (P2, human: ~3h / CC: ~20min)** Resize motion by FLIP: apply the
  final `bleed` once, animate the scene wrapper's transform from the old scale
  and offset to identity over 240 ms ease-out, column slides with `translateX`;
  nothing under reduced motion; board and person swaps animate nothing.
  - Surfaced by: D9, eng R3
  - Files: `src/renderer/src/App.tsx`, `src/renderer/src/scene/studio/StudioStage.tsx`
  - Verify: manual run in the app, both directions, with and without reduced motion
- [x] **T7 (P1, human: ~2h / CC: ~15min)** Accessibility: polite live region
  "{godName} needs you: N" when the count rises; focus to the first reply field
  on open from the pill, chip or keyboard; back to the pill on close; no focus
  move on the launch open.
  - Surfaced by: D10
  - Files: `src/renderer/src/shell/TopBar.tsx`, `src/renderer/src/shell/NeedsYouBoard.tsx`,
    `src/renderer/src/components/AskMeTab.tsx`, `src/renderer/src/i18n/locales/*.json`
  - Verify: manual keyboard and VoiceOver pass; announcement string in every locale
- [x] **T8 (P1, human: ~2h / CC: ~15min)** For you chip as a button: opens the
  board at the newest ask among the pod's members, with hover and focus states;
  the pod body still opens the person panel.
  - Surfaced by: D11
  - Files: `src/renderer/src/scene/studio/StudioStage.tsx`, `src/renderer/src/components/AskMeTab.tsx`
  - Verify: a pure `newestAskFor(memberIds, tasks)` test
- [ ] **T9 (P2, human: ~1h / CC: ~10min)** Update DESIGN.md 5.2, 7.5, 7.6, 7.15
  and 7.24 to match, refresh `branding/reference/studio/home-light.png` and
  `home-dark.png`, and note it in docs/FEATURES.md. Done except the two reference
  screens, which need the app running.
  - Surfaced by: design Pass 5
  - Files: `branding/DESIGN.md`, `branding/reference/studio/`, `docs/FEATURES.md`
  - Verify: the doc's right column rows describe the collapsed state
- [x] **T10 (P1, human: ~1h / CC: ~10min)** Regression contract: rewrite
  `test/needs-you-state.test.cjs` on `rightColumn` keeping every preserved
  check; update `test/michael-tabs.test.cjs:33-34` and the anchor at
  `test/studio-home.test.cjs:289`.
  - Surfaced by: eng R5
  - Files: `test/needs-you-state.test.cjs`, `test/michael-tabs.test.cjs`, `test/studio-home.test.cjs`
  - Verify: `node --test test/*.test.cjs` green

Order: T1 first (everything reads it), then T2 with T10, then T3, T4, T5, T7,
T8 in any order, then T6, then T9. Sequential implementation, no
parallelization opportunity: T1 and T2 touch the shared shell files every
other task depends on.

## Eng review (2026-10-02)

Target: docs/designs/needs-you-empty-state.md (this file), reviewed with
`/plan-eng-review`.

### Scope record

feature answers: none proposed (D1 to D11 kept whole); structure: B, smaller
arrangement (owner answer to eng D1, 2026-10-02); accepted scope: the shared
Needs you count lives in `src/renderer/src/shell/useNeedsYou.ts` as one
module-level poller (`useSyncExternalStore`, states unknown, 0 and n) that every
caller subscribes to; `src/renderer/src/store/store.ts` gains only the right
column's state; every other file as listed in the design tasks; pending
remedies: all Section 1 to 4 findings. Scope Challenge result: scope accepted
as-is.

## Decision ledger

### R1: how the store represents the right column
Finding: 1, P1, confidence 9/10, `src/renderer/src/store/store.ts:775` (`if (god) return god.id;`), `store.ts:891`, `App.tsx:412`; reviewer: Claude (eng review)
Plan baseline: D1 "not rendered while nothing waits and no person or Michael is selected"; no state model approved
Runtime evidence: `selectedId` is set to Michael at every launch and never cleared; the column today is `needsYouOpen || !agent`, so it is never empty
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 column state | `needsYouOpen: boolean`, default true | one field `rightColumn: 'closed' or 'board' or 'person'`, default 'closed'; `select` sets 'person', pill and chip set 'board', close sets 'closed'; `needsYouOpen` removed and its callers migrated | keep `needsYouOpen`, add `columnOpen: boolean`; four combinations, one meaningless (closed but board) |
| D1 to D11 behavior | approved | unchanged | unchanged |
| R2 Esc scope, R3 resize mechanism | pending | pending | pending |
Question D2:
D2 — How should the store say what the right column shows? <gstack-qid:plan-eng-review-column-state>
Project/branch/task: main; needs-you-empty-state.md, eng review Section 1.
ELI10: Today the app always has someone selected (Michael at launch), and the column shows either the board or that person. Collapsing needs a third answer, "nothing". We can model the column as one field with three values, or bolt a second on/off switch onto the old one.
Stakes if we pick wrong: two switches can disagree (closed but showing the board), which is how a column ends up stuck open or blank.
Recommendation: A because one field with three values cannot hold an impossible state, and every caller says exactly what it wants.
Completeness: A=9/10, B=6/10
Pros / cons:
A) One rightColumn field: closed, board or person (recommended)
  ✅ Impossible states can't exist, so the column is never stuck between closed and board
  ✅ Each action names its target: select goes to person, the pill to board, close to closed
  ❌ Migrates every needsYouOpen caller and the existing store test (human: ~2h / CC: ~15 min)
B) Keep needsYouOpen and add a columnOpen switch
  ✅ Fewer callers change, since existing needsYouOpen reads keep working as they are
  ❌ Four combinations where one is meaningless, so every reader must guard against it
Net: a small migration buys a state that cannot contradict itself.
Header: Column state
Options:
A) One field (recommended)
`rightColumn: 'closed' | 'board' | 'person'`, default 'closed'; select sets 'person', pill and chip set 'board', the x and Esc set 'closed'; needsYouOpen removed, callers and test migrated.
B) Add columnOpen
Keep `needsYouOpen`, add `columnOpen: boolean`; readers guard the closed-but-board combination.

State: approved
Actual answer: A, one field (owner answer to eng D2, 2026-10-02)
Accepted scope: replace `needsYouOpen` with `rightColumn: 'closed' | 'board' | 'person'`, default 'closed'; `select`, `openAgentMemory` and non-'human' `requestCommandCenterTab` set 'person'; the pill, the for you chip, `requestCommandCenterTab('human')` and the D7 launch open set 'board'; the column x, the person panel close, Esc (scope per R2) and the D4 outside click set 'closed'; migrate every `needsYouOpen` reader and `test/needs-you-state.test.cjs`.
History: none

### R2: where Esc closes the column
Finding: 2, P2, confidence 8/10, existing Esc handlers `src/renderer/src/shell/TopBar.tsx:149` (`if (e.key === 'Escape') setOpen(false);`), `src/renderer/src/shell/PanelChrome.tsx:81` (`if (e.key === 'Escape') { setEditing(false); }`), `useDialog.ts`, `InfoTip.tsx`, `WhatsNewPopover.tsx`; reviewer: Claude (eng review)
Plan baseline: D6 "Esc closes the column"; scope of the key listener not approved
Runtime evidence: each existing handler listens on window or on its own element; none checks `defaultPrevented`
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R2 Esc scope | no column Esc | Esc closes the column only when focus is inside the column, the event was not already handled (`defaultPrevented`), and no dialog is open; Esc in a reply field with text first blurs the field, a second Esc closes | a window keydown: any Esc closes the column, whatever else is open |
| R1 column state | approved A | unchanged | unchanged |
| R3 resize mechanism | pending | pending | pending |
Question D3:
D3 — When should Esc close the Needs you column? <gstack-qid:plan-eng-review-esc-scope>
Project/branch/task: main; needs-you-empty-state.md, eng review Section 1.
ELI10: Esc already closes the clock menu, info tips, dialogs and an edit box. If Esc also closes the column from anywhere, one press can close two things, or wipe the column while you're half way through typing a reply.
Stakes if we pick wrong: pressing Esc to close a tooltip also hides the asks, or a half-written answer disappears from view.
Recommendation: A because Esc should act on the thing you're in, which is how every other Esc in the app already behaves.
Completeness: A=9/10, B=5/10
Pros / cons:
A) Only when focus is in the column and nothing else took the Esc (recommended)
  ✅ One Esc closes one thing, matching the clock menu, dialogs and info tips
  ✅ A half-written reply is safe: the first Esc leaves the field, a second one closes
  ❌ Esc does nothing when focus is on the office, so mouse users rely on the x or the pill
B) Any Esc anywhere closes the column
  ✅ The simplest rule to build, with a single listener on the window
  ❌ Collides with every other Esc in the app and can hide a reply you're writing
Net: Esc that respects what you're doing, versus one global shortcut.
Header: Esc scope
Options:
A) Focus in column (recommended)
Esc closes only when focus is inside the column, the event is not defaultPrevented and no dialog is open; in a reply field with text the first Esc blurs, the second closes.
B) Any Esc
A window keydown listener closes the column on every Esc.

State: approved
Actual answer: A, focus in column (owner answer to eng D3, 2026-10-02)
Accepted scope: a keydown handler on the column element sets `rightColumn` to 'closed' on Esc only when the event is not `defaultPrevented` and no dialog is open; in a reply field holding text the first Esc blurs the field (focus moves to the column heading) and a second Esc closes. Esc with focus outside the column does nothing to it.
History: none

### R3: how the office eases to its new size (D9)
Finding: 3, P2, confidence 8/10, `src/renderer/src/scene/studio/StudioStage.tsx:190` (`const fitW = Math.max(200, box.w - bleed);`) and `:195` (`const k = Math.min(fitW / STAGE_W, ...`), host `right: -bleed` at `:367`; reviewer: Claude (eng review)
Plan baseline: D9, 240 ms ease-out of column width and `bleed`, snap under reduced motion; "if not, animate the scene's scale transform and re-fit once at the end"
Runtime evidence: the host's width is the stage plus `bleed`, which stays the window width open or closed, so the ResizeObserver does not fire; only the `bleed` prop changes the layout, and each change re-renders the whole stage (every pod, card and avatar)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R3 mechanism | no animation | FLIP: apply the final `bleed` once, then animate a transform on the scene's inner wrapper from its old scale and offset to identity over 240 ms ease-out; the column slides with `translateX`; no per-frame React renders | step `bleed` in React state every animation frame for 240 ms (about 15 stage renders) and measure frame rate |
| D9 visible behavior | approved | unchanged | unchanged |
| R1, R2 | approved A, A | unchanged | unchanged |
Question D4:
D4 — How should the office ease to its new size when the column opens or closes? <gstack-qid:plan-eng-review-resize-mechanism>
Project/branch/task: main; needs-you-empty-state.md, eng review Section 1.
ELI10: You approved a quarter-second ease (D9). The office scene recomputes every desk and card each time its size changes, so animating the size directly means redrawing the whole office about 15 times in that quarter second. The alternative computes the final layout once and slides a picture of the change with the graphics card.
Stakes if we pick wrong: a stuttering animation on slower Macs every time an ask is opened.
Recommendation: A because it draws the office once and lets the graphics card do the motion, the standard way to animate a layout change.
Completeness: A=9/10, B=6/10
Pros / cons:
A) Lay out once, animate a transform (recommended)
  ✅ One stage render per open or close, so the ease stays smooth on any Mac
  ✅ Reduced motion is trivial: skip the transform and the new layout simply appears
  ❌ Needs a measured old and new position, a few lines of animation code (human: ~3h / CC: ~20 min)
B) Re-render the stage every frame and measure
  ✅ No extra animation code; the stage's own layout does the work
  ❌ About 15 full office renders per toggle, likely to stutter on older hardware
Net: a small piece of animation code buys a smooth ease everywhere.
Header: Resize motion
Options:
A) Transform, lay out once (recommended)
Set the final bleed once, animate the scene wrapper's transform from its previous scale and offset to identity over 240 ms ease-out; column slides with translateX; reduced motion skips the transform.
B) Per-frame re-render
Step bleed in state each animation frame for 240 ms and check frame rate.

State: approved
Actual answer: A, transform, lay out once (owner answer to eng D4, 2026-10-02)
Accepted scope: on a `rightColumn` change between 'closed' and open, measure the scene wrapper's scale and offset, apply the final `bleed` in one render, then animate the wrapper's `transform` from the old geometry to identity over 240 ms ease-out (FLIP); the column slides in or out with `translateX` over the same 240 ms; under `prefers-reduced-motion` no transform runs. Switching between 'board' and 'person' changes no width and animates nothing.
History: none

### R4: which task readers use the shared poller
Finding: 4, P2, confidence 9/10, independent 5 s polls of `window.cth.hiveTasks()`: `useNeedsYou.ts` (4 callers: `TopBar.tsx:226`, `TopBar.tsx:271`, `NeedsYouBoard.tsx:20`, `StudioStage.tsx:166`), `StudioStage.tsx:60`, `AskMeTab.tsx:77`, `TasksKanban.tsx:146`; reviewer: Claude (eng review)
Plan baseline: D3 one count read by the pill, board, strip and pod chips; structure B puts the poller in `useNeedsYou.ts`. That already covers `useNeedsYou`'s callers, `AskMeTab` (the board) and `StudioStage`'s `forYouBy` (the chips), so the poller publishes parsed tasks plus schedule requests, not only a number
Runtime evidence: seven timers read the same `tasks.json` every 5 s; each keeps its own copy, so for up to 5 s they disagree
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R4 TasksKanban | own 5 s poll (`TasksKanban.tsx:146`) | also reads the shared poller; its edits call the shared `refresh()` | keeps its own poll |
| Needs you readers (pill, strip, board, chips) | separate polls | shared (approved D3, structure B) | shared (approved D3, structure B) |
| R1 to R3 | approved | unchanged | unchanged |
Question D5:
D5 — Should the Tasks view read the same shared task poll? <gstack-qid:plan-eng-review-tasks-poller>
Project/branch/task: main; needs-you-empty-state.md, eng review Section 2.
ELI10: Seven timers read the same task file every 5 seconds. Your earlier choices already merge the Needs you ones into one shared reader. The Tasks view's blocked cards are the same questions, read by a separate timer, so it can lag the pill by a few seconds.
Stakes if we pick wrong: the Tasks view shows a question as still blocked after you answered it on the board, or the reverse.
Recommendation: A because the Tasks view and the pill then always match, and it removes one more timer for a few lines.
Completeness: A=9/10, B=7/10
Pros / cons:
A) Tasks view reads the shared poller too (recommended)
  ✅ The Tasks view, the pill and the board always show the same questions at the same moment
  ✅ One less timer reading the same file every 5 seconds, so less background work
  ❌ Touches TasksKanban.tsx, one more file in this change (human: ~1h / CC: ~10 min)
B) Leave the Tasks view on its own timer
  ✅ No change to the Tasks view, keeping this change smaller
  ❌ Its blocked cards can disagree with the pill for up to 5 seconds
Net: one more file buys every view telling the same truth.
Header: Tasks poll
Options:
A) Share it (recommended)
TasksKanban subscribes to the shared poller in useNeedsYou.ts; its edits call the shared refresh().
B) Leave it
TasksKanban keeps its own 5 s poll.

State: approved
Actual answer: A, share it (owner answer to eng D5, 2026-10-02)
Accepted scope: `useNeedsYou.ts` owns one 5 s poll of `hiveTasks()` and the schedule requests (`onScheduleRequestsUpdated` kept as a push trigger), publishes `{ status: 'unknown' | 'ready', tasks, requests, count }` through `useSyncExternalStore`, and exposes `refresh()`; `TopBar`, `NeedsYouStrip`, `NeedsYouBoard`, `AskMeTab`, `StudioStage` (`forYouBy`, `toYou`) and `TasksKanban` subscribe; their own timers are removed; any write (an answer, a Tasks edit) calls `refresh()`. The poll pauses while `document.hidden`, as today. The one-off read at `StudioStage.tsx:614` stays.
History: none

### R5: regression contract for the right column store test
Finding: 5, CRITICAL regression, confidence 9/10, `test/needs-you-state.test.cjs` asserts `atLaunch === true` and the board/person transitions of `select`, `requestCommandCenterTab` and `openAgentMemory`; R1 replaces `needsYouOpen`; reviewer: Claude (eng review)
Plan baseline: R1 accepted scope; D6, D7
Runtime evidence: the test runs the real store through `load-ts.cjs`
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R5 regression contract | asserts `needsYouOpen` | rewrite the same test on `rightColumn`. Preserved: `select` shows the person; `requestCommandCenterTab('human')` shows the board and bumps no tab; any other tab shows the person with its `ccTabRequest`; `openAgentMemory` shows Michael's panel with its focus request; focus mode stays shut. Intended changes: launch is 'closed'; the panel close and column x give 'closed', not the board. Added: the launch open sets 'board' once and never again in that launch | delete the old test, write new tests only for the new states |
| R1 to R4 | approved | unchanged | unchanged |
Question D6:
D6 — How do we protect today's column behavior while changing it? <gstack-qid:plan-eng-review-regression-contract>
Project/branch/task: main; needs-you-empty-state.md, eng review Section 3.
ELI10: A test today checks that picking a person, opening Ask me or following a memory link shows the right thing in the column. The new column state replaces the field that test reads, so we must say which of those behaviors stay exactly as they are and which change on purpose.
Stakes if we pick wrong: a link from Michael's memory or the old Ask me request quietly stops opening the right panel, and nothing catches it.
Recommendation: A because it keeps every check that still holds and spells out the two intended changes, so a real break still fails the test.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Rewrite the same test on the new field, keep every preserved check (recommended)
  ✅ Every behavior that should survive is still checked, line for line
  ✅ The two intended changes (closed at launch, close goes to closed) are written down as assertions
  ❌ The old test changes shape, so reviewers must read the diff carefully (human: ~1h / CC: ~10 min)
B) Delete it and test only the new states
  ✅ A clean slate that matches the new model exactly
  ❌ The memory link, Ask me request and tab checks are lost unless someone remembers to re-add them
Net: carrying the old checks forward is what keeps today's links working.
Header: Regression
Options:
A) Rewrite, keep checks (recommended)
Same test on rightColumn: select shows the person; 'human' shows the board with no tab bump; other tabs show the person with ccTabRequest; openAgentMemory shows Michael with its focus request; focus mode stays shut. Intended: launch 'closed'; close gives 'closed'. Added: launch open sets 'board' once.
B) Replace with new tests
Delete the old test and write new state tests from scratch.

State: approved
Actual answer: A, rewrite, keep checks (owner answer to eng D6, 2026-10-02)
Accepted scope: rewrite `test/needs-you-state.test.cjs` on `rightColumn` with every preserved assertion listed in column A, the two intended changes as explicit assertions, and the launch open setting 'board' once per launch; update the source-pinned lines that read the old field (`test/michael-tabs.test.cjs:33-34`, the slice anchor at `test/studio-home.test.cjs:289`) so they pin the new structure instead.
History: none

Approval readiness: PASS. R1 (eng D2: A), R2 (eng D3: A), R3 (eng D4: A),
R4 (eng D5: A), R5 (eng D6: A), structure (eng D1: B); design decisions D1 to
D11 from the design review answers.

## Eng review findings

### Scope Challenge
No issues found beyond the structure question (eng D1: B, smaller arrangement).
Scope accepted as-is.

### 1. Architecture
- [P1] (confidence: 9/10) `store.ts:775` `if (god) return god.id;`: no "nothing
  selected" state exists, so the collapsed column needs its own state. Accepted
  (R1).
- [P2] (confidence: 8/10) `TopBar.tsx:149`, `PanelChrome.tsx:81`: existing Esc
  handlers would collide with a global column Esc. Accepted (R2).
- [P2] (confidence: 8/10) `StudioStage.tsx:190-198`: animating `bleed` in state
  re-renders the whole stage per frame. Accepted (R3, FLIP).

Dispositions: 1 accepted (D2: A), 2 accepted (D3: A), 3 accepted (D4: A).

```
Right column state (R1)
                  pill / chip / Ask me request / launch open (D7, once)
   +--------+  ----------------------------------------------->  +-------+
   | closed |                                                    | board |
   +--------+  <-----------------------------------------------  +-------+
      ^   ^      x, pill again, Esc in column (R2), or after       |   ^
      |   |      All clear an outside click (D4)                   |   |
      |   |                                                select  |   | pill, chip
      |   |   panel close (x)        +--------+  <-----------------+   |
      |   +------------------------- | person |  ----------------------+
      |                              +--------+
      +-- launch default        select / memory link / tab request from any state

Data (R4): useNeedsYou.ts poller (5 s, paused when hidden, refresh() on write)
  -> { status, tasks, requests, count }
  -> TopBar pill, NeedsYouStrip, NeedsYouBoard/AskMeTab, StudioStage chips, TasksKanban
```

### 2. Code quality
- [P2] (confidence: 9/10) seven separate 5 s polls of `hiveTasks()`
  (`useNeedsYou.ts` callers, `StudioStage.tsx:60`, `AskMeTab.tsx:77`,
  `TasksKanban.tsx:146`). Accepted (R4): one shared poller, 7 timers become 1.
  Shared-code evidence: callers verified at the lines above; removed about 40
  to 60 lines of duplicate poll and parse code, added about 50 to 70 for the
  poller and its test, net roughly even in lines, gained one consistent
  snapshot.
- Recorded, no new choice: `refresh()` after every write keeps D4's All clear
  immediate; an unknown count after a failed first poll stays blank (D3); a
  multi-person pod's chip opens the newest ask among its members (D11).

Dispositions: 4 accepted (D5: A).

### 3. Tests

```
CODE PATHS                                          USER FLOWS
[+] useNeedsYou.ts poller (new)                     [+] Nothing waits
  |-- [GAP] unknown -> ready                          |-- [GAP] launch: full office, quiet label
  |-- [GAP] failed poll keeps last value              [+] An ask arrives
  |-- [GAP] one timer for many subscribers            |-- [GAP] [->E2E] pill, plane, chip; no layout change
  |-- [GAP] refresh() polls at once                   [+] Open, answer, collapse
  |-- [GAP] count = asks + escalated requests         |-- [GAP] [->E2E] pill -> reply -> All clear -> click office
[+] store rightColumn (R1)                          [+] Keyboard
  |-- [** TESTED] select / Ask me / tabs / memory     |-- [GAP] Esc in column vs in a menu (R2)
  |     needs-you-state.test.cjs (old field)          |-- [GAP] focus to reply field, back to pill (D10)
  |-- [GAP] launch closed, launch open once (D7)    [+] Edge
  |-- [GAP] close -> closed (D6)                       |-- [GAP] first poll fails: blank pill
[+] pillState / escAction / newestAskFor (pure)       |-- [GAP] reduced motion: no animation
  |-- [GAP] each branch                               |-- [GAP] RTL, 1280 x 800, dark
[+] FLIP resize (R3)
  |-- [GAP] manual only (visual)

COVERAGE: 1/17 paths tested today | all GAPs get a test in T1 to T4, T8, T10 or the QA plan
```

Regression (CRITICAL, accepted R5): the store test is rewritten on
`rightColumn` with every preserved check. Tests made obsolete: the regex pins at
`test/michael-tabs.test.cjs:33-34` (replaced by the store behavior test).

Dispositions: 5 accepted (D6: A).

### 4. Performance
No issues found. The change lowers background work: 7 timers reading
`tasks.json` every 5 s become 1, and the resize runs one stage render per
toggle (R3). Scale: one IPC read per 5 s, tasks.json size unchanged.

### Failure modes
| Path | Realistic failure | Covered by | Owner sees |
|---|---|---|---|
| Shared poller | `hiveTasks()` rejects (office folder gone) | poller test; D3 | blank pill, retried every 5 s; the folder-missing screen already handles a missing office |
| Launch open (D7) | first count arrives after the owner clicked a pod | store test: launch open only while still 'closed' | the person panel stays |
| FLIP resize | transform left applied after an interrupted toggle | manual QA; a new toggle resets the transform | a mis-scaled office until the next toggle (visible, not silent) |
| Esc (R2) | Esc swallowed by the column while a menu is open | escAction test | the menu closes, the column stays |
| For you chip | chip points at an ask answered a second ago | `refresh()` on write | the board opens on the next ask, or All clear |

Critical gaps: none.

### Outside voice
Skipped: the owner's standing rule keeps Codex to the adversarial pass, and the
native fallback needs a background task tool this session does not have. No
outside coverage.

### TODOS.md
No TODO proposals: nothing was deferred.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 for this plan | not run | |
| Outside Review | Codex plan review | Independent 2nd opinion | 1 | skipped (owner rule) | |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (all mapped to tasks) | 5 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 2/10 → 8/10, 11 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | |

Earlier log entries for CEO, Eng and Design reviews (commit d0a17d16) belong to
the Claude connectors plan, not this document.

- **OUTSIDE COVERAGE:** design phase, Claude subagent (in-host) completed, no
  external provider; plan-review phase, Codex skipped by the owner's rule,
  native fallback unavailable. No external coverage.
- **VERDICT:** DESIGN CLEARED. Eng review complete with all 5 findings accepted
  and mapped to T1 to T10; ready to implement.

NO UNRESOLVED DECISIONS
