# Changes come back before they go out

Status: CEO review done and built (2026-11-04): house rule 10, Michael's example, docs and tests. Live check (T4) waits for the release.

## Problem (owner, 2026-11-04)

Screenshot: Dwight's card "Follow ups to the four HubSpot recommended deals", asking to approve a
final email to four companies for Wed 11 Nov 8am Central. Options: 1 "Approve, send Wed 11 Nov"
(recommended), 2 "Send with my changes" (box: "What should change?"), 3 "No, leave them".

The owner reads option 2 as: I say what to change, the agent changes it and sends it, and I never
see the changed version. The owner wants a clear way to ask for changes and review again before
anything is sent.

## What is true today (evidence)

| # | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | Michael's prompt gives `{"label": "Send with my changes", "note": "What should change?"}` as THE example of a noted option, so Michael copies it word for word. | `src/main/hive.ts:401` | verified |
| P2 | The live card's option 2 is that example verbatim. | `~/HarnessAgents/hive/tasks.json`, card `dwight-hubspot-recommended-followups-1028` | verified (live data, read only) |
| P3 | Dwight has a Send only grant on the owner's mailbox with Sending = Can send, and no mail proposals ever. So if the owner picks 2, Dwight edits the draft file and sends at 8am with no second look. The owner's reading is correct. | app `config.json` `agentCapabilities.dwight.sendOnly = {mailbox: vikram-moblize-it, sending: send}`; `mail-proposals.json` has 0 Dwight entries | verified |
| P4 | The same label means something else for a member on Send on approval: Kelly's GreenWorld card was answered "Picked: Send with my changes. Note: ..." (2026-10-28) and her next `propose` puts the new version on the app's email card, so the owner does see it again. The label's meaning depends on a setting the owner cannot see on the card. | `tasks.json` card `kelly-greenworld-dennis`; `config.json` kelly `sending: approval`; `docs/designs/send-on-approval.md` "Ask for changes" | verified |
| P5 | The app's own email card already does the right loop: Ask for changes opens a note, the member proposes a new version, the owner approves the exact text, and the broker sends only the stored approved text. | `docs/designs/send-on-approval.md` (Proposals, What the agent hears, The rule) | verified (design doc, static read) |
| P6 | The `note` field (2026-10-29) only makes the box ask a question and wait; it says nothing about what happens after. | `src/shared/askMeRouting.ts:196-200`; `docs/designs/ask-me-options.md:518-524` | verified |
| P7 | The same label is repeated in user facing docs and a test fixture. | `docs/FEATURES.md:314`, `docs/designs/original-email-view.html:102`, `test/ask-me-options.test.cjs:210-228` | verified |
| P8 | Not already fixed on main since the ask. | `git log origin/main --grep "Send with my changes"` returns only `fbcb7a5e` (the 2026-10-29 note fix) | verified |

unverified=0

