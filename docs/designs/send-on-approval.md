# Send on approval: a third Sending choice for mailboxes

Status: owner decisions taken 2026-10-05; being built.

## Proposal (owner, 2026-10-05)

Add a mailbox setting "Send on approval": the agent surfaces a proposed email,
and once the owner approves it, the agent sends it.

Found while investigating a Kelly card that said nobody could send from the
owner's mailbox: the mailbox connection (app password, SMTP) can always send.
Draft only is a per member choice on the member's Access tab, and the agents'
text pointed at Settings > Connections > Mailboxes instead. Fixed the same day
(agentAccess.ts, mail.ts, mailboxes.ts, md-mail-mcp.cjs).

## Owner decisions (2026-10-05)

1. **The agent sends after approval**, not the app: "agent may have opportunity
   to learn to do this in future for similar emails."
2. **Edit, then approve**: the subject and body are editable on the Ask me card.
3. **New members start on Draft only**, as today (design 6A). Send on approval is
   chosen per member.
4. **Work styles never hard code "never send"**. What an agent may do with mail
   comes from its Sending setting. The default (Draft only) is the most
   restrictive: read and draft, no send. When the owner picks Can send or Send on
   approval, nothing in the work style contradicts it.
5. **Public text that says agents never send mail is wrong** and gets corrected.

## Design

### Setting

Access tab > Email > Sending, three choices in this order:

| Choice | Value | What the agent can do |
|---|---|---|
| Can send | `send` | `send` goes out at once; `propose` is refused, so nothing reaches Ask me |
| Send on approval | `approval` | `propose` puts it on Ask me; `send` with the approved proposal's id |
| Draft only | `draft` | `draft` saves to the mailbox's Drafts; `send` refused |

Stored as `email.sending` beside the old `email.send` boolean, which stays
written (`send === (sending === 'send')`) so older readers still read it. A record
with no `sending` reads `send ? 'send' : 'draft'`.

### The rule (mailAccess)

- `propose` needs Send on approval. Can send refuses it, so nothing from a sender reaches Ask me (owner, 2026-10-09: a member on Can send kept filing cards from old memory notes).
- `send` needs Can send, or Send on approval with a `proposal` id. The broker then
  sends the approved version it stored, never text from the call, so nothing can
  change between the owner's yes and the send.
- Draft only refuses both and says where the switch is.
- A `standing` id counts only under Send on approval. Under Can send the email
  goes out as any other send, never checked and never put on Ask me.

### Changing Sending

When the owner changes a member's Sending on a mailbox it keeps (its own, or a
Send only grant), the member gets one "Sending changed" message and a memory
note naming the new choice. The note replaces any earlier note about how it
sends from there, so an old note to propose never wins (owner, 2026-10-09).

- **To Can send:** its waiting emails leave Ask me, are marked withdrawn and
  are listed in the message for the member to send itself. Approved ones stay
  and can still go by their id. Standing approvals stay on record. On a paused
  Send only grant (nobody reads that mailbox, or it needs attention), which
  can't send, the waiting emails stay on Ask me; the member still gets the
  message and the note.
- **To Send on approval:** nothing is withdrawn.
- **To Draft only:** waiting and approved emails are withdrawn, as before.

At launch, emails still waiting from a member already on Can send go back to
it the same way, once, so offices that switched before this rule match. Only a
member on the roster that can send from that mailbox now gets them back; a
paused grant keeps them on Ask me.

### Proposals

App owned, in `mail-proposals.json` in the app's data folder (not tasks.json,
which agents write). Each holds the agent, mailbox, recipients, subject, body and
references as proposed, its state (`waiting`, `approved`, `changes`,
`declined`, `sent`), and the approved subject and body. Decided ones are kept
for 7 days, then dropped.

### Ask me card

"{{name}} wants to send an email": from, to, cc, the subject and body editable,
then **Don't send**, **Ask for changes** (opens a note), **Approve**. Toast titled
with Michael's name (only Michael notifies): "{{name}} has an email for you to
approve in ASK ME."

### What the agent hears (from the app, sender `mail`)

- Approve: a request, "The owner approved your email ... Send it now: send with
  proposal <id>." When the owner edited it, the changes are in the message and in
  the agent's memory notes, so it learns the owner's way of writing.
- Ask for changes: a request with the owner's note (also in memory notes):
  propose a new version.
- Don't send: an inform; do not send it another way (also in memory notes).

An approved proposal not sent within an hour goes to Michael once, so it is
never stranded (his duty, kept in front of him).

A reply keeps the thread headers of the email it answers from the moment it is
proposed, so it still goes out in that thread after inbox zero (or the owner)
archives the email; a reply id that names nothing is refused at propose, before
the owner sees a card that could never be sent.

### What agents read

The md-mail tools say the agent's Sending choice in `list_mailboxes` and what to
do for each. Work styles and role text say nothing fixed about sending: "send or
draft as your Sending setting allows".

### Text that hard coded "never send" (audit, 2026-10-05)

- Pam's Work style in all five packs, and Kelly's in saas-consulting, said "send
  any reply to Michael as a draft for approval". Now: replies leave only as the
  Sending setting allows. Existing offices are offered the new text on Ask me
  (`pam-sending-2026-10`, `kelly-sending-2026-10`).
- Pam's card listed "Reply on your behalf without asking" under Asks you first:
  removed, since the Sending setting decides it. Dwight's approvals keep
  proposals and quotes, not every email to a prospect.
- The house rule "anything hard to undo goes to Michael first" now says email
  follows the Sending setting.
- The focus area check is given the member's real Sending setting, so "send
  replies" is no conflict for a member who may send.
- The onboarding "You stay in charge" line, README, FEATURES and ARCHITECTURE
  name all three choices. The website is a separate repo and is not changed here.
- Left alone: the packs' `email.send` "ask" tool level, which nothing in the mail
  path reads.

## Standing approvals (owner, 2026-10-05)

"Agent should start to learn and eventually should offer 'send without approval
in future' and then remember it as a decision."

- **Learning.** Every decision on an approval card goes into the agent's memory
  notes, a plain approval included ("approved ... unchanged"), so the agent can
  see which kinds the owner always approves as they are.
- **Offer.** When it sees that pattern, the agent adds `offer_standing` to its
  next `propose`: one narrow line naming the kind. The card then shows "From now
  on, send emails like this without asking", unticked, with the words editable.
- **Decision, two records.** Ticking it and approving writes a standing approval
  the app keeps in `mail-proposals.json`, out of the agent's reach, and a memory
  note so the agent knows. Memory alone never grants anything: the agent can
  rewrite its notes, and an email can talk it into doing so.
- **Use.** The agent sends that kind with `send` and `standing: <id>`. The app
  checks fixed facts (its own agent and mailbox, not revoked, no forwards or
  attachments), then a separate quick model with no tools judges whether the
  email plainly fits, treating the email as data. NO, or a check that can't run,
  files the email on Ask me as a normal approval instead of sending it.
- **Control.** The member's Access tab lists its standing approvals under
  Sending, with the latest sends under each and a Revoke. Revoking tells the
  agent and notes it in memory.
- Open: the app data folder is not yet guarded against agent writes (separate
  task), which any app kept permission depends on.
