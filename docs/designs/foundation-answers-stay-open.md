# Foundation answers that can be questioned again

Status: decided by the owner part by part (2026-11-03, see "Decided"), engineering and
design reviewed, built on 2026-11-03 (tasks T1 to T10 and D-T1 to D-T4; T11's FEATURES.md
and ship notes wait for /ship).
Builds on: `office-foundations.md` (the questions, hits, gaps and the weekly Foundations check).

## The problem

An answered foundation question is treated as settled forever. Two ways that goes wrong, both
seen in the reference office on 2 Nov 2026:

1. **Closed too early.** Oscar answered "where money is recorded" from his Records-Log.md
   ("QuickBooks is the book... clients pay into Wise"). Twenty six minutes later the question
   was widened to "every place money comes in and goes out (banks, cards, payment services,
   investments)". The old answer still counts as answered, so no member reports a gap and the
   owner is never asked. The Amex and Chase cards are not on any list.
2. **True once, wrong later.** Even a full list the owner gives today goes stale the day the
   business opens a new card or changes banks, and nothing in the app ever asks again.

This is not a finance problem. Every job has list questions that grow: Sales (what we sell,
who we sell to), HR (who works here), IT (every tool and login), Marketing (every channel).

## What the research says (deep research, 2 Nov 2026, 22 of 25 claims confirmed)

- **Being complete is a separate claim from being true.** A list can be right and still
  missing items. Databases handle this with a separate *completeness assertion* scoped to an
  exact question; outside what it covers, the honest answer is "unknown", never "no"
  (Razniewski et al. 2023, arXiv 2305.05403; Darari et al., arXiv 1408.6395). An assertion made
  for a narrower question does not cover a wider one.
- **Completeness goes stale.** "Areas formerly complete might become incomplete later on", so
  an assertion needs a date it was true as of (same sources). No published rule sets the shelf
  life per fact type; it has to be chosen, then tuned from how often confirmations break.
- **Default by risk.** Treating data as complete unless flagged suits stable, low stakes facts;
  for open ended, high stakes lists (financial accounts) the safe default is incomplete unless
  asserted (Razniewski, Savkovic, Nutt, PCWA).
- **Do not count on the model noticing.** On the STALE benchmark the best model acted on
  invalidated memories correctly 55.2% of the time, even with the newer evidence in front of
  it (Chao et al. 2026, arXiv 2605.06527, preprint). Invalidation has to happen in the
  structure: when facts are written, and by explicit checks.
- **Supersede, never overwrite.** Temporal memory systems keep when a fact held and when it was
  recorded, and mark a contradicted fact invalid instead of deleting it (Zep/Graphiti, arXiv
  2501.13956; Engram, arXiv 2606.09900). Note: "new information always wins" was refuted; new
  evidence must not silently replace what the owner said.
- **Track what rests on what.** Conclusions built on a fact are flagged for review when the fact
  changes, as in a truth maintenance system (arXiv 2608.14567; Kumiho, arXiv 2603.17244). This
  is advisory: something still has to trigger it.
- **Ask by value, not on a timer for everything.** Agents over ask about small things and under
  ask about critical gaps (SAGE-Agent, arXiv 2511.08798). Sending everything for review produces
  rubber stamp approvals; keep a fixed re-confirm cadence only for high risk items (AWS
  Well-Architected Agentic AI Lens, AGENTSEC04-BP02).

Caveats: several sources are recent preprints, some from vendors. Applying them to the office is
our inference. Nothing verified came back on how bookkeepers keep account lists complete, though
bank reconciliation is the obvious real world version of section 4 below.

## The design: an answer is a claim with a scope, a basis and a shelf life

### 1. Each answer says how far it covers (fixes "closed too early")

Questions get a kind: **list** (open ended: accounts, tools, staff, products, channels) or
**single** (accounting method, financial year). A list answer carries a coverage:

| coverage | meaning | who can set it |
|---|---|---|
| `known so far` | what the office has seen; there may be more | anyone with a source |
| `complete` | the owner says this is all of it, as of a date | the owner only (through Michael) |

- A member's answer (file, taught) to a list question is always `known so far`. Today's
  Records-Log answer would have been saved, and still left the question open.
- Members read a `known so far` answer as usable but unfinished: follow it, and report a gap
  when the work shows more.
- The foundations count treats `known so far` as half answered, so Pulse shows it.
- The owner's card for a list question shows what is known and asks only for what is missing:
  "Oscar knows Wise, Wells Fargo, Apple Card, Interactive Brokers, Stripe. Anything else?"
  with **That's all of them** (sets `complete`) and an add field.

### 2. Each answer names the wording it answered (fixes the reworded question)

Each question has a version. Rewording it in code says whether the meaning widened. A widened
question turns every `complete` answer back into `known so far` (the text stays as the
starting point); a reword that only changes words keeps answers as they are. This reverses the
2 Nov rule "an answer already given stays as it is", and is the fix offered for the money
question in this office.

### 3. Complete lists expire (fixes "true once, wrong later", by time)

A `complete` answer to a high stakes list has a shelf life; when it runs out, coverage drops to
`known so far` and the weekly Foundations check raises one card for all of them together:
"Still the full list? Bank and card accounts (confirmed 3 Feb)" with **Still all of them** and
an add field. One tap, one card a week at most, so it stays a check and not a chore.

Starting shelf lives (to tune from how often confirmations turn out wrong):

| question | shelf life |
|---|---|
| every place money moves | 90 days |
| who has access to what | 90 days |
| who works here | 180 days |
| products, channels, tools | none: evidence only (section 4) |
| single facts | none |

Low stakes lists never expire on time, only on evidence.

### 4. Work that shows more reopens the list (fixes it by evidence)

The best trigger is the work itself: a statement line paying an Amex card that is not on the
list is proof the list is short. Oscar's memory has held "Wise pays card bills (AMEX/Chase)"
since 6 Oct, and his October statements show both payments, yet nothing turned that into a
question.

- **A new foundation message, `seen`.** Before each report, a member compares what its work
  touched against the list answers it used and sends anything not on them:
  `{"question": "money", "seen": "Amex card bills paid from Wise (2,542.46 on 23 Oct)",
  "source": {"file": ".../wise/October.pdf"}}`.
- The app adds the item to the answer as `known so far` and drops a `complete` to
  `known so far`. It never removes or replaces anything the owner said: evidence only adds
  and reopens.
- Michael raises one card: "Oscar saw payments to an Amex card that isn't on your accounts
  list. Add it, and where should its statements go?"
- A report's "Still missing" line that names something on a list goes as `seen` too, so it
  becomes a question instead of a sentence at the bottom of a report.
- Later, where a connector gives structured data (QuickBooks accounts, bank feeds), the app
  compares it to the list itself, with no model judgment: the deterministic check the research
  recommends.

### 5. Reports name the answers they used (what changes downstream)

A report sends with it the foundation questions it relied on (Oscar's October cash flow:
`money`). When one of those answers changes or loses `complete`, the app tells Michael which
recent reports rested on it ("The October cash flow used the accounts list, which now has
Amex"). Michael decides whether to redo the work. Advisory only; nothing reruns by itself.

### 6. History is kept, never overwritten

`foundations.json` keeps each question's past answers (text, coverage, from when, recorded
when, by whom) instead of replacing them, so the owner can see what changed and when, and a
report can be read against what the office believed at the time.

## What to avoid

- A member's file or memory closing a list question. Only the owner says "that's all".
- Rechecking every answer on a timer. It trains the owner to tap Yes without reading.
- Trusting the model to notice staleness by reading its context. Make it a step with a message.
- Letting new evidence overwrite the owner's answer. It adds and reopens; the owner decides.
- Turning `seen` into a flood: one card per question, merged across members, as today.

## Agent behavior changes (each needs the owner's decision)

1. Members treat a `known so far` list answer as open: they use it and keep reporting what the
   work shows beyond it.
2. Before each report, members send `seen` for anything their work touched that a list answer
   used does not include, and turn "still missing" items into `seen`.
3. Michael raises a card for each reopened list (evidence or expiry) and, for expiring lists,
   one weekly "still the full list?" card.
4. Reports name the foundation questions they used; Michael is told when one of those changes
   and decides whether to redo the work.

## Decided (owner, 2026-11-03)

The owner took each part on its own, with its pros and cons, and adopted all six as written:

1. **Coverage on list answers.** Every list question has `known so far` or `complete`; only the
   owner marks complete.
2. **Question versions.** A widened question reopens its `complete` answers as `known so far`,
   keeping the text; a reword that keeps the meaning leaves answers alone. Replaces the 2 Nov
   rule "an answer already given stays as it is".
3. **Expiry for high stakes lists.** 90 days for accounts and access, 180 for staff, one weekly
   "still the full list?" card; other lists and single facts never expire.
4. **The work reopens a list.** Members send `seen` before each report, and a report's "still
   missing" items on a list go as `seen`. Comparing connector data with no model judgment stays
   a later, separate decision.
5. **Reports name the answers they used.** Michael hears when one of them changes, for reports
   from the last 60 days, and decides whether to redo the work.
6. **History.** Every past answer is kept; a history view for the owner comes later.

