# The conversation opens on your latest question

Status: built 2026-10-31, on the design below.

## Request (owner, 2026-10-31)

"when user ask a question to michael and if there is an old coversations, it confuses the user
with so much of text above his question and takes time to figure out where is his question"

Screenshot: the wide 1:1. The new question sits low on the screen under a long status update,
and every bubble has the same weight, so nothing says where the owner should look.

## Why it happens

Send already navigates to the new question (`sendToMichael` calls `setDock(true, res.id)`), and
`useDockScroll` centers it, clamped to the bottom of the list. So the question lands low, with
the last 30 days above it (`visibleItems`, `RECENT_MS`). Owner request: send, the arrow and a
notification all show the same long list.

## Decisions

| # | Decision | By |
|---|---|---|
| D1 | Older messages fold away, rather than moving the question to the top or tinting it | Owner |
| D2 | Always: every open, after a send, from the arrow and from a notification | Owner |
| 3 | The rule below replaces the 30 day rule; there is one fold and one link | Review |
| 4 | Nothing folds while the owner is looking at it | Review |
| 5 | Show earlier reveals everything; the fold returns on close or send | Review |
| 6 | When the exchange is taller than the list, the latest question goes to the top, not the middle | Review |

Items 3 to 6 are small choices taken under the owner's plan review rule (2026-10-27).

## The rule

The conversation shows, each with its replies:

1. The owner's latest question.
2. Every open question, as today (never hide work still in flight).
3. Every question with an unread reply when this opening began.

Everything else sits behind one link. Replies stay with their question, as `visibleItems` does.

```
+--------------------------------------+
| Michael   1 open                 ✕   |
+--------------------------------------+
|          Show 6 earlier              |  quiet link, top center
|               Today                  |  day divider of the first row shown
|          [ your latest question ]    |
|          ● Waiting on Pam, 1:30 AM   |
| [ Michael's reply                  ] |
|                                      |
|                                      |
| [ Talk to Michael...         Send  ] |
+--------------------------------------+
```

First the question, then the reply, then the link for anyone who wants more.

## Nothing folds under the owner

Two traps, both from reading the code:

- `ownerRead` marks a reply read as soon as the dock is open, so a rule based on unread alone
  would hide the question a moment after showing it.
- A question that gets answered stops being open, so an open rule alone would fold it the moment
  the answer lands.

So the set of shown questions is worked out when the dock opens and when the owner sends, and
during an opening it only grows. Replies and new questions arrive normally.

## States

| Moment | What the owner sees |
|---|---|
| First conversation, no messages | Today's empty state and example chips, no link |
| One exchange only | No link: nothing is hidden |
| Just sent | The new question and any open ones, status under it, Michael's reply fills in below |
| Send fails | Nothing moves; "Not sent" as today, the draft stays |
| Reply arrives, fits | Appears under the question; the list follows |
| Reply taller than the list | The question stays at the top; reply runs below; More as today |
| More replies below the fold | The existing "N new replies" button in the reserved footer |
| Two questions sent in a row | Both show: the first is still open |
| Show earlier clicked | Everything above appears, the passage stays still, focus goes to the message box because the link is gone |
| New message after Show earlier | The fold returns on send |
| Dock closed and reopened | The fold returns; it starts on the latest question, and follows new replies if the exchange fits |
| Notification for a folded question | Everything is revealed and that question is shown, as today |
| Long list, several open questions | All show; the latest goes to the top if they overflow |
| Move between the bar and the center | Keeps the reading place, as today |

## The owner's journey

| Step | Owner does | Owner feels | Design supports it with |
|---|---|---|---|
| 1 | Sends a question | Did it go? | Their words on screen with a status under them |
| 2 | Looks at the conversation | Finds it at once | Nothing older in view |
| 3 | Waits | Calm | A status line, no wall of old text to reread |
| 4 | Reads the reply | Clear | It sits right under the question |
| 5 | Wants yesterday's answer | One click | Show earlier at the top |
| 6 | Comes back tomorrow | Knows where to look | The same view every time |

## Design system

No new component or token. The link is the existing `quietBtn`. The word changes from "Earlier"
to "Show {{count}} earlier", with plurals in English, Chinese and Arabic, where the count is
hidden messages (`dock.items.length - items.length`). No dashes in the copy.

## Responsive and accessibility

