# Items for the owner reach Ask me

Status: Built (owner, 2026-11-05). Not yet seen with real agents.

## What happened

On Tue 3 Nov at 11:05pm Central, App Store Connect wrote to it@moblize.it: "There's an issue with your My Tarot Reader (iOS) submission." Only the owner can see and fix it, by signing in to App Store Connect.

1. Nick read it at the 8am check on 4 Nov. He put it in his report to Michael as "For the owner, no filing", one line among Twilio, a Google warning and renewal notices. He filed nothing in triage.
2. Michael wrote it only in his own terminal, as the last bullet of a reply labelled "For you, no action from the team". The owner never reads that terminal; Michael's own instructions say so, but only for answers to the owner's questions.
3. The owner pressed closing time 7 minutes later. Nothing on Ask me, no card, no notification.

## Why it was possible

- **Triage only takes questions.** A filing holds an "ask" (questions) or "waitingOn". An action only the owner can do, with nothing to decide, has no shape, so Nick kept it in prose.
- **Members' messages are a side door.** Since 22 Oct, 12 member messages told Michael something "for the owner to know" without a filing. Each relied on Michael noticing it in a long report.
- **Michael's terminal looks like an owner channel.** Michael writes replies addressed to "you", but they go nowhere. His rule to answer in the owner's conversation covers only the owner's own questions.
- **Report cards exist, but only for scheduled job results**, and nothing learns from them: Got it tells nobody.

## Decisions (owner, 2026-11-05)

- **D1 The bar: act, decide, or real stakes.** Always a card when only the owner can act or decide. A notice becomes a card only when it carries a consequence: money moving, a deadline, a customer or partner waiting, a platform rejecting or suspending something, security or legal. Receipts, renewals that need nothing, promos and routine status stay in the member's records with no card. Agents must not become email routers.
- **D2 Learning: a button plus proposals.** A notice card gets "Don't show me these" beside "Got it". It reaches the member who raised it as a skip rule for that kind of notice. When the owner clears the same kind three times in a row with Got it, Michael asks whether to keep showing them. Nothing is ever skipped silently.
- **D3 An action card waits until done.** The card says what to do, with the link from the email, and stays on Ask me until the owner presses Done. Michael brings it back if a deadline nears.

## Agent behavior changes

| # | Who | Rule today | Proposed rule | What the owner sees |
|---|-----|------------|---------------|---------------------|
| B1 | Every team member | Files a question or a wait in triage; anything else for the owner may go in a message to Michael | Anything for the owner goes in a triage filing, never only in a message: an "ask" (questions), an "action" (only the owner can do it, with the exact link), or a "notice" (D1's stakes), each naming the kind of notice. Everything below the bar stays in the member's records | Fewer surprises: what matters reaches Ask me |
| B2 | Every team member | Owner feedback reaches memory only through answers | Never files a notice of a kind the owner said not to show | Fewer repeat notices |
| B3 | Michael | An action only the owner can do goes on Ask me, but only as a question | An "action" filing becomes a Blocked card that waits for Done (D3); a "notice" filing becomes a report card naming its kind | Action cards with a Done button; notice cards |
| B4 | Michael | Must answer the owner's questions in the conversation, not the terminal | Nothing meant for the owner goes only in his terminal: it goes on Ask me, or in the conversation when it answers the owner. When a member's message holds something for the owner with no filing, he makes the card by the same bar | Nothing lost in a terminal |
| B5 | Michael | (none) | When the app tells him the owner cleared three notices of one kind in a row with Got it, he asks on Ask me whether to keep showing them | An occasional "Keep showing these?" card |

## Mechanics (decided)

- **Filing shapes.** A triage filing carries one of `ask`, `action`, `notice` or `waitingOn`. `action` and `notice` carry `noticeKind`, a few words naming the kind of email ("App Store review result"), plus the email's `email:` link and, for an action, the site's own link.
- **Action card.** A Blocked card whose ask has the options "Done, I did it" (recommended) and "I need help" (with a note asking what). Picking one routes to Michael as any answer does, and he closes the card on Done.
- **Notice card.** The existing report card (`kind: "report"`) gains `noticeKind`. "Don't show me these" clears it, writes "owner, <date>: don't show notices of this kind: <noticeKind>" into the raiser's memory notes, and tells Michael. Got it clears it as today.
- **The count.** The app counts Got its per raiser and notice kind from the board, and tells Michael on the third in a row, once per member and kind: after the owner answers "Keep showing them", that kind is never asked about again. A "Don't show me these" ends a run.
- **Only the app page** can press "Don't show me these", since it writes the owner's word into a member's memory.
- **Below the bar.** Members keep listing routine notices in their run report to Michael as today; Michael puts no card on them.

## Not in scope

- Rewriting the 12 past messages into cards.
- Reading Michael's terminal from the app.
- Any change to how mail is fetched or which agent reads which mailbox.