Agent behavior changes 1 to 4 above are approved with these parts.

## Open questions

- Shelf lives above are starting guesses; the research found no published values.
- Whether a reword widened a question is decided by whoever edits the question in code; the app
  cannot judge it from free text.
- How many foundation cards a week the owner will act on across all jobs; today's rule is one
  card per question.

## Eng review (2026-11-03)

Target: this design (`docs/designs/foundation-answers-stay-open.md`), checked against
`src/main/foundations.ts`, `src/shared/foundations.ts`, the member and Michael rules in
`src/main/hive.ts:423-467`, the weekly check in `src/main/config.ts:102-130`, the card in
`src/renderer/src/components/FoundationCard.tsx` and the Pulse count in `src/main/pulse.ts`.

### Scope record

Complexity: about 12 files (shared and main foundations, hive.ts rules, config.ts check focus,
pulse.ts, index.ts and preload IPC, FoundationCard.tsx, three locale files, tests) and one new
store (reports by question, section 5). Feature answers: no cut proposed; the owner adopted all
six parts on 2026-11-03 and nothing found here argues for dropping one. Structure: smaller
arrangement, decided by the owner's standing rule (no code arrangement questions): coverage,
expiry, seen items, history and the reports list all live in `foundations.json`, written only by
`src/main/foundations.ts`, with the catalog in `src/shared/foundations.ts`; no new module or store.
Accepted scope: all six parts. Pending remedies: R1 to R7. Scope Challenge result: scope accepted
as-is.

### Scope findings

1. [CRITICAL] (confidence: 9/10) design section 4, "The app adds the item to the answer" against
   `src/shared/foundations.ts:87` `export const FOUNDATION_CAP = 300;` and
   `src/main/foundations.ts:459-462` (a change to an owner's answer goes to Michael as a
   suggestion). Appending seen items to the answer text would edit the owner's words and pass
   the cap. Correction, required by the approved contract "never removes or replaces anything the
   owner said": seen items are a separate list on the record, shown beside the answer; only the
   owner's card folds them into the answer. No question needed.
2. [CRITICAL] (confidence: 8/10) No way to say a seen item is not the business's. Oscar's memory
   holds "Card 1005 is Baniya Rentals Amex, not Moblize.it's; ignore it" (owner, 2026-10-06);
   with seen, that card would reopen the money list after every report. Decision R6.
3. [CRITICAL] (confidence: 8/10) Expiry against the card model: `foundationAsk`
   (`src/shared/foundations.ts:392`) reads one question per card, and Michael's rule says
   "Never raise a card for a question no work has hit" (`src/main/hive.ts:425`). A combined
   "still the full list?" card is a new card type, and an expired list has no hit, so no card is
   ever raised. Decision R5.
4. [INFORMATIONAL] (confidence: 8/10) The shelf life table names questions that are not lists or
   do not exist: `access` is "How passwords and access are handled"
   (`src/shared/foundations.ts:66`), a policy; there is no "channels" question. Decision R4.
5. [INFORMATIONAL] (confidence: 8/10) Which questions are lists is not stated. Decision R1.
6. [INFORMATIONAL] (confidence: 7/10) When an owner answer counts as `complete` is not stated
   (card Save, a folder or file answer, Michael relaying the owner). Decision R2.
7. [INFORMATIONAL] (confidence: 8/10) The count: section 1 says `known so far` counts as half,
   while the adopted part 1 said the count reads lower until the owner confirms; Pulse replays
   telemetry events (`replayFoundations`, `src/shared/foundations.ts:323`) that carry no
   coverage, and the owner's 2026-10-19 rule is "Foundations 2 of 6". Decision R3.
8. [INFORMATIONAL] (confidence: 7/10) Section 5 asks members to name the questions each report
   used, which the research says not to rely on (STALE, 55.2%) and which needs a new message
   field. Decision R7.
9. [INFORMATIONAL] (confidence: 8/10) Rollout of existing answers. Decided by the owner's rule
   (small rollout mechanics take the recommendation): member answers to list questions become
   `known so far`; owner answers become `complete` as of the upgrade day, not their answer day,
   so no office gets a burst of expiry cards on day one; any `money` answer saved before the
   2 Nov widening is `known so far`.
10. [INFORMATIONAL] (confidence: 7/10) A widened single question has no coverage to drop.
    Decided by rule: question versions apply to list questions; widening a single question in
    code means giving it a new id, so its old answer simply stops applying.

## Decision ledger

### R1: Which questions are lists
Finding: 5, INFORMATIONAL, 8/10, design section 1, `src/shared/foundations.ts:43-70`, Claude
Plan baseline: section 1, "list (open ended: accounts, tools, staff, products, channels)", no catalog
Runtime evidence: every question is a single answer today; no kind field exists
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 list questions | none | offer, current_customers, competitors, money, owed, team, tools, suppliers | money, owed, team, tools |
| R2 to R7 | pending | pending | pending |
Question D1:
D1 — Which foundation questions are open ended lists
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: A list question keeps a "known so far" answer open until you say that's all; a single question (financial year, accounting method) closes when answered. We have to pick which of the 26 questions are lists. Too few and partial lists close early again; too many and you get more "anything else?" cards.
Stakes if we pick wrong: a list left as single closes on a partial answer, which is the Amex and Chase problem again.
Recommendation: A because each of these eight grows as the business grows and a partial one misleads the team, while the other 18 are one fact or one description.
Completeness: A=9/10, B=6/10
Pros / cons:
A) Eight lists (recommended)
  ✅ Covers what we sell, customers today, competitors, money, who owes whom, the team, systems and suppliers
  ✅ The other 18, such as brand voice or opening hours, stay single and close as today
  ❌ Up to eight "anything else?" cards over time, one per list as work touches it
B) Four lists
  ✅ Only money, who owes whom, the team and systems: the ones where a miss costs money or access
  ✅ Fewer cards, and the smallest change to how answers work today
  ❌ A partial product, customer or supplier list closes early, as money did
Net: eight lists catch more early closes, four ask you less often.
<gstack-qid:plan-eng-review-foundation-list-kinds>
Header: Lists
Options:
A) Eight lists (recommended)
Offer, current_customers, competitors, money, owed, team, tools and suppliers are lists; the other 18 questions stay single.
B) Four lists
Only money, owed, team and tools are lists; the other 22 stay single.

State: approved
Actual answer: A) Eight lists (owner, D1, 2026-11-03)
Accepted scope: offer, current_customers, competitors, money, owed, team, tools and suppliers are list questions with coverage; the other 18 questions stay single and close when answered, as today.
History: none

### R2: When an owner answer to a list counts as complete
Finding: 6, INFORMATIONAL, 7/10, design section 1, `src/main/foundations.ts:286-401` (ownerAnswer, answerFolder, answerFile), Claude
Plan baseline: section 1, "complete: the owner says this is all of it, as of a date; who can set it: the owner only (through Michael)"; the card has "That's all of them" and an add field
Runtime evidence: today any owner answer closes the question (`src/main/foundations.ts:292`); Michael relays owner words with "source": {"owner": ...} (`src/main/hive.ts:426`)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 list questions | approved, eight lists | eight lists | eight lists |
| R2 what marks complete | any owner answer closes | any save on the list card (typed, file or folder) or "That's all of them"; Michael's relay only with "complete": true when the owner said it is the whole list | only the "That's all of them" tap; every other owner answer stays known so far |
| R3 to R7 | pending | pending | pending |
Question D2:
D2 — When does your answer to a list count as the whole list
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: A list stays "known so far" until it is marked complete, and only you can do that. The card asks "Anything else?" with "That's all of them" and a box to add items. We need to say whether saving the card counts as "that's all", and what happens when you tell Michael the list in the dock instead.
Stakes if we pick wrong: either a list you meant as whole keeps coming back to you, or a list you gave in passing is trusted as complete.
Recommendation: A because the card asks for the whole list, so saving it means that's all, and Michael only marks it complete when you said so.
Completeness: A=9/10, B=7/10
Pros / cons:
A) Saving the card is that's all (recommended)
  ✅ One step: you add the missing items, press Save, and the list is complete as of today
  ✅ Telling Michael "that's every account we have" works too, and a passing mention does not close it
  ❌ If you save a partial list on the card by mistake, it counts as whole until a seen or expiry reopens it
B) Only the That's all tap
  ✅ Complete is always a separate, explicit tap, so nothing closes by accident
  ✅ Michael can never mark a list complete for you
  ❌ After adding items you must also tap That's all, or the card comes back
Net: A takes one step and trusts your save; B takes two and trusts only the tap.
<gstack-qid:plan-eng-review-foundation-complete-when>
Header: Complete when
Options:
A) Saving the card is that's all (recommended)
Any save on a list card (typed, file or folder) or That's all of them marks it complete as of today; Michael marks it complete only with "complete": true when you said it is the whole list.
B) Only the That's all tap
Only the That's all of them tap marks a list complete; every other owner answer, Michael's included, stays known so far.

State: approved
Actual answer: A) Saving the card is that's all (owner, D2, 2026-11-03)
Accepted scope: any owner save on a list card (typed, file or folder) or the That's all of them tap marks the list complete as of that day; Michael's relay of owner words marks it complete only when his message carries "complete": true because the owner said it is the whole list; otherwise his relay saves the list as known so far.
History: none

