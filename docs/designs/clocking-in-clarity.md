# Clocking in: clear and calm

Status: CEO reviewed and built 2026-10-30. Not yet tried on a real launch.

## Request (owner, 2026-10-30)

1. "while clocking in is not finished, disable interactions such as clicking offices or
   interacting with the 'Ask me'."
2. "make it more information as with many agents or some agent taking more time, owner has no clue
   if it is frozen or something actually happening behind the scene"

Screenshot: "Clocking in, 1 of 12 in, Still coming: Oscar, Pam, Toby and 8 more."

## Step 0 evidence

### 0A. Premise

The real problem is not only that the card says too little. **The count is measuring the wrong
thing.** A member counts as in only once their desk stops saying "clocking in…", and that happens
on a first tool call, a finished turn, or an idle notice (`useHive.ts:760-817`). Starting does not
clear it. A member with no work waiting therefore reads as still coming while running normally.

| Premise | Receipt | Verdict |
|---|---|---|
| All 12 Claude processes start within 3 s | `ps lstart` on the 08:26 launch: 08:26:13 to 08:26:16 | measured |
| Only Michael did any work in the first 10 min | `telemetry_events` since 08:26:04: prompt, tool and stop rows for `god` only | measured |
| Michael reached his first prompt 4 s after his process started | process 08:26:13, first prompt +13 s from 08:26:04 | measured |
| Starting does not clear the marker | `useHive.ts:741` reads SessionStart but sets no action | read in code |
| The floor stays clickable by design | `OpeningCard.tsx:9`, `branding/DESIGN.md` 7.24 (review 2026-10-18) | read in code |
| A Restore team reopens the opening mid-day | `useRestoreTeam.ts:81` | read in code |
| Waiting on a restore has no time limit | `clockingIn.ts:55` `input.restoring` | read in code |
| Members reach 60 s and show amber, or clear by idle notice | not observed; needs one launch to confirm | unverified=1 |

Do nothing: every launch looks stuck for up to a minute with healthy members, and any lock added
would hold the owner for that same false minute.

### 0B. What already exists

- `TeamClockingIn`, `OpeningCard`, `nextOpening`, `stillOut`, `namesShown`: the whole opening.
- `onHiveHookEvent` already receives SessionStart per member (`useHive.ts:741`).
- `listPtys` already reports `hasOutput` per terminal, for engines with no hooks (`App.tsx:306`).
- `stopped` store (added 2026-10-30) already says who ended.
- HTML `inert` blocks clicks, focus and screen readers with no per button code.

### 0C. Dream state

```
CURRENT                         THIS PLAN                          12-MONTH IDEAL
"1 of 12 in" for up to a   -->  Count means started; card    -->   Opening is a few seconds,
minute with everyone fine       names who is slow and why;         and any delay says what
                                floor waits, then opens            to do about it
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| R1 owner | What "in" means; premise table | First tool call, finished turn or idle notice | Engine reported it started (SessionStart, or first output on engines with no hooks) | approved | Owner, D1, 2026-10-30: A. 60 s cap kept. |

| R2 owner | What the lock covers; `App.tsx:371` inert precedent, `App.tsx:603` column | Everything clickable | Floor and right column wait; top bar, Settings and the message box stay usable; the card stays outside the locked part | approved | Owner, D3, 2026-10-30: A |
| R3 owner | The lock never traps; `clockingIn.ts:55` restore wait has no limit | No lock | Lifts when the opening ends, Michael stops, or 70 s after it began, whichever comes first; a lift by the limit is logged and the card keeps showing who is out | approved | Owner, D4, 2026-10-30: A |
| R4 owner | What the card says; `useHive.ts:935` last output per terminal | Count, bar, three names | Ticking time, slowest member by name, "The floor opens when everyone's in." After 30 s: taking longer than usual, or gone quiet. Ask me shows the same waiting note | approved | Owner, D5, 2026-10-30: A, with the previewed wording |
| R5 owner | Mid-day Restore team; `useRestoreTeam.ts:81` | Reopens the opening | The lock happens once per launch; a later restore shows the card and locks nothing | approved | Owner, D6, 2026-10-30: A |

Approval readiness: PASS. R1 D1, R2 D3, R3 D4, R4 D5, R5 D6. Each row applied only within its answer.

Mode: HOLD SCOPE (owner, D2, 2026-10-30).

## Design

### Architecture

```
main                         renderer
pty.ts lastOutputAt ──listPtys──► TeamClockingIn ──► OpeningCard (outside the lock)
hooks SessionStart ──hook event─► useHive ──action cleared──► agents store
                                     │
                     opening + launchLock in store
                                     │
                         App.tsx  ──inert──► StudioStage wrapper
                                  ──inert──► right column
                                  ──note───► NeedsYouBoard
```

No new main process code, IPC or stored setting.

### Lock state

```
launch ──► LOCKED ──opening ends────────────────► FREE (rest of this launch)
              ├────Michael stopped───────────────► FREE
              └────70 s from first shown (logged)► FREE