- Side dock (400 by up to 430 px) and wide 1:1 (720 px of text) use the same rule. Under 280 px
  tall, 19A already scrolls to the latest request and reply.
- The link is a real button in tab order with the §12 focus ring and the normal 28 px target.
- Its position mirrors in Arabic through the centered layout.
- The live region is unchanged. Folding announces nothing.

## What already exists

| Need | Reuse | Where |
|---|---|---|
| Fold with replies kept with their question | `visibleItems` | `src/renderer/src/shell/MichaelDock.tsx` |
| Reveal a folded target | The layout effect that sets `showEarlier` | `MichaelDock.tsx` |
| Link, count of hidden rows | `hasEarlier`, `quietBtn` | `MichaelDock.tsx` |
| Keep the passage when rows appear | `restore`, `useDockScroll` | `src/renderer/src/shell/useDockScroll.ts` |
| Land on a new row that is not there yet | `pendingFocus` | `useDockScroll.ts` |
| Catch up control | Reserved footer | `MichaelDock.tsx` |
| Real geometry tests | `test/dock-scroll.electron.test.cjs` | `test/fixtures/dock-scroll*` |

## NOT in scope

- Moving the question to the top with blank space under it (D1 option A, not chosen).
- A tint on the owner's bubble (D1 option C, not chosen).
- Summaries of folded messages.
- Search in the conversation.
- Agents: no agent or orchestration behavior changes. Michael sees the same messages.

## Limit

Looking back at yesterday's answer takes one click (the cost of D2, accepted). A question quoted
from a reply is always in view, as replies stay with their question.

## Implementation Tasks

- [x] **T1 (P1, human: ~2h / CC: ~15min)** MichaelDock: replace the 30 day rule with the rule above
  - Surfaced by: D1, D2
  - Files: `src/renderer/src/shell/dockFold.ts`, `src/renderer/src/shell/MichaelDock.tsx`
  - Verify: `test/dock-fold.test.cjs`, `test/dock-scroll.electron.test.cjs`
- [x] **T2 (P1, human: ~2h / CC: ~15min)** MichaelDock: work out the shown set at open and send, grow it only during an opening
  - Surfaced by: Nothing folds under the owner
  - Files: `src/renderer/src/shell/MichaelDock.tsx`, `src/renderer/src/shell/BottomBar.tsx`
  - Verify: a reply read or answered during an opening stays on screen
- [x] **T3 (P1, human: ~1h / CC: ~10min)** useDockScroll: place a navigated question at the top when the list overflows, keep center for a quoted question
  - Surfaced by: Decision 6
  - Files: `src/renderer/src/shell/useDockScroll.ts`
  - Verify: Chromium geometry with a reply taller than the list, in both dock widths
- [x] **T4 (P2, human: ~30min / CC: ~5min)** Show earlier: new words in three locales, focus to the message box, fold returns on close and send
  - Surfaced by: States, Accessibility
  - Files: `MichaelDock.tsx`, `BottomBar.tsx`, `src/renderer/src/i18n/locales/`
  - Verify: `test/michael-replies.test.cjs` locale keys, Shift+Tab and Space in the Electron test
- [x] **T5 (P2, human: ~30min / CC: ~5min)** Update `docs/designs/michael-replies.md` (22A), `docs/designs/keep-conversation-position.md` and `branding/DESIGN.md`
  - Surfaced by: Design system
  - Files: those three
  - Verify: read through

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | branding/DESIGN.md found, UI scope: dock    |
  | Step 0               | 3/10, all passes                            |
  | Pass 1  (Info Arch)  | 3/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 3/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 5/10 → 9/10 after fixes                     |
  | Pass 4  (AI Slop)    | 9/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 6/10 → 9/10 after fixes                     |
  | Pass 7  (Decisions)  | 2 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 3 HTML/CSS shown inline, B chosen           |
  | Decisions made       | 2 owner, 4 small under the owner's rule     |
  | Decisions deferred   | 0                                           |
  | Overall design score | 3/10 → 9/10                                 |
  +====================================================================+
```

Outside design voices did not run for this small review.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 9/10, 2 decisions |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | none for this plan |

- **OUTSIDE COVERAGE:** skipped; no outside provider reviewed this plan.
- **VERDICT:** Design Review CLEAR. Eng review required by the dashboard for shipping; none has covered this plan.

NO UNRESOLVED DECISIONS