### R3: How a known so far list counts on Pulse
Finding: 7, INFORMATIONAL, 8/10, design section 1 "half answered", `src/shared/foundations.ts:304` (countFor) and `:323` (replayFoundations), Claude
Plan baseline: section 1, "The foundations count treats known so far as half answered"; adopted part 1 told the owner "the foundations count reads lower until you confirm"
Runtime evidence: the count is answered over total, replayed from telemetry events whose change is answered, changed, cleared or hit; no event says coverage
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 list questions | approved, eight lists | eight lists | eight lists |
| R2 what marks complete | approved, any card save or Michael with "complete": true | same | same |
| R3 count of a known so far list | counts as answered | not answered: "Foundations 2 of 6", the missing line says "where money moves (partly known)" | half: "Foundations 2.5 of 6" |
| Coverage event for Pulse | none | a coverage event (common work) | a coverage event (common work) |
| R4 to R7 | pending | pending | pending |
Question D3:
D3 — How a partly known list counts in "Foundations 2 of 6"
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: Pulse shows each job as "Foundations 2 of 6" with what is missing. A list that is only "known so far" is partly answered, so we have to choose how it counts. Either way the app records a new event when coverage changes, so Pulse can see it.
Stakes if we pick wrong: the count either hides partial lists or shows a fraction that reads like a score, which the 19 Oct rule ("never a quality score") avoids.
Recommendation: A because it keeps whole numbers and matches what you approved in part 1, that the count reads lower until you confirm.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Counts as missing (recommended)
  ✅ Whole numbers stay: "Foundations 2 of 6", and the missing line says "where money moves (partly known)"
  ✅ Matches part 1 as you approved it, and nudges the list toward That's all of them
  ❌ Offices drop a point on upgrade for each member filled list until the owner confirms it
B) Counts as half
  ✅ Gives credit for what the office already knows, so the drop on upgrade is smaller
  ✅ Shows progress between nothing known and the whole list
  ❌ "2.5 of 6" reads like a score, and the design said half while part 1 said lower
Net: A keeps the count simple and strict, B softer but fractional.
<gstack-qid:plan-eng-review-foundation-partial-count>
Header: Count
Options:
A) Counts as missing (recommended)
A known so far list is not answered in the count; the missing line names it with "(partly known)"; a coverage event tells Pulse.
B) Counts as half
A known so far list counts as half an answer ("2.5 of 6"); a coverage event tells Pulse.

State: approved
Actual answer: A) Counts as missing (owner, D3, 2026-11-03)
Accepted scope: a known so far list is not answered in the count ("Foundations 2 of 6"); the missing line names it with "(partly known)"; every coverage change writes a telemetry event so Pulse replays it. Section 1's "half answered" is replaced.
History: none

### R4: Which questions get a shelf life
Finding: 4, INFORMATIONAL, 8/10, design section 3 table, `src/shared/foundations.ts:62-66`, Claude
Plan baseline: adopted part 3, "bank and card accounts 90 days, who has access to what 90 days, who works here 180 days"
Runtime evidence: `money` (list, R1) is the accounts question; `team` is "Who is on the team and who handles what" (list, R1); `access` is "How passwords and access are handled", a policy and single (R1); `tools` is "The systems we work in, and who uses each" (list, R1)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 list questions | approved, eight lists | eight lists | eight lists |
| R2 what marks complete | approved | same | same |
| R3 count | approved, partly known counts as missing | same | same |
| R4 shelf lives | none | money 90 days, team 180 days, tools 90 days (stands in for who has access to what) | money 90 days, team 180 days; nothing for access |
| R5 to R7 | pending | pending | pending |
Question D4:
D4 — Which questions the "who has access to what" shelf life goes on
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: You approved 90 days for bank and card accounts, 90 for who has access to what, and 180 for who works here. Accounts and staff map onto real list questions (money and team). There is no "who has access to what" list: the access question asks how passwords are handled, a policy. The closest list is "The systems we work in, and who uses each".
Stakes if we pick wrong: either the access check you approved never runs, or it runs on a question that is not what you meant.
Recommendation: A because "systems and who uses each" is the list that changes when someone gains or loses access, so it keeps what you approved.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Systems list, 90 days (recommended)
  ✅ Keeps the access check you approved: every 90 days, "still every system and who uses it?"
  ✅ Uses a question that is already a list, so no rewording and no new question
  ❌ It asks about systems and their users, not passwords, so a password policy change is not rechecked
B) No access check
  ✅ One less weekly card to answer, only accounts and staff expire
  ✅ No mapping to argue about: only questions that match the words exactly
  ❌ Drops the access check you approved in part 3
Net: A keeps your access check on the nearest real list, B drops it.
<gstack-qid:plan-eng-review-foundation-shelf-life-ids>
Header: Shelf life
Options:
A) Systems list, 90 days (recommended)
money 90 days, team 180 days, and tools ("The systems we work in, and who uses each") 90 days for who has access to what.
B) No access check
money 90 days and team 180 days only; no question carries the access shelf life.

State: approved
Actual answer: A) Systems list, 90 days (owner, D4, 2026-11-03)
Accepted scope: shelf lives are money 90 days, team 180 days and tools 90 days (for who has access to what); no other question expires.
History: none

### R5: How an expired list comes back
Finding: 3, CRITICAL, 8/10, design section 3 against `src/shared/foundations.ts:392` (`foundationAsk` reads one question per card) and `src/main/hive.ts:425` ("Never raise a card for a question no work has hit"), Claude
Plan baseline: adopted part 3, "one weekly card for all expiring lists together"; reopened because the card model holds one question per card and Michael raises cards only for questions the work hit, so as designed no card would ever be raised
Runtime evidence: a foundation card is one humanQA entry with one "foundation" id (`src/main/hive.ts:425`); FoundationCard.tsx saves one question's answer
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 to R4 | approved | same | same |
| R5 how an expired list comes back | not designed to work | the app records an "expired" hit for the list, Michael raises one foundation card per expired list through his existing path, and the weekly check brings each back | a new combined card kind on Needs you listing every expired list, each with its own Still all of them and add field |
| R6, R7 | pending | pending | pending |
Question D5:
D5 — Expired lists come back as one card each, or one combined card
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: You approved one weekly "still the full list?" card for all expiring lists. Today a foundation card holds exactly one question, and Michael only raises cards for questions the team's work ran into, so an expired list would never get a card at all. Either the app marks an expired list like a hit and Michael raises its normal card, or we build a new card that holds several lists.
Stakes if we pick wrong: as designed, an expired accounts list never comes back to you, so the 90 day check silently does nothing.
Recommendation: A because it reuses the card you already answer, and only three lists can expire, each on its own date, so they rarely land in the same week.
Completeness: A=9/10, B=9/10
Pros / cons:
A) One card per list (recommended)
  ✅ The same card you answer today, with its Save, add a file and Not now, so nothing new to learn
  ✅ Small change: the app records an expired hit and Michael's existing rule raises the card
  ❌ If two lists expire the same week you see two cards, not one
B) One combined card
  ✅ Exactly what you approved: one card, every expiring list on it, one visit
  ✅ Fewer cards on Needs you in a week when several lists expire together
  ❌ A new card kind with its own screen, saving and tests (human: ~2 days / CC: ~1 hour more)
Net: A reuses the existing card and may show two in a rare week; B builds a new one to always show one.
<gstack-qid:plan-eng-review-foundation-expiry-card>
Header: Expiry card
Options:
A) One card per list (recommended)
The app records an expired hit for the list; Michael raises its normal foundation card, one per expired list; the weekly check brings each back.
B) One combined card
A new card kind on Needs you lists every expired list, each with its own Still all of them and add field.

State: approved
Actual answer: A) One card per list (owner, D5, 2026-11-03)
Accepted scope: when a complete list passes its shelf life the app records an "expired" hit for it; Michael raises its normal foundation card through his existing rule, one card per expired list, and the weekly Foundations check brings each back until it is answered. No combined card.
History: adopted part 3 said one weekly card for all expiring lists (owner, 2026-11-03); reopened for the card model finding above; replaced by this answer.

### R6: Saying a seen item is not the business's
Finding: 2, CRITICAL, 8/10, design section 4, Oscar's memory `m14` ("Card 1005 is Baniya Rentals Amex, not Moblize.it's; ignore it and its charges", owner, 2026-10-06), Claude
Plan baseline: section 4 adds a seen item and reopens the list; nothing records an item the owner rejected
Runtime evidence: no exclusion list exists; members carry only their job's section and their own memory
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 to R5 | approved | same | same |
| R6 a rejected seen item | not designed | the card shows each seen item with Add and Not ours; Not ours keeps the item on the question's not ours list, every member of the job sees it in its section, and a seen matching it is dropped without reopening the list | nothing kept; each member remembers what the owner told it |
| R7 | pending | pending | pending |
Question D6:
D6 — A way to say "that account is not ours"
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: With seen, a member that spots something not on a list reopens it and you get a card. Some things it spots are not the business's: Oscar's memory says card 1005 is Baniya Rentals Amex and should be ignored. Without a place to record "not ours", that card would reopen the accounts list after every report.
Stakes if we pick wrong: the same rejected account comes back to you every month, and you learn to ignore the card.
Recommendation: A because it is written once and every member of the job sees it, where a member's own memory is private and another member would raise the same card again.
Completeness: A=9/10, B=4/10
Pros / cons:
A) Add Not ours (recommended)
  ✅ One tap on the card, and no member raises that item for that list again
  ✅ Shared by the whole job: a new hire in Finance sees "Not ours: Amex 1005 (Baniya Rentals)" too
  ❌ One more button on the card and one more short list each member carries in context
