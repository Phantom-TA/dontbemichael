# A hire's first task is a card, not a line in the Work style

Status: built (2026-10-03, FT1 to FT6). Decisions settled by the owner at the end.

## Problem

Owner, 2026-10-03: what is the "First task" in each Work style for, how is it
used, what if the agent never does it, and what happens to it after it is done?

Every pack Work style (36 of 36) ends with a First task: the one job that gets
a new hire going, often collecting the facts the role needs ("Ask the owner,
through Michael, for the open deals... Build the pipeline"). Today it is only
prose, and that causes five problems.

## How it works today

- **Nothing reads it.** The section is text inside `workStyle`, which becomes
  the agent's `goal` (`teamPlan.ts` `teamMemberGoal`). No code parses it,
  schedules it, records it or marks it done.
- **Nothing starts it.** Nothing is typed into a new hire. Workers wake only
  when mail lands in their inbox (`workerWake.ts`, the renderer's inbox nudge),
  and the only pack starter jobs belong to Pam. So Dwight's "ask for the open
  deals" waits until something else happens to give him a turn.
- **Nobody notices when it doesn't happen.** No card, no reminder, and Michael
  doesn't know a hire has a first task at all.
- **It never goes away.** The goal, First task included, is sent again at
  every session start (`hooks.ts:587`). An agent that does not remember doing
  it can do it again, for example asking the owner the same question twice.
  Michael's check only catches duplicates of open asks, not answered ones.
- **Owner edits can lose it or make it recurring.** The prompts that rewrite
  a Work style on save (`workStyleText.ts` `toPlainPrompt`,
  `toInstructionsPrompt`) only know three sections. Judging by the prompt
  text, the model may drop the First task or fold it into How to work, where
  it becomes a standing duty. (The fallbacks used when that call cannot run
  keep it.)

Two related findings:

- **Some recurring work exists only as a First task.** Oscar's weekly money
  summary (core, home, pro, restaurant, retail, saas) and three Ryans
  (restaurant's daily special, retail's weekly promotion, pro's monthly note
  to past clients) have no schedule anywhere. After the first one, nothing
  asks for the next.
- **The owner-facing `firstAction` line is shown nowhere.** Each pack card
  carries one (e.g. "Asks for your open leads tomorrow at 9am"); it is parsed
  (`agentDefinition.ts:254`) and never shown.

## The 36 first tasks, by kind

| Kind | Cards | Becomes |
|---|---|---|
| One-time job: ask the owner and build a list, sweep the inbox, a first draft | 5 Pams, Toby x2, Dwight x4, Darryl x2, Meredith x3, Creed, Nick, Sadiq x2, saas Ryan, home Ryan | **First task card** (FT1, FT2) |
| Recurring work filed as a first task | Oscar x6, restaurant Ryan, retail Ryan, pro Ryan | **Starter job** (schedule and focus), no first task (FT3) |
| Waits for an event ("when the first quote request arrives") | 5 Kellys | **Dropped**: How to work already covers it (FT4) |

## Proposal

### FT1. The pack card carries the first task as its own field

`AgentDefinitionV2.firstTask?: { title: string; ask: string }`, validated in
`agentDefinition.ts` (title up to 60 characters, ask up to 400, no dashes):

- `title`: what the board shows, a few plain words with no names ("Build the
  sales pipeline").
- `ask`: the instruction, written to the hire in the house style, with no
  times ("At 9am on your first day" is gone; Michael hands it out when the
  office is open).

Every pack Work style loses its First task section. `firstAction` is removed
from the six packs; an imported pack that still has it is accepted and the
line is ignored, as it is today.

### FT2. At hire, the app adds the card and asks Michael to hand it out

Wherever starter jobs are seeded today (`AddAgentModal` after a hire, team
start in `useHive.ts`), the app also calls a new `hive:firstTask` IPC with the
`sourceCard` and the agent id. Main does what webhook work already does
(`dispatchWebhookWork`, `index.ts:2326`):

1. Builds the card with a pure `firstTaskCard(def, agent, business)` in
   `src/shared/firstTask.ts` (it delegates to `firstTaskCardFromText`, which
   SR2 and SR5 use for a First task the owner wrote): id `first-<agentId>`, the pack title, the ask as
   its description with the business filled in and the hire's name swapped in
   (as `swapName` does for Work styles), status `todo`.
2. `hive.addTask(card)`. It is idempotent by id, so a restart, a second call
   or team start running again never adds a second card or a second request.
   If the card already exists, stop.
3. Sends Michael an owner request about that card: `act: 'request'`, from
   `human`, `conversation: cardConversation(id)`, `requires_reply: true`. The
   body says who just joined, their role, and their first task, and asks him
   to hand it to them.

Michael then works it the usual way: he assigns the card, dispatches it, and
replies `done` to close the request. The request stays in his open owner
requests until he does (`ownerRequests.ts`), and the card stays on the board
until it is Done (card lifecycle). Nothing new is added to his prompt.

Someone fired and rehired gets a new agent id, so a new first task.

### FT3. Recurring work gets a starter job

New `starterMissions` entries, each with a focus that says what to do:

| Card | Schedule | Focus (short form) |
|---|---|---|
| Oscar, every pack | `mon 09:00` | Send Michael the weekly money summary for the owner, listing any records still needed. |
| Restaurant Ryan | `09:00 on office days` | Draft tomorrow's special for approval; if nothing came in about what is on, ask the owner through Michael. |
| Retail Ryan | `mon 09:00` | Draft this week's promotion for approval. |
| Pro Ryan | `mon 09:00` (D3) | On the first Monday of the month, draft the note to past clients for approval; on other Mondays, nothing. |

Each pack's `starterMissions` is checked against its office hours as today.

### FT4. First tasks that wait for an event are dropped

The five Kellys' "when the first question arrives, draft a reply for
approval" is already their standing duty in How to work. saas Kelly's "start
the support log" is covered by "Log each request with its status and next
step."

### FT5. Owner edits never bring a first task back into the Work style

`toPlainPrompt` and `toInstructionsPrompt` each get one sentence: one-time
work is a card on the board, so leave out any first task. The two fallbacks
drop a `First task` heading and what follows it.

### FT6. Offices that already hired (D1, D2)

Today's team members already have the First task text in their Work style,
and no card. Their unedited First task text is removed (D1). The new starter
jobs (FT3) are for new hires only (D2).

## Decisions (owner, 2026-10-03)

- **D1. The First task text already in team members' Work styles:** removed
  on the first launch after the update where it is exactly the pack's text
  (with the business and name filled in); a section the owner edited stays.
  Agents already hired get no first task card: they have been working, and a
  card would ask for something they probably did.
- **D2. The new recurring jobs for offices that already hired:** none. There
  are no users yet, so the FT3 starter jobs are for new hires only and no
  migration is built.
- **D3. Pro Ryan's monthly note:** weekly on Monday, with a focus that does
  the work only on the first Monday. No monthly schedule form is added.

## Ship review decisions (owner, 2026-10-03)

The pre-landing review found three gaps; the owner chose:

- **SR1. A clone gets no first task.** Only a hire whose job came straight
  from a pack card sends its first task card. A clone copies a teammate's job,
  not that teammate's one-time work.
- **SR2. An edited First task becomes a card** (refines D1). At the one-time
  cleanup, a First task the owner edited is sent to Michael as a first task
  card (the request says the owner set it earlier) and leaves the Work style,
  so the editor and the instructions agree. It stays in the Work style when the
  card cannot be made, when it is longer than a card holds (2000 characters),
  or when the hire is closed. A renamed manager still matches the packs' text,
  and the older packs' bare "First task" line counts as a heading.
- **SR3. Bindings come back with the hire.** Closing a bound hire releases its
  teammates' "Not for ...; that goes to <Name>." lines; the lines are kept on
  the hire and put back when they return (releaseBindings.ts).
- **SR4. Cleaned hires get their starter jobs.** The one-time cleanup that
  takes a pack First task out of a Work style also schedules that pack card's
  starter jobs for the hire, so a standing duty that used to live in the First
  task text is not lost. A hire whose edited First task became a card gets
  them too. The jobs are added before the text comes out: when they cannot
  be saved, the words stay and the cleanup runs again next launch. A typed
  First task whose card cannot go on the board, because the board cannot be
  read, stays in the Work style and the owner gets a notification. A closed
  hire's jobs are added switched off, like its other schedules (Codex
  adversarial review, 2026-10-04).
- **SR5. A typed First task becomes a card.** A First task section the owner
  types into the Work style, in the hire wizard or in Edit, is sent to Michael
  as a first task card. When the hire already has a first card, the new one
  gets its own id (`first-<agentId>-<time>`), so nothing is dropped. When the
  card cannot be made, the words go back into the instructions under "First
  task:" (`shell/typedFirstTask.ts`).

## Build tasks

1. `agentDefinition.ts`: `firstTask` field and validation; `firstAction`
   accepted, unused. The section helpers (`firstTaskSection`,
   `withoutFirstTask`) live in `workStyleText.ts`; the old texts the D1
   cleanup matches are frozen in `legacyFirstTasks.ts`.
2. All six packs: move each first task into `firstTask` per the table, strip
   the section from `workStyle`, drop `firstAction`, add the FT3 starter jobs.
3. `src/shared/firstTask.ts`: `firstTaskCard` and the request body (pure).
4. Main: `hive:firstTask` IPC and preload entry; renderer calls it next to
   both `seedStarterJobs` calls.
5. `workStyleText.ts`: FT5 sentences and fallback handling.
6. D1 migration, run once and recorded in config.
7. Docs: `agent-instructions/README.md` per-card sections, `card-lifecycle.md`
   (a first task card is Michael's like any other), and `docs/FEATURES.md` at
   land.

## Tests

- Every pack card: the Work style has no First task; every card in the "one-time
  job" row has a `firstTask` with a title under 60 characters and no times;
  the FT3 starter jobs exist and parse against office hours.
- `firstTaskCard`: name swap, business fill, deterministic id.
- Hire twice, or restart: one card, one request.
- The request is an open owner request until Michael's `done` reply, and the
  card then stays until Done.
- Round trip: a Work style with a First task loses it through both fallbacks.
- D1: an unedited section is removed; SR2: an edited one becomes a card and leaves the Work style (kept when the card fails, is too long, or the hire is closed); a duty sentence that starts with "First task" is not a section; a bare "First task" line is.