FREE ──Restore team pressed──► card shows, stays FREE
```

- `launchLock` in the store starts on and only ever turns off, so it cannot come back mid-day.
- A page reload starts the store again: the lock returns and ends at the opening's 4 s settle
  once running terminals clear their marker (`App.tsx:306`).

### What "in" means now

| Signal | Rule |
|---|---|
| SessionStart with source startup or resume | Clears the marker for that member (`useHive.ts:741`) |
| First output on an engine with no hooks | Clears the marker, from the same `listPtys` read |
| A tool call, finished turn or idle notice | Clears it, as today |
| 60 s cap | Stays as the backstop |

Clear only when the action is still the marker, so nothing overwrites real work. A hire or Research
started mid-day gets the same rule, so their desk also lights sooner.

### Card

```
● Clocking in            5 of 12 in
▓▓▓▓▓░░░░░░░░░░░
Still coming: Oscar, Pam, Toby and 4 more
18 seconds so far. Toby is the slowest.
The floor opens when everyone's in.
```

- From 30 s: "34 seconds so far. Toby is taking longer than usual." or, when Toby's terminal has
  printed nothing for 15 s, "34 seconds so far. Toby has gone quiet."
- The slowest is the member first seen longest ago, in roster order on a tie.
- A stopped member stays out of the wait, as today.
- The clock and the limit run from when the card first shows, not from `opening.since`, which is set
  when the app loads and can be minutes old after first time setup.
- A mid-day restore shows the same card without the "floor opens" line.
- `say` stays one line per state: the clock is never read aloud.
- The Ask me board shows "Your answers open when everyone's in." while locked.

## Error and rescue registry

| Codepath | What can go wrong | Rescue | Owner sees |
|---|---|---|---|
| Restore run hangs | `restoring` never ends | 70 s limit, logged | Floor opens; card keeps the names |
| Michael stuck starting with no team | Opening waits on `michaelStarting` | 70 s limit, logged | Floor opens |
| Michael exits | `stopped` entry | Lock lifts at once | The Michael stopped card with its buttons |
| SessionStart never arrives | Hook socket down, engine has no hooks | First output, then the 60 s cap | Slow or quiet line, then the amber end card |
| `listPtys` rejects | IPC error | Treat as no reading: say slow, never quiet | "Taking longer than usual" |
| Member signed out | Starts, then cannot work | Counts as in; existing sign in notices handle it | Normal opening, then the notice |

## Failure modes registry

```
CODEPATH        | FAILURE MODE          | RESCUED? | TEST? | USER SEES?        | LOGGED?
----------------|-----------------------|----------|-------|-------------------|--------
launchLock      | opening never ends    | Y        | Y     | floor opens       | Y
launchLock      | Michael stopped       | Y        | Y     | stopped card      | Y
launchLock      | mid-day restore       | Y        | Y     | card, no lock     | N
marker clear    | no SessionStart       | Y        | Y     | slow line         | N
card clock      | stale opening.since   | Y        | Y     | correct seconds   | N
gone quiet      | false alarm           | Y        | Y     | softer line ends  | N
```

0 critical gaps.

## Review sections

1. **Architecture:** reuses the inert switch at `App.tsx:371`. WARNING: the card sits inside
   `stageRef`, so making that div inert would hide its live region from screen readers. Wrap
   `StudioStage` alone.
2. **Errors:** 6 paths mapped, 0 gaps. The lift by limit logs which wait it cut short.
3. **Security:** No issues found. No new input, IPC, storage or secret.
4. **Edge cases:**

| Interaction | Edge case | Handled? |
|---|---|---|
| Click a desk while locked | Nothing happens | Yes, the card says why |
| Ask waiting at launch | Board opens by itself, locked | Yes, shows the note |
| Member panel open from before | Column locked | Yes |
| Top bar Needs you pill | Opens the board | Yes, the board is locked |
| Keyboard focus inside at lock | `inert` drops focus | Yes, native |
| Zero team | Opening ends at settle | Yes |
| Reload mid-opening | Lock returns, ends at settle | Yes |
| Restore pressed after the lock | Stays free | Yes |

5. **Code quality:** the clear rule, slowest pick and lock rules are pure functions in
   `shell/clockingIn.ts`, beside `nextOpening`. No new component.
6. **Tests:** see below.
7. **Performance:** one `listPtys` call every 2 s during the opening only, plus the 500 ms tick the
   card already has.
8. **Observability:** a `[opening]` line when the lock ends, with the reason, seconds and who was out.
9. **Deployment:** no migration or flag. Roll back by reverting; saved data is untouched.
10. **Long term:** reversibility 5/5. 1 debt item: "in" now means started, so anything wanting ready
    for work needs its own signal.
11. **Design:** see the Card section. Consider `/plan-design-review` for the card's sizing.

## Tests

| New behavior | Assertion | Rejects | no_claim |
|---|---|---|---|
| SessionStart clears the marker | Startup and resume clear; compact does not; real work is not overwritten | A busy action wiped | Live engine timing |
| First output on a no-hook engine | Clears once | Claude being cleared by output before its report | Other engines' output |
| Lock ends | Each of the 3 reasons, at 70 s exactly | A hung opening stays locked | Real hangs |
| Launch only | Off stays off after `reopenOffice` | Mid-day lock | none beyond protects |
| Slowest and wording | Names the oldest; 30 s switch; quiet at 15 s; failed read says slow | False quiet on a failed read | Terminal behavior |
| Clock start | Uses first shown, not `since` | 300 seconds so far after setup | none beyond protects |
| Card stays outside the lock | Source pin on the wrapper | Silent screen reader | Rendering |
| Every language | All new strings, no dashes | Missing key | Translation quality |

The 2am test is one real launch with 12 members: confirm the count moves within seconds, which also
settles the one unverified premise.

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** Opening rules: clear rule, slowest, lock reasons, 70 s limit.
  - Surfaced by: R1, R3, R5.
  - Files: `src/renderer/src/shell/clockingIn.ts`, `src/renderer/src/store/store.ts`, `src/renderer/src/hooks/useHive.ts`.
  - Verify: `test/office-opening-card.test.cjs`, new `test/clocking-in-clarity.test.cjs`.
- [ ] **T2 (P1, human: ~2h / CC: ~10min)** Lock: wrap `StudioStage`, make it and the right column inert, log the end.
  - Surfaced by: R2, R3.
  - Files: `src/renderer/src/App.tsx`, `src/renderer/src/components/TeamClockingIn.tsx`.
  - Verify: source pins, then a real launch.
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** Card and Ask me: clock, slowest line, floor line, board note, three languages.
  - Surfaced by: R4.
  - Files: `src/renderer/src/components/TeamClockingIn.tsx`, `src/renderer/src/components/OpeningCard.tsx`, `src/renderer/src/shell/NeedsYouBoard.tsx`, `src/renderer/src/i18n/locales/{en,zh-CN,ar}.json`.
  - Verify: the render harness in light and dark, and the locale tests.
- [ ] **T4 (P2, human: ~30min / CC: ~5min)** Docs: DESIGN.md 7.24 reverses "the floor stays clickable"; `OpeningCard.tsx:9` comment; `docs/FEATURES.md`.
  - Surfaced by: premise table.
  - Files: `branding/DESIGN.md`, `src/renderer/src/components/OpeningCard.tsx`, `docs/FEATURES.md`.
  - Verify: read against this plan.

## Reality rows

REALITY: premise-table finding 8 premises, 7 verified, 1 unverified docs/designs/clocking-in-clarity.md:27
REALITY: already-done pass no commits on main touch the opening since the ask src/renderer/src/shell/clockingIn.ts:1
REALITY: surface-check pass inert switch and listPtys both exist src/renderer/src/App.tsx:371
REALITY: binding-decisions finding reverses the 2026-10-18 floor stays clickable rule, owner asked src/renderer/src/components/OpeningCard.tsx:9
REALITY: numbers pass every timing is tagged in the premise table, and the limit is derived from the cap src/renderer/src/shell/clockingIn.ts:3
REALITY: deferred-asks pass no linked issue src/renderer/src/components/TeamClockingIn.tsx:1
REALITY: pr-count pass one wave on the running branch src/renderer/src/components/TeamClockingIn.tsx:1

## NOT in scope

- **Locking the whole window, or the message box** (D3, B declined): Settings must stay reachable.
- **A go in anyway button** (D4, B declined): the limit opens the floor by itself.
- **One row per member** (D5, B declined): too large over the floor.
- **Locking a mid-day restore** (D6, B declined): it would interrupt a working office.

## What already exists

The opening state machine, card, `stopped` store, inert switch, `listPtys` and the hook feed are all
reused. No new component.

## Dream state delta

Launch stops looking stuck and the floor waits safely. Still ahead: telling "started" from "ready for
work", and a shorter opening.

## Stale diagrams

None in the touched files.

## Design doc note

The design doc check returned `docs/designs/mailbox-choice.md`, which is about another feature. No
`/office-hours` doc exists for this work. Web landscape research was not run: this is a local fix to
one screen.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | Count measures first work, not start        |
  | Step 0               | HOLD SCOPE; R1 engine started               |
  | Section 1  (Arch)    | 1 issue found                               |
  | Section 2  (Errors)  | 6 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Table produced, 0 gaps                      |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap found, closed by a log line           |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 1 issue, clock start fixed in plan          |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 6 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 6 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 0 proposed, 0 accepted (HOLD SCOPE)         |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | skipped: owner's Codex rule                 |
  | Lake Score           | 3/3 recommendations chose complete option   |
  | Diagrams produced    | 2 (architecture, state machine)             |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 1 unverified                      |
  +====================================================================+
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | none | Independent 2nd opinion | 0 | skipped | owner's Codex rule; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | none |

- **OUTSIDE COVERAGE:** skipped. The owner limits Codex to adversarial passes, so no outside voice ran; this is missing coverage, not a clean pass.
- **VERDICT:** CEO Review CLEAR; eng review required.

NO UNRESOLVED DECISIONS