B) Leave it to memory
  ✅ No new button, list or rule; the card stays as it is
  ✅ Works today for Oscar, whose memory already holds the card 1005 note
  ❌ Another member, or Oscar after his memory is tidied, raises it again and you get the card again
Net: A remembers your no for the whole job; B relies on each member remembering it.
<gstack-qid:plan-eng-review-foundation-not-ours>
Header: Not ours
Options:
A) Add Not ours (recommended)
Each seen item on the card has Add and Not ours; Not ours keeps it on the question's not ours list, members of the job see it, and a matching seen is dropped without reopening the list.
B) Leave it to memory
No not ours list; a rejected item is dropped once, and each member must remember not to send it again.

State: approved
Actual answer: A) Add Not ours (owner, D6, 2026-11-03)
Accepted scope: each seen item on a list card has Add and Not ours; Not ours keeps the item on that question's not ours list in foundations.json; every member of the job sees "Not ours: ..." in its section; a seen matching a not ours item is dropped without reopening the list.
History: none

### R7: How the app finds the reports that used a changed answer
Finding: 8, INFORMATIONAL, 7/10, design section 5, `src/main/hive.ts:467` (members already report through messages to Michael), research F4 (STALE 55.2%), Claude
Plan baseline: adopted part 5, "a report sends with it the foundation questions it relied on"; reopened because it depends on each member naming them correctly, which the research says not to rely on, and needs a new message field
Runtime evidence: a report is a "done" or "inform" message a member sends Michael; the hive log keeps each with its sender, subject and id (`src/main/hive.ts:3640`); nothing names the questions a report used
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 to R6 | approved | same | same |
| R7 which reports used an answer | none | the app counts every done or inform a member of a job using the question sent Michael in the last 60 days; one note to Michael per change lists them; no member step | each report carries a "foundations" field naming the questions it used; one note to Michael per change lists the reports that named it |
| 60 day window, Michael decides, nothing reruns | approved part 5 | same | same |
Question D7:
D7 — How the app finds the reports that used a changed answer
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: You approved that when an answer changes, Michael hears which recent reports relied on it and decides whether to redo them. As designed, each member names the questions every report used. Models do this unreliably, so the app could instead take every report from the members whose job uses that question.
Stakes if we pick wrong: a member that forgets to name the accounts list means October is never flagged for a redo once Amex is added.
Recommendation: A because the app knows each member's job and every report it sent, so nothing depends on a member remembering, and Michael still decides.
Completeness: A=8/10, B=7/10
Pros / cons:
A) App finds them by job (recommended)
  ✅ Nothing for members to do or forget: Oscar's October cash flow is always listed when the accounts list changes
  ✅ No new message field and no new step before each report
  ❌ Michael also sees unrelated reports from that job, such as an invoice reminder, and must skip them himself
B) Members name them
  ✅ Michael sees only the reports that actually used the answer, a shorter list
  ✅ The list says why each report is on it
  ❌ Relies on every member naming the questions in every report, which models do unreliably
Net: A is certain but wider; B is narrower but can miss the report that matters.
<gstack-qid:plan-eng-review-foundation-used-by>
Header: Used by
Options:
A) App finds them by job (recommended)
Every done or inform a member of a job using the question sent Michael in the last 60 days is listed in one note to Michael per change; no member step.
B) Members name them
Each report carries a "foundations" field naming the questions it used; Michael's note lists the reports from the last 60 days that named the changed question.

State: approved
Actual answer: A) App finds them by job (owner, D7, 2026-11-03)
Accepted scope: when a list answer changes or reopens, the app takes every "done" or "inform" message that a member whose job uses the question sent Michael in the last 60 days, from the hive log, and sends Michael one note per change listing them; members add nothing to their reports; Michael decides whether to redo any; nothing reruns by itself.
History: adopted part 5 had members name the questions (owner, 2026-11-03); reopened for the reliability finding above; replaced by this answer.

## Review sections

### 1. Architecture

```
            member answer (file, taught)             owner save on card, or Michael "complete": true
 empty ───────────────────────────────► known so far ───────────────────────────────► complete (as of a day)
   ▲                                       ▲   ▲                                          │
   │                                       │   └──── seen item (not on not ours list) ────┤
   │ (single questions: answered, as today)│                                              │
   │                                       └──── shelf life passed: "expired" hit ────────┤
   │                                       └──── question widened (version up) ───────────┘
   └── owner clears the answer
 every arrow: one history entry in foundations.json and one telemetry event (answered, changed, coverage, hit)
 known so far, and complete, with an open seen item or expired hit: Michael's existing card path (R5)
```

One owner of state: `src/main/foundations.ts` stays the only writer; coverage, versions, seen items,
not ours items, history and expiry all live in `foundations.json`. No new module, so the design
twice step does not apply (no new public surface).

Findings:
1. [CRITICAL] (confidence: 8/10) `src/main/foundations.ts:483-490`, `level()`. A seen item is text a
   member read in work data (a statement, an email) and every member of the job then carries it in
   context. The existing safeguard "Outside text goes through Michael" (office-foundations.md
   section 5) must cover it: a seen item needs a source; an office file goes in, outside or
   unverifiable text goes to Michael to check, as an answer does today; each item is one line,
   at most 120 characters. Required by the approved safeguard contract; no question.
2. [INFORMATIONAL] (confidence: 8/10) Two ways to do one task: for a list, "a member holding part
   sends a gap with that part in its line" (`src/main/hive.ts:467`) already says what the list
   lacks. Decided by the owner's rule (message shape is mechanics): seen is the gap message with an
   `item` field, `"foundation": {"question": "money", "gap": "...", "item": "Amex card", "source": ...}`,
   not a new message kind; `gap()` (`src/main/foundations.ts:503`) accepts it for a list that is
   known so far or complete instead of answering "is answered".
3. [INFORMATIONAL] (confidence: 8/10) Expiry needs a clock the app owns, not the weekly job's model
   run. Decided by rule: the app checks shelf lives at launch and on the existing fleet beat, at
   most once an hour, and records the expired hit itself; the weekly check only brings cards back.
4. [INFORMATIONAL] (confidence: 7/10) Failure: `foundations.json` unreadable reads as empty and keeps
   a copy (`src/main/foundations.ts:177-182`); with history in it, a broken file now loses history
   too until the copy is restored. Same recovery as today; noted, no change.

Dispositions: 1 accepted (required by the approved safeguard); 2 and 3 decided by the owner's
rule; 4 noted.

### 2. Code quality

