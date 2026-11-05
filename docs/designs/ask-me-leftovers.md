# Nothing left unresolved on Ask me

Status: Built (owner, 2026-11-05). Not yet seen with real agents.

## What happened (GammaTile, 28 Oct to 2 Nov)

1. **Dwight's question was replaced.** At 2:01pm on 28 Oct, a minute into the call, Dwight asked how the GammaTile call went. At 8:43pm Michael withdrew it ("The call did not happen, so there is no outcome to log") and asked a new three part question on the same card: who reschedules with Ellah, save her attachment, and whether the new work comes out of the 20 hours.
2. **One part was answered, and the rest waited two days.** At 12:45am on 31 Oct, "Not yet" was picked on the attachment part only. The card left Ask me, as designed: unanswered parts go back to the one who asked. Michael told Dwight to look at them "on Mon 2 Nov", and Dwight waited for that slot, while Ellah waited on a new time "this week". Nothing recorded what was decided about each question, so nothing could notice that the rescheduling question was urgent.
3. **"Not yet" counted as an answer.** It closed the part like any other pick, and nothing was set to bring it back.

## Decisions (owner, 2026-11-05)

- **D1 Unanswered questions go back to the one who asked.** Never force them to stay on Ask me.
- **D2 Agents decide when, the harness makes sure it is decided.** The core objective: nothing unresolved is ever dropped, by a member, Michael or the app. There is no fixed time to act. A member may well conclude, from a partial answer, that a question should come back in three months; that is a fine decision, as long as it is recorded and it does come back.
- **D3 "Not yet" brings the question back** at a time the office chooses, sooner when a deadline is near.
- **D4 Replacing a question stays as it is.** When the owner asks why a question changed or left Ask me, Michael answers from the card's history, as this investigation did.

## The rule in one line

Every question the owner did not settle (left unanswered, or answered "Not yet") is a **leftover**, and every leftover gets a recorded decision: **dropped** (with why), **settled** (with how), **ask now**, or **ask later** (with when and why). A later one comes back at its time.

## Agent behavior changes

| # | Who | Rule today | Proposed rule | What the owner sees |
|---|-----|------------|---------------|---------------------|
| B1 | Every team member | "Settle what you can and file again only for what you still need", with nothing recorded | Decides each leftover sent back to it: dropped, settled, ask now, or ask later with a date and why, weighing who is waiting and any deadline; tells Michael the decision for each; files the "ask now" ones | Follow up questions that come back when they matter, or are dropped for a reason |
| B2 | Michael | Sends leftovers to the one who asked and closes the answer when he likes; may park them behind a card's next time | Records each leftover's decision on the card, and closes the owner's answer only once every leftover has one. Never parks a leftover without a recorded decision | Nothing new, unless asked |
| B3 | Michael | A to-do offers "Done, I did it" (and, since today, "I need help") | A to-do may also offer "Not yet"; a "Not yet" pick is a leftover like any other, and the deadline the ask names guides its "ask later" date | "Not yet" on to-dos, and the question returns |
| B4 | Michael | (none) | When the app says a leftover's time has come, asks it again on the same card, updated to what the office now knows, or records a new decision | The question returns on Ask me when it matters |
| B5 | Michael | Answers the owner's questions in their conversation | When the owner asks why a question changed or left Ask me, reads the card's whole history (withdrawn questions and their reasons, partial answers, leftover decisions, the messages about the card) and answers with times and reasons | A clear answer to "where did that go?" |

## Mechanics (decided)

- **Where the decision lives.** On the answered question itself, written by Michael: `"leftovers": [{"question": 2, "decision": "later", "at": "<ISO time with offset>", "why": "..."}]`, with `question` its number on the card as the owner sees it (1 for a single question) and `decision` one of `dropped`, `settled`, `now` or `later`. `why` is required; `at` is required for `later`. The last record for a question wins, so a decision can be revised.
- **The guarantee.** Every leftover with no decision is listed in Michael's context every turn ("Leftover questions without a decision", beside the other cards to tidy) until it has one. There is no time limit on deciding, only on forgetting. Answers given before this was built are left alone: the check counts answers from the office's first run with it.
- **Which questions are leftovers.** A question with no answer, or one answered by picking a "Not yet" option (an option with `"later": true`, or labelled "Not yet" for cards already on the board).
- **Coming back.** At a `later` time, the app tells Michael once: "A leftover question has come due" with the card and the question, whatever the card's status, a Done card included. Michael asks again on the same card or records a new decision. The app never reopens a question or moves a card itself: Michael owns every card.
- **History.** Withdrawn questions, reasons, partial answers and now leftover decisions stay on the card, and the messages about a card share its conversation. B5 points Michael at them. Michael's instructions never mention git, so the board's past versions stay out of it.

## Not in scope

- Keeping unanswered questions on Ask me (D1 says no).
- A fixed time to decide or to act (D2 says no).
- A visible trace on a replaced question (D4 says the current behavior is fine).
- Showing the owner when a leftover comes back; Michael can tell them when asked.
- Reopening the GammaTile questions: they were answered on 2 and 3 Nov.