Industry pattern (search, untrusted, cited): "request changes" goes back to the author and comes
back for a fresh review; an approval binds to the exact action, so a changed draft needs a new yes
([WorkOS](https://workos.com/blog/ai-agent-approval-policies-airlock),
[n8n](https://n8n.io/workflows/20885-draft-client-approved-email-replies-with-openai-and-email/),
[Lightfield](https://docs.lightfield.app/automations/how-for-review-works)).

## Premise (0A)

Real problem: an approval card that offers changes does not say whether the owner sees the changed
version, and today the answer silently depends on the member's Sending setting. For a Can send
member it is "no". Cost of doing nothing: the owner either approves something they have not read
(an email to four prospects goes out with edits nobody checked) or avoids option 2 and types a
free answer, which is the confusion in the screenshot. Every approval card Michael writes copies
the example, so this repeats on every outbound approval.

## Existing code leverage (0B)

| Sub problem | Reuse |
|---|---|
| Michael writes the option wording | `src/main/hive.ts:401` Ask me rule, one string |
| Box asks for the owner's words and waits | `note` on `AskOption`, `src/shared/askMeRouting.ts` (no change needed) |
| The answer reaches the raiser | existing routing: answer to Michael, Michael routes to the raiser (`hive.ts:401`) |
| Re-review of an email with exact text bound to the send | app email card and `mail-proposals.json` (send-on-approval.md) |

## Dream state (0C)

```
  CURRENT                         THIS PLAN                         12 MONTH IDEAL
  "Send with my changes":   --->  A change option always       ---> Every outbound approval is
  meaning depends on an           brings the new version back       one app card bound to the
  invisible setting; Can          for a new yes, whatever the       exact text (email, post,
  send members send unseen        Sending setting                   quote), with a diff of what
                                                                    changed since the last look
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| D1 (owner) approach | P1 to P7 | A: new example label "Change it, show me again"; rule that a change to outbound work comes back for a new yes, whatever Sending; members get the same line; docs, FEATURES, fixture wording; prompt text test | B (app stamp), C (app email card for all) declined | approved | Owner answer D1 = A, AskUserQuestion 2026-11-04. Scope: prompt rule for Michael and members, docs, fixture, prompt text test. No app enforcement. |
| MODE (owner) | Fix to existing behavior, about 5 files | HOLD SCOPE | | approved | Owner answer, mode question 2026-11-04 |
| D2 (owner) Send on approval second look | Section 1 and 4: P4, P5; `src/shared/mailProposals.ts:219` | A: the member's new proposal on the app email card is the second look; no extra Michael card | B (Michael card then app card) declined | approved | Owner answer D2 = A, AskUserQuestion 2026-11-04. Scope: rule text only. |

Approval readiness: PASS (D1 = A, owner answer 2026-11-04; D2 = A, owner answer 2026-11-04; MODE = HOLD SCOPE, owner answer 2026-11-04). Applied: rule text, example label, docs, fixture, prompt text tests only. Nothing from D1 B or C.

## Answered: D1 (owner, 2026-11-04: A)
Commitment comparison:

```text
Commitment                                   | Source/approval or pending | Current            | A                        | B                                  | C
Change option label Michael writes           | pending                    | Send with my changes| Change it, show me again | Change it, show me again           | Change it, show me again
Rule: a change to outbound work comes back   | pending                    | none               | Michael + members prompt | Michael + members prompt           | Michael + members prompt
App stamps the routed answer "show me again" | pending                    | no                 | no                       | yes, for any picked noted option   | yes
Email approvals move to the app email card   | pending                    | no                 | no                       | no                                 | yes, needs send-at time and batches
Docs, FEATURES, fixture wording              | pending                    | old label          | updated                  | updated                            | updated
Tests                                        | pending                    | fixture only       | prompt text test         | prompt test + answer stamp test    | + proposal scheduling tests
```

Question: D1 — D1: How should a "change it" answer on an approval card work? <gstack-qid:plan-ceo-review-approach>
Header: Approach
A) Prompt rule: changes come back (recommended)
Michael's Ask me rule gets a new example, "Change it, show me again", and a rule that any change to work going outside (an email, a post, a quote) comes back as a new card before it goes, whatever the Sending setting. Team members get the same line. Effort S (human ~2 hours / CC ~15 min), risk low, reuses the note field, verified by a prompt text test.
B) Prompt rule plus an app stamp
A, plus the app adds a fixed line to the answer it routes when the owner picks an option that has a note ("Show the owner the changed version before it goes out"), so the instruction does not rely on Michael's wording alone. Effort M (human ~1 day / CC ~40 min), risk medium: notes also ask for dates and names, so the stamp would fire on those too unless the option is marked.
C) Move email approvals onto the app email card
A, plus Michael and members must put every outbound email on the app's email card (propose) instead of a choice card with a drafts file, and the app learns send at times and batches of several emails. Effort XL (human ~1 to 2 weeks / CC ~1 day), risk high: needs Can send members moved to Send on approval, overlaps the deferred Approvals inbox TODO.

## Step 0 HOLD SCOPE checks (0G)

1. Complexity: about 6 files, no new classes or services. Under the limits.
2. Minimum change: `src/main/hive.ts:401` (Michael's example and routing rule), `HOUSE_RULES` in
   `src/main/hive.ts:283` (members, delivered by the existing house rules changed notice,
   `src/shared/houseRulesNotice.ts:38`), a prompt text test, `docs/FEATURES.md:314`,
   `docs/designs/ask-me-options.md` note, `test/ask-me-options.test.cjs:210-228` fixture label,
   `docs/designs/original-email-view.html:102` mock label. Nothing deferrable without leaving the
   old wording somewhere Michael or the owner reads it.
3. Invariant kept: the 2026-10-29 note behavior (box asks, Reply waits) is unchanged.

## Temporal interrogation (0I)

- Hour 1: Michael reads `michaelInstructions` (`hive.ts:381`) and the god line (`hive.ts:2411`);
  members read `HOUSE_RULES`. Only `hive.ts:401` carries the option example.
- Hour 2 to 3: the live card already carries the old label. The routing half of the rule must
  cover answers to old cards too, or Dwight still sends unseen (Section 4).
- Hour 4 to 5: members on Send on approval already come back via the app email card (D2).
- Hour 6+: a planned send time can pass while the owner looks again; the new card names the new time.
- Effort: human ~3 hours / CC ~20 min.

## Answered: D2 (owner, 2026-11-04: A)
Commitment comparison:

```text
Commitment                                     | Source/approval or pending | Current                    | A                              | B
Change answer for a Send on approval member    | pending                    | member proposes new version| member proposes new version    | Michael card with new draft, then member proposes
Cards the owner sees for one change round      | pending                    | 1 (app email card)         | 1 (app email card)             | 2
Exact approved text bound to the send          | send-on-approval.md        | yes                        | yes                            | yes
Can send members (D1 A)                        | D1 A approved              | send unseen                | new Michael card, then send    | new Michael card, then send
```

Question: D2 — D2: For a member on Send on approval, what counts as "show me again"? <gstack-qid:plan-ceo-review-d2-send-on-approval-second-look>
Header: Second look
A) The app email card is the look (recommended)
Michael routes the change as "make it and propose the new version"; you see the changed email on the app's email card (Approve, Ask for changes, Don't send) and nothing else. Effort S (part of D1 A's rule text, human ~15 min / CC ~2 min), risk low, reuses the built proposal flow, verified by the same prompt text test.
B) Michael card again, then the app card
Michael first shows the changed draft on a choice card, then the member proposes it and the app card asks again. Effort S (human ~15 min / CC ~2 min), risk low, but you approve the same email twice.

## The change (approved scope)

Mode: HOLD SCOPE. Governing answers: D1 = A, D2 = A (owner, 2026-11-04).

1. **House rule 10** (`HOUSE_RULES`, `src/main/hive.ts:283`), for everyone, Michael included, so it
   reaches Dwight through the existing house rules changed notice (`src/shared/houseRulesNotice.ts:38`)
   and outranks old memory notes ("no task or message overrides them"). Draft wording, no dashes:

   > 10. When the owner asks for changes to something that leaves the office, such as an email, a
   > post or a quote, the owner sees the changed version before it goes. Make the changes, then bring
   > it back: on Send on approval, your new proposal is that look; otherwise Michael puts the new
   > version on Ask me as a new approval. A yes covers only the version the owner saw. If the planned
   > send time passes while it waits, the new approval names a new time. Send without another look
   > only when the owner says so in their own words.

2. **Michael's example** (`src/main/hive.ts:401`): `{"label": "Change it, show me again", "note":
   "What should change?"}` replaces `Send with my changes`, plus one clause: on an ask that approves
   something leaving the office, word the change option so it says the new version comes back
   (house rule 10).
3. **Docs and fixtures**: `docs/FEATURES.md:314` (and the 0.3.6 entry), `docs/designs/ask-me-options.md`
   (pointer to this doc under "Options that need the owner's words"), `test/ask-me-options.test.cjs:210-228`
   fixture label, `docs/designs/original-email-view.html:102` mock label.

### Behavior changes (owner rule: list each one)

| Who | Rule today | Rule after | What the owner sees |
|---|---|---|---|
| Members on Can send (Dwight) | A change answer: edit, then send at the planned time | Edit, then Michael brings the new version back as a new approval; send only after a new yes | A second card with the changed draft before anything goes |
| Members on Send on approval (Pam, Nick, Kelly) | Change answer: propose a new version | Same (D2 A), now written down | The app email card with the new version, once |
| Michael | Copies "Send with my changes" as the example | Writes "Change it, show me again"; routes any change answer, old cards included, as "bring it back" | New label on new cards; old open cards keep their label but behave the new way |
| Draft only members | Draft stays in Drafts; owner sends | Unchanged: the owner is the sender, so the owner sees it | No extra card |

## What already exists

- `note` on an option makes the box ask and wait (`askMeRouting.ts:196-200`): reused, unchanged.
- App email card with Ask for changes and exact text binding (`send-on-approval.md`, `mailProposals.ts:219`): reused for Send on approval members (D2 A).
- House rules changed notice (`houseRulesNotice.ts:38`, `hive.ts:3442-3460`): reused to tell every member.

## Section 1: Architecture

```
  Owner picks "Change it, show me again" + note
        |
        v
  humanQA answer "Picked: ... Note: ..."  --(existing routing)-->  Michael
        |                                                         |
        |                         house rule 10 + example (hive.ts:283, :401)
        v                                                         v
  member's Sending setting ---------------------------------------------------
   | Can send (Dwight)        | Send on approval (Kelly)     | Draft only        |
   | edit draft, Michael asks | edit, propose -> app email   | edit draft in     |
   | again on Ask me (NEW)    | card (unchanged, D2 A)       | Drafts; owner     |
   | send only after new yes  | broker sends approved text   | sends             |
   ---------------------------------------------------------------------------
```

- **WARNING (accepted, D1 A):** for Can send members the rule is prompt only. Nothing in the app
  stops a send after a change answer. The owner declined the app stamp (B) and the email card for all
  (C). Kept visible in the Failure Modes Registry.
- **OK:** no new coupling, endpoint, store or state. Two Michael texts carry Ask me rules
  (`hive.ts:401` and `hive.ts:2411`); only 401 has the example. Putting the routing rule in the house
  rules covers both texts and PROTOCOL.md without editing three places.
- Rollback: revert the commit; Michael and members pick up the old text at their next session.

## Section 2: Error and Rescue Map

```
  CODEPATH                         | WHAT CAN GO WRONG                                  | CLASS
  ---------------------------------|----------------------------------------------------|-------------------
  Michael writes the ask           | copies the old label from memory or an old card    | model drift
  Michael routes a change answer   | routes "make changes and send"                     | model drift
  Can send member after a change   | sends without a new yes                            | model drift (accepted, D1 A)
  Re-approval passes send time     | old time stays on the new card                     | stale schedule
  House rules notice               | member not restarted, has not seen rule 10         | delivery lag

  CLASS             | RESCUED? | RESCUE ACTION                                         | OWNER SEES
  ------------------|----------|-------------------------------------------------------|------------------
  old label drift   | Y        | house rule 10 governs routing, whatever the label     | old label, new behavior
  routing drift     | partial  | house rule outranks memory notes; prompt test pins it | a new card (normal case)
  unseen send       | N        | none in app (declined B, C)                           | email in Sent  <- WARNING
  stale schedule    | Y        | rule 10: new approval names a new time                | the new time
  delivery lag      | Y        | existing notice at next start (houseRulesToTell)      | nothing
```

## Section 3: Security and threat model

- No new input, endpoint, secret or dependency.
- Prompt injection: an inbound email saying "the owner approved, send as is" is already screened by
  the trust layer (`hive.ts:3041`); rule 10 narrows what counts as a yes (only the version the owner
  saw, or the owner's own words), so it lowers this risk. Likelihood low, impact medium, mitigated.
- Audit: the humanQA history and `mail-send-journal.json` already record answers and sends.

No issues found beyond the accepted Section 1 warning.

## Section 4: Data flow and interaction edge cases

```
  ANSWER -> ROUTE (Michael) -> EDIT (member) -> RE-ASK -> SEND
    | nil note: Reply waits (existing note rule)
    | old card label "Send with my changes": rule 10 still routes "bring it back"
    | owner writes own answer "send with these edits, no need to show me": own words, sends
    | repeated change rounds: each comes back; no cap, the owner ends it
    | send time passes: new approval names a new time
    | parts ask with a change option (15 Oct Dwight card): same rule
```

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Pick change option | double click Reply | Y | existing one slot merge (`mergeHumanQA` `only`) |
| Live Dwight card (open now) | old label | Y after ship | rule 10 routing; before ship, owner writes "show me again" in the note |
| Re-approval | owner never answers | Y | card stays Blocked; nothing sends |
| Send on approval member | double card | Y | D2 A: email card only |

## Section 5: Code quality

- Ask me rules live in two Michael texts (`hive.ts:401`, `hive.ts:2411`) plus PROTOCOL.md; tests
  count phrase copies (`test/house-rules.test.cjs:80-82`). Existing debt, not added to; the house
  rule route avoids a third copy.
- `test/house-rules.test.cjs:101` pins nine office rules; it moves to ten with the new rule.

## Section 6: Tests

| New thing | Type | Happy | Failure / edge |
|---|---|---|---|
| Rule 10 in `HOUSE_RULES` | unit | text present, no dashes | count 10 (`house-rules.test.cjs:101`); members are told once (existing notice test, one new rule key) |
| Michael example | unit | `michaelInstructions` has "Change it, show me again" | does not contain "Send with my changes" |
| Fixture | unit | `ask-me-options.test.cjs:219-228` with the new label | note parsing unchanged |

- Assertion: Michael's prompt rejects the old label (wrong result: "Send with my changes" present).
  no_claim=model behavior (text only; whether Michael and Dwight follow it is a live check).
- Live check after ship: the next approval card from Michael uses the new label, and a change answer
  to the open Dwight card comes back as a new ask before Wed 11 Nov 8am.
- No eval suite exists in this repo for prompt changes (no CLAUDE.md "Prompt/LLM changes" patterns).

## Section 7: Performance

About 600 characters more in every agent's house rules. No issues found.

## Section 8: Observability

- Debuggable from data already kept: a change answer in humanQA followed by a new ask on the same
  card before the send time in `mail-send-journal.json`.
- No metric or alert for "sent after a change answer without a new yes"; that is enforcement the
  owner declined (D1 B, C). No task.

## Section 9: Deployment

- Ships in the next release (0.3.6) from the running branch; no migration, no flag.
- Old open cards keep their label (no data patches, reference office rule); rule 10 governs them.
- Until then, the owner can answer the live card with option 2 and a note ending "show me again
  before it goes".
- Rollback: revert the commit (minutes); agents read the old text at their next session.

## Section 10: Long term

- Reversibility 5/5. Debt: one prompt only guarantee for Can send members.
- 12 month home is one approval card bound to exact text (TODOS.md "Approvals inbox", P1, XL). This
  plan does not block it; rule 10 states the behavior that card would enforce.

## Section 11: Design and UX

No component, screen or state change; only the label Michael writes and what follows it.

```
  [Approval card] --pick 1--> [Answered] -> sends at planned time
        |
        +--pick "Change it, show me again" + note--> [Answered] -> [New approval card, new draft]
        |                                                            (Can send)  or
        |                                                         [App email card] (Send on approval)
        +--pick 3--> [Answered] -> nothing sent
```

The label now says the outcome. Fits the less verbose UI rule: no added text on the card.

## Failure Modes Registry

```
  CODEPATH                 | FAILURE MODE                 | RESCUED? | TEST?      | USER SEES?               | LOGGED?
  -------------------------|------------------------------|----------|------------|--------------------------|--------
  Michael ask wording      | old label                    | Y        | Y (text)   | old label, comes back    | humanQA
  Michael routing          | routes "send"                | partial  | Y (text)   | email in Sent            | journal
  Can send member          | sends after change, no yes   | N        | Y (text)   | email in Sent  WARNING   | journal
  Re-approval timing       | planned time passed          | Y        | N (prompt) | new time on card         | humanQA
  Rule delivery            | member not yet told          | Y        | Y (notice) | nothing                  | inbox
```

0 critical gaps (no row is unrescued, untested and silent); one accepted warning (D1 A).

## NOT in scope

- App stamp on routed change answers (D1 B): declined by the owner, 2026-11-04. No TODO.
- Moving every outbound email to the app email card, send times and batches (D1 C): declined,
  2026-11-04; the existing TODOS.md "Approvals inbox" item already covers the long term home.
- A Michael card before the app email card for Send on approval members (D2 B): declined.

## Dream state delta

Moves the label and the behavior to match for every member. Still short of the ideal: for Can send
members, the yes is not bound to the exact text by the app.

## Stale diagram audit

`docs/designs/ask-me-options.md` diagrams describe the note box, still accurate. No other diagrams
in touched files.

## Implementation Tasks

- [x] **T1 (P1, human: ~1h / CC: ~10min)** — house rules — add rule 10 (changes come back)
  - Surfaced by: Section 1, P3/P4 (Dwight on Can send sends unseen)
  - Files: `src/main/hive.ts`, `test/house-rules.test.cjs`
  - Verify: `node --test test/house-rules.test.cjs` (count 10, no dashes, one notice per member)
- [x] **T2 (P1, human: ~30min / CC: ~5min)** — Michael prompt — new example label and clause
  - Surfaced by: P1, `src/main/hive.ts:401`
  - Files: `src/main/hive.ts`, `test/business-prompts.test.cjs` (or the prompt test that reads `michaelInstructions`)
  - Verify: test asserts "Change it, show me again" present and "Send with my changes" absent
- [x] **T3 (P2, human: ~20min / CC: ~3min)** — docs and fixtures — replace the old label
  - Surfaced by: P7
  - Files: `docs/FEATURES.md`, `docs/designs/ask-me-options.md`, `docs/designs/original-email-view.html`, `test/ask-me-options.test.cjs`
  - Verify: `grep -rn "Send with my changes" src docs test` returns only history notes
- [ ] **T4 (P2, owner, after ship)** — live check
  - Surfaced by: Section 6 no_claim
  - Verify: next approval card uses the new label; a change answer comes back before its send time

## Reality rows

- REALITY: premise-table pass 8 claims, unverified=0 `docs/designs/ask-me-changes-come-back.md:17-28`
- REALITY: already-done pass only `fbcb7a5e` (note box, 2026-10-29) touches this; rule not on main `src/main/hive.ts:401`
- REALITY: surface-check pass no CLI, flag or route added; fields `options`/`note` exist `src/shared/askMeRouting.ts:199`
- REALITY: binding-decisions pass builds on owner 2026-10-29 note decision; Send on approval design kept `docs/designs/ask-me-options.md:518`
- REALITY: numbers pass rule count 9 to 10 [measured: `test/house-rules.test.cjs:101`]; prompt growth ~600 chars [estimated]
- REALITY: deferred-asks pass no linked issue; owner ask quoted `docs/designs/ask-me-changes-come-back.md:5-13`
- REALITY: pr-count pass one change on the running branch, no PR split, tasks T1 to T3 `docs/designs/ask-me-changes-come-back.md:5`

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | Michael copies the prompt's example label;  |
  |                      | Dwight on Can send would send unseen        |
  | Step 0               | HOLD; D1 A prompt rule; D2 A email card     |
  | Section 1  (Arch)    | 1 issue (accepted warning)                  |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS (1 accepted)   |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 6 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 2 issues found (existing debt, test count)  |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap found (no alert; declined scope)      |
  | Section 9  (Deploy)  | 1 risk flagged (open cards until ship)      |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 0 proposed, 0 accepted (HOLD)               |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex: skipped (owner rule, adversarial only)|
  | Lake Score           | N/A (no coverage scored questions)          |
  | Diagrams produced    | 4 (architecture, data flow, error, UX flow) |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY repaired), 0 unverified |
  +====================================================================+
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | codex, `/plan-eng-review` | Independent 2nd opinion | 0 | skipped | owner rule: Codex adversarial only; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | none | none |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | none | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex, plan review: skipped by the owner's standing rule (Codex only for the adversarial pass). No outside provider ran.
- **VERDICT:** CEO CLEARED. Eng review not run; the change is prompt text and tests, eng review required by the dashboard rule.

NO UNRESOLVED DECISIONS