1. [INFORMATIONAL] (confidence: 8/10) `src/shared/foundations.ts:43-70`. The catalog gains `kind`
   (list or single), `version` and `shelfDays` per question, so the catalog stays the one place
   that drives record, document, sections and count (the file's own rule, line 4).
2. [INFORMATIONAL] (confidence: 8/10) `src/shared/foundations.ts:275`, `sectionFor`. "Empty now"
   lists only questions with no answer; members must also see "Partly known now: money" and the
   not ours lines, or the approved part 1 behavior never reaches them. Required implementation.
3. [INFORMATIONAL] (confidence: 8/10) `src/main/config.ts:107-121`. The Foundations check focus
   changes; the old text goes on `FOUNDATIONS_CHECK_BUILT_IN_FOCUSES` so offices on the shipped
   text get the new one at launch and an owner's own text stays (the existing pattern).
4. [INFORMATIONAL] (confidence: 7/10) `src/shared/foundations.ts:205`, `cleanRecord`. It drops
   unknown fields, so coverage, version, seen, not ours and history must be read there, or the
   first save after upgrade erases them. Required implementation.

Dispositions: all four are required implementation of approved parts; no question.

### 3. Tests

Framework: node's test runner, `npm test` (`test/*.test.cjs`); 46 tests in
`test/foundations.test.cjs` cover today's behavior.

```
CODE PATHS                                              USER FLOWS
[+] shared/foundations.ts                               [+] Owner answers a list card
  ├── catalog kind, version, shelfDays  [GAP]             ├── [GAP] Save marks complete as of today
  ├── cleanRecord new fields            [GAP]             ├── [GAP] Not ours keeps an item, a later seen is dropped
  ├── sectionFor partly known, not ours [GAP]             └── [GAP] [→E2E] card shows known items, Add and Not ours
  └── replay with coverage events       [GAP]           [+] A member works on a list
[+] main/foundations.ts                                   ├── [GAP] file answer saves known so far, gap still taken
  ├── handle answer on a list           [GAP]             ├── [GAP] seen from an office file adds an item, reopens complete
  ├── gap with item (seen)              [GAP]             └── [GAP] seen from outside text goes to Michael
  ├── Michael "complete": true          [GAP]           [+] Time and change
  ├── widened version reopens           [GAP]             ├── [GAP] shelf life passed: expired hit, card raised once
  ├── expiry check, once an hour        [GAP]             ├── [GAP] upgrade: owner answers complete as of upgrade day
  ├── reports by job note (60 days)     [GAP]             └── [GAP] answer change: one note lists the job's reports
  └── single questions as today         [★★★ TESTED] foundations.test.cjs:96-411
LLM: member and Michael rules change (hive.ts:425, 467) [→EVAL] none exists in this repo; pinned as source text, as today
COVERAGE: 1/24 paths tested  |  GAPS: 23 (1 E2E)
```

Regression contract (carried from R1, "the other 18 questions stay single and close when answered,
as today"): every existing test on a single question passes unchanged. Tests that use a list id
(`offer` 6 times, `competitors` 10, `current_customers`, `money`, `owed` once each) to show
closing behavior move to a single id, with a list test added beside each; no assertion is dropped.

Proposed tests, all in `test/foundations.test.cjs` (unit), each with its value card in the test
plan artifact: list coverage and the regression above; owner save and Michael complete; member
file answer stays known so far and takes gaps; seen with item from a file, from outside, and
matching not ours; widened question; expiry hit once per shelf life; upgrade migration; Pulse
replay of coverage events; reports by job note; instruction text pins for hive.ts and config.ts.
One E2E-worthy flow (the list card) is checked live at /qa; no E2E harness drives the card today.

Dispositions: all proposed tests are required proof of approved parts; no question.

### 4. Performance

1. [INFORMATIONAL] (confidence: 7/10) `src/main/hive.ts:6006`, `logTail(n, kind, since)`. The reports
   note reads the hive log since 60 days ago on each list change; `log.jsonl` in the reference
   office is 2.3 MB [measured: ls, 2026-11-02]. Changes are rare (owner saves, seen items), so one
   ranged read per change is fine; the note lists at most 20 reports, newest first. Decided by rule.
2. [INFORMATIONAL] (confidence: 7/10) Every member of a job carries seen and not ours lines on every
   turn. Decided by rule: at most 10 of each per question in a section, each one line of at most
   120 characters, so a section grows by at most about 2.4 KB per list in the worst case [estimated].

Dispositions: both decided by the owner's rule.

### Outside voice (Codex on DeepSeek V4 Pro, `deepseek-review` profile, read only)

Pass 1 ran out of its 5 minutes while still reading code (44 reads, no answer); pass 2, with a
reading budget, completed. Its findings, each checked against the code:

1. Critical, confirmed. `src/main/pulse.ts:139` keeps only `answered|changed|cleared|hit` events, and
   the record fallback at `src/main/pulse.ts:145-151` re-adds every present answer as answered, so a
   known so far list would still count. Required implementation of R3: Pulse accepts the coverage
   event, and the fallback skips a list answer that is not complete.
2. Critical, confirmed in part. Reusing the `hit` telemetry event for expiry would mix into the
   proof, which reads member hits (`src/main/pulse.ts:155-162`); replay already drops a hit with
   no member (`src/shared/foundations.ts:330`). Also `michaelFoundations`
   (`src/shared/foundations.ts:283`) lists only hits with no answer, so an expired list, which
   still has its answer, would never reach Michael. Required implementation of R5: the record
   keeps the hit with `reason: "expired"` and no member; telemetry writes a separate `expired`
   change; Michael's list and the members' "Partly known now" line include any list that is not
   complete and has a hit or a seen item.
3. High, already accepted. "Done or inform sent Michael" includes every finish, so the note is wide;
   the owner chose this over member naming in D7, with that con stated. Decided by rule within
   D7: app upkeep replies (closing time acknowledgements, replies to the app's own notes) are left
   out, and the note lists at most 20, newest first.
4. Medium, confirmed. Not ours matched on raw text fails when next month's line reads differently.
   Decided by rule within D6: a seen `item` names the thing (an account, a tool, a supplier),
   never an amount or date; the app matches items and not ours entries on a normalized key
   (lower case, punctuation and extra spaces removed, digits kept); members see the not ours
   lines in their section and are told not to send what is on them.

Cross-model tension: none left open. Findings 1 and 2 are code that the approved R3 and R5
require; 3 and 4 are mechanics inside the approved D7 and D6. No new owner question.

## TODO decisions

### R8: TODO, a history view for the owner
Finding: TODO from adopted part 6 ("a history view for the owner comes later"), Claude
Plan baseline: part 6 keeps every past answer; the view is later
Runtime evidence: no screen shows past foundation answers; Settings has no foundations form (office-foundations.md, NOT in scope)
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R8 history view | later, untracked | TODOS.md entry | not tracked | built in this change |
| R1 to R7 | approved | same | same | same |
Question D8:
D8 — Track the foundation history view as a TODO
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: Part 6 keeps every past answer, but you said the screen to see them comes later. A TODO entry keeps that later work from being forgotten; building it now makes this change bigger.
Stakes if we pick wrong: the history is kept but nobody can see it, so a wrong change to the accounts list cannot be spotted or put back from the app.
Recommendation: A because the history is useful only once you can see it, and it belongs with the owner's foundations form, which is already later work.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Add to TODOS.md (recommended)
  ✅ Written down with what, why and where to start, next to the other foundations TODOs
  ✅ This change stays its approved size; the history is kept from day one, so nothing is lost
  ❌ Until it is built, seeing a past answer means asking Michael
B) Skip
  ✅ No entry to keep up; the history file is there if anyone looks
  ✅ Nothing new to plan now
  ❌ The view is likely forgotten, so the history you approved is never used
C) Build it now
  ✅ You can see and put back a past answer as soon as this ships
  ✅ No second change later for the same area
  ❌ A new screen with its own design and tests (human: ~2 days / CC: ~1 hour more)
Net: A tracks it for later at no cost now; C makes this change bigger.
<gstack-qid:plan-eng-review-todo-foundation-history-view>
Header: History view
Options:
A) Add to TODOS.md (recommended)
A TODOS.md entry for a screen showing each foundation answer's past versions, who changed it and when, with a way to put one back.
B) Skip
No entry; the history is kept in foundations.json with no view.
C) Build it now
The history view is built in this change.

State: approved
Actual answer: A) Add to TODOS.md (owner, D8, 2026-11-03)
Accepted scope: one TODOS.md entry under Company foundations for the history view; nothing built in this change.
History: none

### R9: TODO, comparing connector data against a list with no model judgment
Finding: TODO from adopted part 4 ("comparing connector data with no model judgment stays a later, separate decision") and research F4, Claude
Plan baseline: part 4 relies on members sending seen; the deterministic check is later
Runtime evidence: QuickBooks is connected read only in the reference office (Oscar's memory m1); no code compares connector data with foundations
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R9 connector list check | later, untracked | TODOS.md entry | not tracked | built in this change |
| R1 to R8 | approved | same | same | same |
Question D9:
D9 — Track the connector list check as a TODO
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: Seen depends on a member noticing something missing. Where a connector already lists things, such as the bank and card accounts in QuickBooks, the app could compare that list with the foundations answer itself, with no model deciding. You said that would be a later, separate decision.
Stakes if we pick wrong: an account that is in QuickBooks but never shows up in the statements a member reads is never noticed.
Recommendation: A because it is the most reliable trigger the research found, but it needs its own design per connector, so it should not grow this change.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Add to TODOS.md (recommended)
  ✅ Kept for the separate decision you asked for, with QuickBooks accounts as the first case
  ✅ This change stays its approved size and ships the seen path first
  ❌ Until then, an account only a connector knows about is noticed only if a member happens to look
B) Skip
  ✅ No entry; seen and the 90 day check cover most changes
  ✅ No connector specific code to keep up later
  ❌ The most reliable check the research found is dropped without a decision
C) Build it now
  ✅ QuickBooks accounts are compared with the money list from day one
  ✅ No model judgment for that check at all
  ❌ A connector specific path with its own permissions and tests (human: ~3 days / CC: ~2 hours more)
Net: A keeps the strongest check for its own decision; C grows this change.
<gstack-qid:plan-eng-review-todo-connector-list-check>
Header: Connector check
Options:
A) Add to TODOS.md (recommended)
A TODOS.md entry for the app comparing a connector's own list (first: QuickBooks bank and card accounts) with a foundations list answer and raising a seen item for anything missing.
B) Skip
No entry; lists reopen only by seen, a reword or expiry.
C) Build it now
The QuickBooks accounts comparison is built in this change.

State: approved
Actual answer: other, "i would like to build it but it should not be only specific to specific app such as quickbook" (owner, D9, 2026-11-03)
Accepted scope: build the connector list check in this change, working for any connector, not one specific app; how it works is R10.
History: none

### R10: How the connector list check works for any connector
Finding: from the D9 answer, Claude
Plan baseline: R9, build now, generic across connectors
Runtime evidence: MCP connectors (QuickBooks, HubSpot, mail) run only inside a member's Claude Code session, so main cannot call them; custom REST connections with a saved call can be called through the broker (`src/main/integrationBroker.ts:6`, `POST /call/<id>`), but answers are free form; a recurring job needs its how in the member's Work style (owner rule, 2026-10-11)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 to R9 | approved | same | same |
| R10 how the list is read | none | the member whose job uses the list, and whose connectors hold such a list, reads it on a schedule from any connector it has and sends the names it found in one "listed" message; the app alone compares each name with the answer, seen and not ours items on normalized keys and raises a seen item for each one missing | the app reads it itself, only through custom REST saved calls that return the list, and compares; MCP connectors such as QuickBooks are left out |
| Who judges what is missing | member (seen) | the app, on normalized names | the app, on normalized names |
| Cadence | none | monthly, as a job in Schedules the owner can change | monthly, app timer |
Question D10:
D10 — How the connector check reads the list from any connector
Project/branch/task: foundation answers that can be questioned again, on mit/october-cash-flow-discrepancy-b32468.
ELI10: You want the check for any connector, not only QuickBooks. The app itself cannot call most connectors: QuickBooks, HubSpot and mail run inside a team member's session. So either the member fetches the list on a schedule and hands the app plain names, and the app does the comparing, or the app fetches it alone, which works only for custom REST connections.
Stakes if we pick wrong: either the check covers only custom REST connections and misses QuickBooks, or it leans on a member for the fetch.
Recommendation: A because it works with every connector a member has today, and the part that decides what is missing stays in the app, where no model judges it.
Completeness: A=9/10, B=5/10
Pros / cons:
A) Member fetches, app compares (recommended)
  ✅ Works with any connector a member has: QuickBooks, HubSpot, a bank feed, a custom REST connection
  ✅ The app alone decides what is missing, on plain names, so a member cannot talk an item away
  ❌ The fetch is still a member's step, so a member that fetches the wrong list makes a wrong comparison
B) App fetches, custom REST only
  ✅ No model anywhere: the app calls, reads and compares
  ✅ Runs even when the member is busy or stopped
  ❌ QuickBooks, HubSpot and mail are left out, so for this office it checks nothing today
Net: A covers every connector with the app judging; B removes the model but covers only custom REST.
<gstack-qid:plan-eng-review-foundation-connector-check-how>
Header: Check how
Options:
A) Member fetches, app compares (recommended)
A monthly job in Schedules has the list's member read the list from any connector it holds and send the names in one "listed" message; the app compares them with the answer, seen and not ours items and raises a seen item for each one missing.
B) App fetches, custom REST only
The app calls a custom REST saved call that returns the list each month and compares it itself; connectors that run in a member's session are not checked.

State: approved
Actual answer: other, "skip this comparision as it may not be possible to pull data like this for all kind of situations or apps." (owner, D10, 2026-11-03)
Accepted scope: no connector list check, built or tracked. Lists reopen by seen, a widened question or expiry only. R9's "build it now" is superseded by this answer.
History: R9 had "build it now, for any connector" (owner, D9); replaced by this answer.

Approval readiness: PASS. Checked R1 (D1 A), R2 (D2 A), R3 (D3 A), R4 (D4 A), R5 (D5 A),
R6 (D6 A), R7 (D7 A), R8 (D8 A), R9 (D9 other, superseded by D10), R10 (D10 other, skip). Every
other accepted change cites the approved part it implements or the owner's standing rule for
small mechanics.

## Review outputs

### What the review changed in the design

These replace the matching lines in sections 1 to 6 above; build from these.

- Lists (R1): offer, current_customers, competitors, money, owed, team, tools, suppliers. The other
  18 questions stay single and close when answered, as today.
- Complete (R2): an owner save on a list card (typed, file or folder) or That's all of them; Michael
  only with `"complete": true` when the owner said it is the whole list.
- Count (R3): a known so far list counts as missing, named "(partly known)"; coverage changes write
  a telemetry event; Pulse accepts it and its record fallback skips lists that are not complete.
- Shelf lives (R4): money 90 days, tools 90 days, team 180 days; nothing else expires.
- Expired lists (R5): the record keeps a hit with `reason: "expired"` and no member, telemetry writes
  an `expired` change, Michael raises one normal card per list; the app checks at launch and at most
  hourly on the fleet beat.
- Seen (section 4, R6, outside voice 4): sent as a gap with an `item` naming the thing, never an
  amount or date; needs a source like an answer, outside text goes to Michael; kept as a separate
  list, never merged into the answer text; Not ours keeps rejected items, matched on a normalized
  key; at most 10 seen and 10 not ours lines per question in a section, 120 characters each.
- Reports (R7): every done or inform from a member whose job uses the list, from the last 60 days,
  less app upkeep replies, at most 20 in one note to Michael per change.
- Rollout: member list answers become known so far; owner list answers become complete as of the
  upgrade day; money answers from before 2 Nov are known so far.
- Not built: the connector list check (R10).

### Reality rows

| premise | claim | receipt | verdict |
|---|---|---|---|
| Oscar's money answer came from a file | source file, Records-Log.md, 2 Nov 05:06Z | `~/HarnessAgents/private/foundations.json` answers.money | true |
| A gap on an answered question is refused | "is answered" reply | `src/main/foundations.ts:506` | true |
| A card holds one question | one foundation id per ask | `src/shared/foundations.ts:392` | true |
| Michael raises cards only for hit questions | rule text | `src/main/hive.ts:425` | true |
| Pulse ignores unknown event kinds and re-adds present answers | filter and fallback | `src/main/pulse.ts:139`, `:145-151` | true |
| Oscar was told card 1005 is not the business's | memory m14 | `~/HarnessAgents/hive/agents/oscar/memory.md` | true |
| Main cannot call MCP connectors | they run in member sessions | `src/main/integrationBroker.ts:6` (only custom REST is brokered) | true |

REALITY: premise-table pass 7 premises, unverified=0 docs/designs/foundation-answers-stay-open.md:1
REALITY: already-done pass origin/main has no change to the foundations files since 2026-11-02 src/main/foundations.ts:1
REALITY: surface-check pass the routes named (foundations hive route, POST /call/<id>) exist src/main/hive.ts:3977
REALITY: binding-decisions finding three office-foundations.md rules changed by the owner here (work hit only, one card per question, count) docs/designs/office-foundations.md:221
REALITY: numbers pass log size [measured: `ls -la ~/HarnessAgents/hive/log.jsonl`, 2,288,542 bytes, 2026-11-02] src/main/hive.ts:6006; section growth [estimated: 20 lines of 120 characters] src/shared/foundations.ts:267
REALITY: deferred-asks pass no linked issue docs/designs/foundation-answers-stay-open.md:1
REALITY: pr-count pass one PR, the running branch docs/designs/foundation-answers-stay-open.md:1

### NOT in scope

- The connector list check: the owner skipped it (D10), since not every app or situation can give
  a list to compare.
- A screen showing past answers: TODOS.md (D8); the history is kept from the first build.
- Combined expiry card: one normal card per list instead (D5).
- Members naming the questions a report used: the app finds them by job instead (D7).
- Judging whether a widened wording is wider: whoever edits the question in code decides.

### What already exists

- One writer and its safeguards: `Foundations.handle`, `level()`, `gap()`, `withAnswer()`
  (`src/main/foundations.ts:427-523`), reused for answers, seen items and coverage.
- Michael's card path and the weekly Foundations check (`src/main/hive.ts:425`,
  `src/main/config.ts:102-130`), reused for seen and expired lists.
- The card's Save, add a file, add a folder and Not now (`FoundationCard.tsx`), extended with known
  items, seen items, Add, Not ours and That's all of them.
- Pulse's replay of foundation events (`src/main/pulse.ts:129`), extended with coverage and expired.
- The hive log reader `logTail(n, kind, since)` (`src/main/hive.ts:6006`) for the reports note.

### Failure modes

| path | realistic failure | handled by | user sees |
|---|---|---|---|
| seen from a bank statement | an outside line carries instructions | source check, outside text to Michael, one line, 120 characters | Michael's check, nothing silent |
| expiry | app closed for months | check at launch | the card after launch |
| expired card | Michael does not raise it | weekly check brings each hit back | the card a week later |
| not ours | next month's line names it differently | normalized key, member told what is on the list | the card again, visible |
| Pulse | coverage event missing | test on replay and fallback | wrong count, caught by test |
| reports note | hive log read fails | error logged, no note | no note to Michael (logged) |
| foundations.json | file unreadable | copy kept beside it, as today | answers and history reset until restored |

Critical gaps: 0.

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Catalog and record | src/shared/ | — |
| Writer, expiry, reports note | src/main/ (foundations) | Catalog and record |
| Rules and weekly focus | src/main/ (hive, config) | Catalog and record |
| Pulse | src/main/ (pulse), src/shared/ | Catalog and record |
| Card, IPC, locales | src/renderer/, src/preload/, src/main/ (index) | Writer |

Lane A: catalog and record → writer → card (shared types, sequential). Lane B: rules and weekly
focus, and Pulse, after the catalog. Conflict flag: `src/main/index.ts` and `src/shared/foundations.ts`
are touched by several steps; the running branch keeps one writer at a time, so build sequentially.

### Unresolved decisions

None.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above. Run
with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — catalog — add kind, version and shelfDays per question
  - Surfaced by: R1, R4, Code quality 1
  - Files: src/shared/foundations.ts
  - Verify: `node --test test/foundations.test.cjs`
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** — record — coverage, version, seen, not ours and history, read by cleanRecord, with the rollout rules
  - Surfaced by: Scope finding 9, Code quality 4, part 6
  - Files: src/shared/foundations.ts, src/main/foundations.ts
  - Verify: upgrade test from today's record shape
- [ ] **T3 (P1, human: ~1d / CC: ~45min)** — writer — list answers known so far, owner and Michael complete, seen as gap with item and source, not ours, widened reopen, history entries, coverage and expired events
  - Surfaced by: R2, R6, Scope finding 1, Architecture 1 and 2, outside voice 2 and 4
  - Files: src/main/foundations.ts, src/main/hive.ts (route passes "complete" and "item")
  - Verify: `node --test test/foundations.test.cjs`
- [ ] **T4 (P1, human: ~3h / CC: ~15min)** — expiry — check shelf lives at launch and at most hourly on the fleet beat, record the expired hit
  - Surfaced by: R5, Architecture 3
  - Files: src/main/foundations.ts, src/main/index.ts
  - Verify: clock driven test
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** — sections — "Partly known now", seen and not ours lines with caps, Michael's list includes not complete lists with a hit or seen
  - Surfaced by: Code quality 2, Performance 2, outside voice 2
  - Files: src/shared/foundations.ts
  - Verify: section text test
- [ ] **T6 (P1, human: ~2h / CC: ~10min)** — Pulse — accept coverage and expired events; the fallback skips lists that are not complete; "(partly known)" in missing
  - Surfaced by: R3, outside voice 1
  - Files: src/main/pulse.ts, src/shared/foundations.ts
  - Verify: Pulse replay test
- [ ] **T7 (P1, human: ~3h / CC: ~15min)** — rules — members send seen as a gap item and honor not ours; Michael's complete flag, expired cards and the reports note; new weekly focus with the old one on the built in list
  - Surfaced by: parts 1 to 5, R2, R5, Code quality 3
  - Files: src/main/hive.ts, src/main/config.ts
  - Verify: instruction text pins
- [ ] **T8 (P1, human: ~3h / CC: ~15min)** — reports note — on a list change, one note to Michael with the job's done or inform reports from 60 days, upkeep left out, at most 20
  - Surfaced by: R7, Performance 1, outside voice 3
  - Files: src/main/foundations.ts, src/main/index.ts
  - Verify: note test with a seeded hive log
- [ ] **T9 (P1, human: ~1d / CC: ~45min)** — card — known items, seen items with Add and Not ours, That's all of them; IPC and preload; three locales, no dashes
  - Surfaced by: parts 1 and 4, R2, R6
  - Files: src/renderer/src/components/FoundationCard.tsx, src/main/index.ts, src/preload/index.ts, src/renderer/src/i18n/locales/*.json
  - Verify: card test pins and a live look at /qa
- [ ] **T10 (P1, human: ~1d / CC: ~45min)** — tests — the regression contract and every proposed test in the test plan
  - Surfaced by: Test review
  - Files: test/foundations.test.cjs
  - Verify: `npm test`
- [ ] **T11 (P2, human: ~1h / CC: ~10min)** — docs — office-foundations.md sections 4, 5 and 9 point here; FEATURES.md and ship notes (carried from the saved call review, 20261103T000418Z-77975/T6)
  - Surfaced by: binding-decisions reality row
  - Files: docs/designs/office-foundations.md, docs/FEATURES.md
  - Verify: read through

### Completion summary

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 4 issues found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 23 gaps identified
- Performance Review: 2 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 2 items proposed to user (1 added, 1 skipped)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: Codex on DeepSeek V4 Pro, completed on pass 2 (pass 1 timed out at 5 minutes)
- Parallelization: 2 lanes, built sequentially on the running branch
- Lake Score: 0/6 (no option scored 10/10)

### Suppressed findings

None.

## Design review (2026-11-03)

Target: the list card on Needs you (`src/renderer/src/components/FoundationCard.tsx`, spec in
`branding/DESIGN.md` §7.27a) and the "(partly known)" line on Pulse. Initial rating 3/10: the plan
said what the card holds, never how it looks or behaves. Focus: all seven passes (owner, D1).
Outside voice: an independent Claude reviewer (owner, D3; Codex stays for adversarial passes),
12 findings, all checked against the card code and the mockup.

### Owner decisions

| # | Decision | Answer |
|---|---|---|
| D2 | Layout | Variant A: one editable box holding the list, seen rows below it, one primary button |
| D4 | A seen item not yet decided | Each seen row has Add, Not ours and Decide later; Save waits until every row has one of the three |
| D4 follow up | Decide later | The item stays open; with any item put off, the button reads "Save the list so far", saves the other changes, keeps the list known so far, and the card comes back in a week with just those items |
| D5 | List length | List answers hold up to 1,000 characters; single questions keep 300; a counter shows within 40 characters of the cap |
| D6 | Have a member draft it | Shown only while the list is empty; with items known, members grow it through seen items |
| D7 | Not ours timing | Saved on tap, with an Undo line on the card until the card leaves the board |

Decided by the owner's rule for small mechanics (from the outside reviewer's findings 2, 5 and
7 to 12): listed in the card spec below.

### The list card (to copy into branding/DESIGN.md as §7.27b at build)

```
 ┌ Every place money comes in and goes out, and where each is recorded ──────┐
 │ [Oscar] needs this, 2h ago          (expired: "Confirmed 3 Feb, 90 days ago")│
 │ **Oscar saw a card that isn't on your accounts list.**   (expired: "Still the full list?")
 │ The list so far, from Oscar                                                  │
 │ ┌ box: one item per line, up to 1,000 characters ───────────────────────────┐│
 │ └───────────────────────────────────────────────────────────────────────────┘│
 │ Saving says this is the whole list.          Add a file   Add a folder       │
 │ Seen, not on the list (i)                                                    │
 │ ┌ amber-soft row ───────────────────────────────────────────────────────────┐│
 │ │ Card ending 1005                                                          ││
 │ │ Oscar · [statement chip] · 23 Oct                                         ││
 │ │ [Add]  Not ours  Decide later                                             ││
 │ └───────────────────────────────────────────────────────────────────────────┘│
 │ Show 2 more                                                                  │
 │ [Save as the whole list]  [Have Oscar draft it: only when empty]    Not now  │
 │ ───────────────────────────────────────────────────────────────────────────  │
 │ Finance uses this                              Asked weekly until answered   │
 └──────────────────────────────────────────────────────────────────────────────┘
```

Hierarchy: the question, then the raiser chip and age, then the evidence line, then the box with
its hint and file links directly under it, then the seen rows, then the actions and the footer.

- **Box**: the label reads "The list so far" ("The list so far, from Oscar" when a member filled
  it; "Your answer" on an empty list). It starts from the saved answer, each item on its own line;
  on save the lines join as one line with "; ". While the record has not loaded the box is read
  only and Save is off. A draft kept from earlier in the session is used only if the saved answer
  has not changed since; otherwise a polite line reads "The list changed since you started.
  Review it before saving." A file or folder answer shows as its `neutral-soft` chip above the box
  and stays unless removed with ×; the box holds the words around it.
- **Hint**: "Saving says this is the whole list." stays visible under the box (the one short
  visible line the less verbose rule allows for a choice a new owner can't read); while a seen row
  is undecided it reads "Add, mark Not ours or Decide later for each seen item first."; within 40
  characters of the cap a counter "960 of 1,000" shows in `ink-3`.
- **Seen rows**: `amber-soft`, `r-lg`, newest first, three shown then a quiet "Show N more". The
  name in 12.5 px semibold, clamped to two lines with the full text as its title, `dir="auto"`. The
  source line is built by the app, never model text: the member's name, the source file as a file
  chip, and the day the app recorded it, in `amber-text` 11 px. Buttons: Add (secondary, 26 px
  high), Not ours and Decide later (quiet links, 24 px targets).
  - **Add** puts the name (never the source line) on a new line in the box; the row becomes a
    `green-soft` line "Added to the list. Save to keep it." with Undo, which removes that line if
    unedited and otherwise only reopens the row. The added state is kept with the card's draft so
    Not now and a remount keep it. Save sends the added items' ids, and the writer clears exactly
    those.
  - **Not ours** is saved at once (D7): the row becomes an `indigo-soft` status line "Card ending
    1005 is marked not ours." with Undo, a real reverse, until the card leaves the board; a failure
    is a `coral-text` line "Couldn't mark it not ours, try again." and the row stays.
  - **Decide later** is saved at once: the row becomes a quiet line "Back next week." with Undo.
- **Evidence line**: one seen item from one member, "Oscar saw a card that isn't on your accounts
  list."; several, "Oscar and Ryan saw 4 things not on your list."; an expired list with no seen
  item, "Still the full list?"; a seen item wins over expiry.
- **Primary button**: "Save as the whole list"; "Save the list so far" while any item is put off;
  "Still all of them" on an expired card whose box matches the saved answer. It never truncates.
  "That's all of them" is not used. Cmd or Ctrl+Enter saves under the same rules.
- **Have a member draft it**: only while the list is empty (D6); its draft fills the box and the
  label reads "drafted by Oscar, check it's all of them, then save" in `indigo-text`.
- **Board line after save**: "Saved as the whole list.", "Saved the list so far.", or, when the write
  falls back to Michael, "Sent to Michael to save as the whole list." (his message carries
  `"complete": true`, or not, to match).
- **(i) by "Seen, not on the list"**: a 24 px button named "About seen items", a popover on click or
  focus, Escape closes: "Things the team's work turned up that aren't on this list. Add puts one on
  it; Not ours tells the team to ignore it; Decide later brings it back next week."
- **Pulse**: a known so far list counts as missing and its name in the missing line carries
  "(partly known)" in `ink-3`, the same 11 px as the line.

### Pass 1: Information architecture, 4/10 → 9/10

The order above, decided by rule (outside reviewer finding 9: the hint and file links belong to the
box, so they sit right under it). Not 10: the order of seen rows across members is newest first by
rule, not tested with real data.

### Pass 2: Interaction states, 3/10 → 9/10

```
 FEATURE         | LOADING                 | EMPTY                       | ERROR                              | SUCCESS                           | PARTIAL
 ----------------|-------------------------|-----------------------------|------------------------------------|-----------------------------------|---------------------------------
 List box        | read only, Save off      | "Your answer", Draft shown   | "Couldn't save, try again."        | board: "Saved as the whole list." | "Save the list so far" (D4)
 Seen row Add    | n/a (local)             | no seen section             | n/a                                | green line with Undo              | Save held until each row decided
 Seen Not ours   | button held             | n/a                         | "Couldn't mark it not ours, try again." | indigo line with Undo        | n/a
 Decide later    | button held             | n/a                         | "Couldn't put it off, try again."  | "Back next week." with Undo       | list stays known so far
 Expired card    | as list box             | n/a                         | as list box                        | "Still all of them" saves         | seen item wins the evidence line
 Long list       | n/a                     | n/a                         | over the cap: counter turns coral, Save held | n/a                        | counter within 40 characters
```

Not 10: a member's draft arriving while the owner edits shows only the "list changed" line, not a
merge.

### Pass 3: User journey, 4/10 → 9/10

```
 STEP | OWNER DOES                          | OWNER FEELS                 | PLAN SPECIFIES
 -----|-------------------------------------|-----------------------------|------------------------------------------
 1    | Sees "Oscar saw a card that isn't…" | curious, a little wary      | evidence line names who and what
 2    | Reads the list so far               | oriented                    | box from the saved answer, from Oscar
 3    | Checks the seen row's source        | able to judge               | member, statement chip, day
 4a   | Knows it: taps Add                  | in control                  | green line, Undo, item in the box
 4b   | Not the business's: Not ours        | relieved it won't come back | indigo line, Undo, the team ignores it
 4c   | Needs to check mail: Decide later   | not rushed                  | "Back next week.", list stays open
 5    | Saves                               | done for now                | button says what it means; board line
 6    | A week later, the put off item      | reminded, not nagged        | the card returns with only that item
```

5 seconds: one bold line says what happened. 5 minutes: three choices per item and one button.
Later: the list is trusted because it was checked item by item. Not 10: the week for Decide later
is fixed, not chosen per item.

### Pass 4: AI slop, 8/10 → 9/10

Operate surface. No hard rejection: the card is the interaction, not a decorative grid; no
gradients, icon circles or centered text. Litmus: one job per section yes, cards necessary yes,
premium without shadows yes (the card keeps the existing hairline and soft shadow). The amber
rows are the one new accent and mean "needs a look" (§3.2). Not 10: the amber rows are not yet
checked against the coral "needs you" meaning on the same board.

### Pass 5: Design system, 5/10 → 9/10

Tokens named above: `amber-soft` and `amber-text` for seen rows, `green-soft` for added lines,
`indigo-soft` and `indigo-text` for not ours and drafted, `neutral-soft` file chips, `coral-text`
errors, `r-lg` rows, 26 px row buttons, 24 px minimum targets, the existing PixelButton primary
and secondary. The §7.27b text above goes into branding/DESIGN.md with the build. Not 10: the
DESIGN.md update lands only with the build.

### Pass 6: Responsive and accessibility, 2/10 → 8/10

- 320 px: Save never truncates; Draft wraps to its own line before Not now; checked with "Have
  Maximilian draft it" and the Arabic labels.
- Arabic: names and source lines `dir="auto"`, the row's buttons mirror.
- Seen section is a list named "Seen, not on the list, 3 items"; buttons are named "Add Card
  ending 1005 to the list", "Card ending 1005 is not ours", "Decide later about Card ending 1005".
- Focus: box, hint links, seen rows (Add, Not ours, Decide later), Show more, Save, Draft, Not now;
  after Add, Not ours or Decide later, focus moves to the next undecided row's Add, else to Save.
- Status lines are polite live regions; failures are alerts, as today.
- New strings in en, ar and zh-CN, no dashes.

Not 10: no screen reader pass on the real card yet; that is the /design-review after the build.

### Pass 7: Unresolved design decisions

```
 DECISION NEEDED                         | STATUS
 ----------------------------------------|----------------------------------------------
 Save with undecided seen items          | decided, D4 and follow up
 List length                             | decided, D5
 Draft on a list with items              | decided, D6
 Not ours timing and undo                | decided, D7
 Layout                                  | decided, D2
 Undo after the card leaves the board    | through Michael until the history view (TODOS.md, eng D8)
```

7 resolved, 0 deferred.

### What already exists

The card's question, chip, evidence line, labeled box with its hint as description, file and
folder links, Save, Draft, Not now and footer (`FoundationCard.tsx:187-271`), PixelButton
primary and secondary, the `cth-input` box, FileText file chips for the source line, and the
polite board line after a save.

### NOT in scope

- A merge view when a member's draft arrives mid edit: the "list changed" line only.
- Choosing the Decide later delay per item: one week, like Not now.
- Undo after the card has left the board: through Michael until the history view (TODOS.md).

### Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Foundation list card | /Users/moblizeit/.gstack/projects/agentvivekkumar-dontbemichael/designs/foundation-list-card-20261103/list-card-variants.html | Variant A, one box, one Save | HTML and CSS with the app's tokens (owner's rule); the review added Decide later, the hint under the box and the three-rows limit |

### Design implementation tasks

- [ ] **D-T1 (P1, human: ~1d / CC: ~45min)** — card — the list card per §7.27b: box from the saved answer, hint and counter, seen rows with Add, Not ours and Decide later, the button labels, Draft only when empty, the board lines
  - Surfaced by: D2, D4, D5, D6, outside reviewer 1, 2, 5, 8, 9, 10
  - Files: src/renderer/src/components/FoundationCard.tsx, src/renderer/src/shell/foundationSave.ts, src/renderer/src/i18n/locales/*.json
  - Verify: card source pins and a live look at /qa
- [ ] **D-T2 (P1, human: ~3h / CC: ~15min)** — writer — added ids clear exactly those seen items; Not ours and Decide later saved on tap with a reverse; list cap 1,000
  - Surfaced by: D4, D5, D7, outside reviewer 1 and 6
  - Files: src/main/foundations.ts, src/shared/foundations.ts, src/main/index.ts, src/preload/index.ts
  - Verify: `node --test test/foundations.test.cjs`
- [ ] **D-T3 (P1, human: ~2h / CC: ~10min)** — accessibility and narrow widths — names, focus moves, live regions, 320 px and Arabic
  - Surfaced by: Pass 6, outside reviewer 11 and 12
  - Files: src/renderer/src/components/FoundationCard.tsx
  - Verify: keyboard pass and 320 px look at /qa
- [ ] **D-T4 (P2, human: ~1h / CC: ~10min)** — spec — §7.27b in branding/DESIGN.md
  - Surfaced by: Pass 5
  - Files: branding/DESIGN.md
  - Verify: read through

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | branding/DESIGN.md v2 present; UI scope: the list card and one Pulse line |
  | Step 0               | 3/10; all seven passes (D1)                 |
  | Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 3/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 4/10 → 9/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 5/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 2/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed (history view already added in the eng review) |
  | Approved Mockups     | 1 generated (3 variants), 1 approved        |
  | Decisions made       | 5 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 2/10 → 8/10                                 |
  +====================================================================+
```

Unresolved decisions: none.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | Codex (`deepseek-review`) in `/plan-eng-review`; Claude subagent in `/plan-design-review` | Independent 2nd opinion | 3 | completed (eng); skipped by rule (design, Claude only) | eng: 4 findings, all confirmed; design: 12 findings from a native Claude reviewer, all taken |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | ISSUES OPEN | 33 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 2/10 → 8/10, 5 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** eng plan review: Codex on DeepSeek V4 Pro, completed on pass 2 with 4 findings. Design: Codex skipped by the owner's rule (Codex is for adversarial passes only); a native Claude reviewer ran instead, which is not outside coverage.
- **VERDICT:** DESIGN CLEARED. Eng review has its 33 issues mapped to tasks T1 to T11 and D-T1 to D-T4 with every decision approved; eng review required.

NO UNRESOLVED DECISIONS
