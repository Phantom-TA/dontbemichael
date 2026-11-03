# A case study the owner can send us

Status: CEO review, scope decided (D1 and D3 to D9, 2026-11-03). Nothing here is approved until
its row in the decision ledger says so.

## Ask (owner, 2026-11-03)

"As this is an open source and we dont track usage etc. we still need a way to publish how
businesses are using the app. So, add a feature to generate a one page publishable case study
describing how office is used like business name, website logo, about the business, agent setup
with job functions, overall pulse stat parts that shows worth work done, times saved or useful
parameter for a business case study and a final conclusion with why small business should do it
for them. Business owner should be able to generate and be able to send it to us. We will then
review and publish the good ones on our website as case studies. Add this as a benefit to the
business owner that they could be featured on our website attracting potential customers and
giving a positive brand value."

## 0A. Premise

- **Real problem.** The app sends no usage data (TELEMETRY.md: usage stats are off), so we have
  no evidence of how real businesses use it, and the website has nothing to show a prospect but
  our own words. The facts that would make a case study already sit on the owner's Mac: the
  business, its team and what Pulse counted.
- **Target outcome.** An owner opens one screen, sees a finished one page case study built from
  their own office, edits it, and sends it to us in one step. We review it and publish the good
  ones on the website (a separate repo, out of this plan's code).
- **Do nothing cost.** The website keeps no proof from real offices, and owners who would gladly
  be featured have no way to say so.
- **Proxy check.** This solves the pain directly, as long as the numbers are real. Pulse counts
  outcomes; it does not measure time saved (P8), and D4 keeps estimates off the page. An invented
  number on a published case study would cost more trust than the page earns.
- **Not a usage channel.** Nothing leaves the Mac unless the owner presses Send on a page they
  have read. It is a submission, not telemetry. TELEMETRY.md and the README must say so, and must
  also disclose the one logo read from the business's own website (D3).

## Premise table

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | The app sends no usage events | `TELEMETRY.md:3` (usage stats off) | verified |
| P2 | Business name, city and type are stored | `src/main/config.ts:273-279` | verified |
| P3 | Website is stored | `src/shared/companyProfile.ts:26` `website` | verified |
| P4 | A logo is stored | no logo field in config or company profile | false: fetched (D3) |
| P5 | Pulse counts emails organized, emails sent, tasks finished, scheduled checks | `src/shared/teamPerformance.ts:184` `outcomes` | verified |
| P6 | Pulse records how long the office ran and the share while the owner was away | `teamPerformance.ts` `running`, `awayShare` | verified |
| P7 | Pulse records spend | `teamPerformance.ts` `totalUsd` | verified |
| P8 | Pulse measures time saved | no such field in `src/shared` | false: left out (D4) |
| P9 | The app can send email from a connected mailbox | `src/main/mail.ts:1303` `smtp.sendMail` | verified |
| P10 | The app can draft text with a model without a member | `src/main/hiddenModel.ts:25` `runHiddenModel` | verified: Claude, and Codex when `noTools` is set (`hiddenModel.ts:29`); other engines return ok false |
| P11 | The website lives in this repo | memory: website is a separate repo | false: publishing is out of this plan |
| P12 | Pulse can build a snapshot for any day range | `teamPerformance.ts:64` periods today, this week, this month, plus `range?: DayRange` | verified |
| P13 | Mail can attach a local file | `mail.ts:393` `ComposeInput.attachFrom` takes only other messages | false: a file attachment is new work |
| P14 | The owner can send mail from the app | `mail.ts:1238` `MailService.send(agentId, ...)`; every caller sends for a member | false: an owner send path is new work |
| P15 | Main can build a snapshot for a 30 day range | `pulse.ts:243` `PulseService.snapshot(period, compare)` takes a Period only | false: a range entry point is new work |

unverified=0

## 0B. Existing code to reuse

| Need | Existing code |
|---|---|
| Business name, city, type | `config.ts` `businessName`, `businessCity`, `businessType` |
| About the business | `companyProfile` (website, industry, service area, hours), Company foundations answers (offer, customers) |
| Team and job functions | the roster and each member's role |
| Work done | Pulse snapshot with a `range`: `outcomes`, `running`, `awayShare`, `michael.routed`, `totalUsd` |
| Drafting words | `runHiddenModel` (used by hire, file fit and standing checks) |
| Sending | the app's mail sending (`mail.ts`), plus a new local file attachment |
| A page to save | Electron `printToPDF` from a hidden window; not used yet, new |

## 0C. Dream state

```
  CURRENT STATE                   THIS PLAN                      12-MONTH IDEAL
  No usage data, no proof   --->  One page built from the  --->  A steady flow of owner sent
  from real offices; the          owner's own office, edited     case studies, a public gallery
  website shows only our          and sent by the owner, read    by business type, and owners
  words                           by us before anything is       who point customers at their
                                  published                      own featured page
```

## Decision ledger

D2 was the review mode question (Selective expansion), an admin choice, so it has no row.

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| D1 (owner) | How a finished case study reaches us. P9, P1 | A: the app sends the page from a connected mailbox to our case study address, PDF attached; without one, Save as PDF and the owner's mail app opens with our address, subject and permission text, and the owner attaches the saved file | B: a new private intake; C: save a file only (both declined) | approved | Owner chose "Owner's own email (recommended)" in D1, 2026-11-03. Scope: the send channel only |
| D3 (owner) | Where the logo comes from. P4 | B: the app fetches the logo from the business website in the company profile when the screen opens, and shows it on the page before anything is sent; if none is found, or the owner says it is wrong, the owner picks a file | A: owner picks a file only; C: no logo (declined) | approved | Owner chose "Fetch from the website" in D3, 2026-11-03. Scope: logo source. The file pick fallback is a reviewer mechanic. Behavior change: the app itself goes online for this one read, outside Research |
| D4 (owner) | Time saved. P8 | B: measured facts only, no time saved line | A: owner estimate; C: fixed minutes (declined) | approved | Owner chose "Measured facts only" in D4, 2026-11-03. Scope: every number on the page is a Pulse figure; no estimate of any kind |
| D5 (owner) | Who writes About and the closing. P10 | A: a hidden model call drafts both from the office's facts when the screen opens; the owner edits both in place before Send | B: Michael as a card; C: the owner writes (declined) | approved | Owner chose "App drafts, owner edits (recommended)" in D5, 2026-11-03. Scope: the two prose parts only |
| D6 (owner) | Extra: "In your words" quote | Added: one optional box, the owner's text only, shown as a pull quote with their name | | approved | Owner chose "Add to this plan (recommended)" in D6, 2026-11-03 |
| D7 (owner) | Extra: one time nudge | Added: one dismissible invitation after a month of work, naming the benefit; never repeats after dismiss or send | | approved | Owner chose "Add to this plan (recommended)" in D7, 2026-11-03 |
| D8 (owner) | Extra: without the business name | Added: one switch that hides name, logo and website and shows the business type and city instead | | approved | Owner chose "Add to this plan" in D8, 2026-11-03 (against the Defer recommendation) |
| D9 (owner) | The address case studies go to. D1 needs it | hello@dontbemichael.com, one constant in `src/shared` | casestudies@ (declined) | approved | Owner chose "hello@dontbemichael.com" in D9, 2026-11-03 |
| D10 (owner) | What the permission promises about removal. Outside voice finding 1 | A: the tick and the email say "Don't Be Michael may publish this on its website, and will take it down if I ask"; the owner asks by replying to the email | B: keep as is (declined) | approved | Owner chose "Add the take down promise (recommended)" in D10, 2026-11-03 |
| D13 (owner) | What the team block says about each member. Design review | A: one drafted, editable line per member about their work for this business, plus their own Pulse figure; up to 8 rows | B: stored role description plus figure; C: drafted line, no figure (declined) | approved | Owner chose "Drafted line + number (recommended)" in D13, 2026-11-03. Scope: the team block; the draft prompt also reads role descriptions and scheduled job names |
| D14 (owner) | Whether spend can be hidden. Owner message | Spend always shows on the page; no switch | spend off by default with a switch (CEO scope, replaced) | approved | Owner: "dont allow to hide cost", 2026-11-03. Scope: the spend line and the screen's switches |
| D15 (owner) | The page's order. Design review, deep research | A: outcome first (hero with a measured headline, results band, then the business, team, away hours, quote, why) | B: keep the report order (declined) | approved | Owner chose "Outcome first (recommended)" in D15, 2026-11-03 |
| D16 (owner) | How the headline's number is made. D4 | A: up to 3 headlines, each from a measured figure; words editable, the number a locked chip | B: free text; C: no number (declined) | approved | Owner chose "Built from a figure (recommended)" in D16, 2026-11-03 |
| D17 (owner) | The hero color | A: from the logo, darkened to 4.5:1 for white text; our ink as fallback | B: our ink on every page (declined) | approved | Owner chose "From the logo (recommended)" in D17, 2026-11-03 |
| D18 (owner) | A picture of the away hours | A: one row of daily bars from Pulse's running records, the away part colored | B: numbers only (declined) | approved | Owner chose "30 day strip (recommended)" in D18, 2026-11-03 |
| D19 (owner) | A period with no measured work | A: Save and Send off, an empty state with a button for a period with work | B: allow with a no number headline (declined) | approved | Owner chose "Off until there is work (recommended)" in D19, 2026-11-03 |
| D20 (owner) | Numbers the owner types. D4, eng pass outside voice | A: refused only in the headline's words, checked again on Save and Send; the owner's numbers elsewhere stay | B: anywhere but the quote; C: never checked (declined) | approved | Owner chose "Headline words only (recommended)" in D20, 2026-11-03 |
| D21 (owner) | When the owner sees the screen. Owner message after the first build | Get featured (or the invitation) prepares the case study in main in the background: the draft and the logo read run while the owner works on; Pulse's button says it is preparing; when it is ready a toast on any view (and a desktop notice when the window is in the background) opens the screen already filled in. Inside the screen, a period or name change keeps the page up while it prepares again | the screen opening first and filling in while the owner waits (replaced) | approved | Owner: "there is no point in showing user empty frame and letting him wait. probably run this in the background and notify when it is ready to view and send", 2026-11-03 |
| D22 (owner) | Where the owner changes the words. Owner message after trying it | The page preview is read only. The headline is picked from the drafted options (each shown with its number) or written in the panel with Write my own (words before and after Pulse's number); subtitle, about, your words, each team line and why are fields in a The words panel; the page follows as the owner types | editable in place on the page (D15 to D19 mockup, replaced) | approved | Owner: "allowing typing in the header directly looks awkward and bad as a design. let user pick from the options or type there. keep visual view read only", 2026-11-03 |
| D23 (owner) | How the headline's number looks. Owner: "the header with the number with the background looks ugly" | C: the number in the headline's own font, bold, no box, in a light tint of the logo's hue, at 3:1 on the hero (the WCAG bar for large bold text; 4.5:1 left the tint nearly white); a light logo colour darkens the hero a little more | A: plain, no box; B: underlined (declined) | approved | Owner chose "C: tinted number (recommended)" in D23, 2026-11-03 (the 4.5:1 in the option became 3:1 on evidence, told to the owner) |

Approval readiness: PASS. Checked D1, D3, D4, D5, D6, D7, D8, D9, D10, each against its recorded
answer above (2026-11-03). Reviewer mechanics inside approved rows are labelled as such.

## Accepted scope (from the ask and D1 to D8)

**The page (one page; Letter when the system region is the US or Canada, A4 otherwise; the
implementer reads the region from the system locale).** In this order:

Outcome first (D15, design review). The figures, the team rows and the drafting rules are unchanged
from the approved scope; only the order and the treatment changed.

1. **Hero band** (D17). In the logo's main color, darkened until white text passes 4.5:1; Don't Be
   Michael ink when there is no logo, the logo has no usable color (grey or near white), or the
   name switch hides it (D8). Holds the logo on a white tile (with its Change control on screen
   only), the business name, "Bakery in Austin, Texas" and the website, a "Case study" label, the
   headline and one subtitle line (drafted, editable, about 140 characters).
2. **Headline** (D16). Built from one measured figure: the app offers up to three headlines, one
   per nonzero figure among emails organized, tasks finished and hours while the owner was away
   (then emails sent, scheduled checks), and the owner picks one in the screen's Headline group.
   The words are drafted and editable; the number is a locked chip filled from Pulse that can't be
   typed or deleted.
3. **Results band.** Four large mono numbers on a tint of the hero color, each with a plain
   label: the three strongest nonzero figures, then spend, always (D14), labelled "for the whole
   team, all 30 days" (the period's length). Under it one source line: "Counted by the app, Oct 4
   to Nov 2, 2026. Spend is everything the team cost in that period."
4. **The business** (left, about 220 characters, drafted from the profile and the foundations
   offer, editable) beside **the quote** (right, D6, about 140 characters, signed as before).
   With no quote, The business takes the full width.
5. **The team** (D13). One row per member: name and role, the drafted line (about 60 characters,
   one printed line), their own figure in mono in the hero color. Up to 8 rows, then "and N more".
6. **While the owner was away** (D18). One row of daily bars for the period, built from Pulse's
   running records summed per local day: total hours, the away part in a lighter shade of the hero
   color, with "286 of 410 hours" beside the heading and a two item legend. With no away time
   the heading reads "Hours the office worked" and the legend has one item.
7. **Why a small business should do this.** The closing (D5), about 200 characters, editable, on
   the hero tint.
8. **Footer.** The Struck M mark (from `branding/`), "Made with Don't Be Michael", the app version
   and dontbemichael.com. The date range moved to the source line.

No figure in the period (D19): Save and Send stay off and the page area shows a short empty state,
"No measured work in the last 30 days yet", with a button for the longest period that has work, or,
when none has, "Your case study opens once the team has done some work." The length caps above are
set so 8 team rows, a full quote and every drafted part fit one page; the fit check stays as before.

**Drafting (D5).** One `runHiddenModel` call when the screen opens, in the app's language, from
the fields above only: business type, city, company profile facts, the foundations offer answer
(never the customers answer), the team's roles and the figures. The prompt says to name no
customer and no person. With the name switch on (D8), the name and website are left out of the
prompt, and flipping the switch redrafts both boxes after asking before it replaces edited text.
If the engine can't run it, it fails, times out or returns nothing usable, both boxes open empty
with a short hint and a Retry. The owner can always write them.

**One page.** About and the closing each have a length cap (about 600 characters, the
implementer tunes it to the layout); the team list shows up to 12 members and then "and N more";
the quote is capped at about 280 characters; the logo is drawn in a fixed box. The preview is
drawn at the paper's size with the same print styles and fonts the PDF uses, and the fit is
measured on that drawing. If the text still runs past one page, the preview marks it and Save
and Send stay off until it fits.

**The logo (D3).** Read only from the website in the company profile, over HTTPS; a stored
`http://` site is tried once over HTTPS, and if that fails the owner picks a file. A host that
resolves to a loopback or private network address is refused. The time limit
and the size cap cover both the home page read and the image read. The home page's redirects are
followed only within the same registrable domain (www and the bare domain count as one site). The
page's own icon declarations are read (its Open Graph image, its touch icon, its icon links); the
image they name may sit on any public HTTPS host, such as an image service, since the site itself
points to it. Private and loopback addresses stay refused for every read. Only PNG, JPEG and
WebP are used; an SVG is not drawn (it can carry script), so the owner picks a file instead. A
found or picked logo is kept in the office's private folder, so the next open skips the read. The
logo on the preview has a Change control (pick a file, or read the website again); that is how an
owner replaces a wrong or old logo. No website stored: the screen offers the file pick at once.

**Without the name (D8).** One switch hides the logo, name and website and shows the business type
and city ("a bakery in Austin"). The quote is signed "The owner", and the screen warns if the quote
or a drafted box contains the business name or website. Team names stay: they are the office's own
agent names, not people. What this switch means sits behind the screen's info icon.

**The screen.** Opened from Pulse by a "Get featured on our website" button, once main has prepared it in the background (D21). The page is shown as
it will look, with the editable parts in place. Following the less verbose UI rule, the benefit
("we may feature your business on our website, where new customers can find you") sits behind the
info icon beside the title; the button's own label carries it in short. Buttons: Save as PDF,
Send to Don't Be Michael. Edits last while the screen is open; nothing is saved but the PDF and the
logo.

**Sending (D1).** To hello@dontbemichael.com (D9). The owner picks the mailbox to send from when
more than one is connected (the first one that can send otherwise). A mailbox that can't send yet
is shown greyed out in the picker with its reason behind the info icon, never hidden (the
connector rule). If none can send, Send takes the Save as PDF and mail app path below. It is a new owner send path in `MailService`
(P14), the owner's own action: not through Michael, a card or a member's send grant, and not
subject to members' send approvals. It still needs the mailbox's own sending to be set up. The
office log records "You sent a case study to Don't Be Michael". It is not a work outcome: it never
counts in Pulse's emails sent. The PDF is attached, which needs a new local file attachment in
`mail.ts` (P13). Before Send, the owner ticks "Don't Be Michael may publish this on its website,
and will take it down if I ask" (D10), and the email's body says the same and that a reply asking
for removal is enough, so the permission travels with the page. The screen hands main only the
edited text, the toggles and the chosen mailbox; main builds the page and the PDF itself and fixes
the recipient to the D9 address, so the owner send path can't be pointed anywhere else or made to
attach another file. Outcomes:
- Sent: the screen says so and the nudge is marked done.
- Refused or failed: the screen shows the plain reason (the mailbox's own message) and keeps the
  page, so the owner can try again or Save as PDF.
- Timed out, so it may already have gone out: the screen says it may have been sent and to check
  the Sent folder before trying again. It never says "tell Michael".

With no mailbox connected: Save as PDF, then the owner's mail app opens with our address, the
subject and the permission text; the owner attaches the saved file.

**The PDF.** Rendered from a hidden window with `printToPDF`, from the same page the screen
shows, so the PDF matches the preview. In Arabic it is laid out right to left, as the app is.

**The nudge (D7).** Once the open office has Pulse records with at least one outcome on 30
distinct days: a small invitation at the top of Pulse, opening the screen. It is recorded done per
office (in the office record, not the shared config), so one office's dismiss doesn't hide it for
another. Dismissed or sent, it never shows again for that office.

**What never goes on the page.** Customer names, email subjects or bodies, file names, money
other than the spend line, and anything from a member's memory. The page and the draft
prompt are built only from the fields listed above.

## Hold scope checks (SELECTIVE EXPANSION)

- **Complexity.** About 18 files [estimated], over the 8 file line: one pure builder in
  `src/shared`, one main module (gather, draft, logo read, PDF, send), the mail owner send path
  and file attachment, the Pulse range entry, one screen, the Pulse button and nudge, preload and
  IPC lines, three locales, tests, and the privacy docs (TELEMETRY.md, README, FEATURES.md). Each
  serves an approved part; fewer would mean dropping one of D1, D3, D5 or D7.
- **Minimum change.** Reuses the Pulse snapshot, the company profile, the foundations and the
  roster. Stores only the fetched or picked logo and the nudge's per office done flag.
- **Invariants.** Nothing leaves the Mac without the owner pressing Send on the page they read,
  apart from the logo read from their own website. Every number on the page is a Pulse figure.

## 0I. Temporal interrogation

| When | What the implementer needs or will hit | Settled by |
|---|---|---|
| Hour 1 | Where each fact lives: config, company profile, foundations offer, roster roles, Pulse | 0B, Accepted scope |
| Hour 2 to 3 | A Pulse entry that takes a day range (P15); an owner send path and a file attachment in mail (P13, P14) | Accepted scope; eng review owns the method shapes |
| Hour 4 to 5 | The logo read's network rules; `printToPDF` from a hidden window matching the preview; right to left | Accepted scope |
| Hour 6+ | One page fit, empty periods, the per office invitation flag, the docs | Accepted scope, Section 6 |

Effort: human team about 4 to 5 days; CC + gstack about 2 to 3 hours. No feasibility blockers remain.

## Review sections

### Section 1: Architecture

```
  Pulse "Get featured" button / one time invitation
            |
            v
  CaseStudyScreen (renderer) --IPC--> caseStudy (main)
     preview, edits, toggles             | gather  : config, company profile, foundations offer,
     Save as PDF, Send                   |           roster roles, Pulse range snapshot (new entry)
            ^                            | draft   : runHiddenModel (noTools), in app language
            |                            | logo    : HTTPS read of the stored website, nativeImage
            |  page model (shared)       |           check, kept in the private folder
            +----------------------------| pdf     : hidden window, printToPDF
                                         | send    : MailService owner send (new), file attachment (new)
  src/shared/caseStudy.ts: pure page model and HTML from the gathered facts, caps, name switch
```

- Data flow, four paths. Happy: every source present, page built. Nil: no company profile or no
  website (logo pick at once, About drafted from type and city); no business name (header uses the
  business type). Empty: no work in the period (the section says so, suggests a longer period).
  Error: a source can't be read (that block is left out and the screen says which).
- New state: the nudge's per office done flag, and the screen's draft state
  (`drafting -> ready | failed`; `failed -> drafting` on Retry). Send: `idle -> sending -> sent |
  failed | maybe-sent`; Send is disabled while `sending`, so a double click can't send twice.
- Coupling: read only on Pulse, foundations and the roster; one new write path in mail. Justified;
  each is the only source of its fact.
- Security architecture: one new outbound read (the logo) and one new outbound send (owner's
  mailbox), both started by the owner on this screen only. No new endpoint is exposed.
- Rollback: additive. A broken build is fixed by the next release; nothing stored needs migrating.
- Platform potential: the pure page model can later feed other outputs (a website gallery entry
  file) without new gathering.

**Findings.** OK, no blockers.

### Section 2: Error and rescue map

```
  CODEPATH              | WHAT CAN GO WRONG                     | RESCUE                          | OWNER SEES
  ----------------------|---------------------------------------|---------------------------------|------------------------------
  gather: Pulse range   | store unreadable, no records          | figures block left out          | "No recorded work in this period"
  gather: profile/found.| missing fields                        | use what exists                 | shorter About draft
  draft (hidden model)  | engine unsupported, timeout, refusal, | boxes open empty + Retry        | short hint, Retry
                        | empty or over-long output             | over-long cut to the cap        | editable text
  logo read             | no website, http only, private host,  | file pick                       | "Pick your logo"
                        | timeout, too big, SVG, not an image   |                                 |
  pdf (printToPDF)      | render fails                          | keep the page, log it           | "Couldn't make the PDF. Try again."
  send (owner mail)     | not set up, refused, auth error       | keep the page                   | the mailbox's own reason
                        | timeout after handing over            | keep the page                   | "It may have gone out. Check Sent first."
  mail app fallback     | no default mail app                   | file still saved                | the address to send it to
```

**Finding (WARNING, fixed in plan).** The PDF render failure was missing; added above. Every row
is rescued with a visible message; none is silent.

### Section 3: Security and threat model

| Threat | Likelihood | Impact | Mitigated |
|---|---|---|---|
| The logo read used to reach a private network address (SSRF) | Low | Medium | Yes: HTTPS, same site redirects, private and loopback refused |
| A hostile image file | Low | Medium | Yes: only PNG, JPEG, WebP, decoded by `nativeImage` and re-encoded to PNG before use; SVG never drawn |
| Prompt injection through foundations or profile text into the draft | Low | Low | Yes: `noTools`, output only fills editable boxes the owner reads before Send |
| Business data leaving without consent | Low | High | Yes: only on Send, with the publish tick, from the owner's own mailbox |
| Customer or personal data on a published page | Medium | High | Yes: fields allowlisted, customers answer never sent, prompt names no one, name switch warning |
| Mail header injection through the subject | Low | Low | Yes: the subject is fixed app text |

No new secrets, no new dependencies. **Findings:** OK.

### Section 4: Data flow and interaction edge cases

| Interaction | Edge case | Handled | How |
|---|---|---|---|
| Send | double click | Yes | disabled while sending |
| Send | sent twice on purpose later | Yes | allowed; a second case study is fine |
| Screen | closed while drafting or reading the logo | Yes | the call's result is dropped |
| Screen | office switched while open | Yes | the screen closes, nothing carries over |
| Name switch | flipped after edits | Yes | asks before redrafting edited text |
| Team | only Michael | Yes | the team block shows Michael alone |
| Team | 30 members | Yes | 12 shown, "and N more" |
| Text | Arabic or Chinese business | Yes | app language draft, right to left PDF |
| Period | all zero | Yes | the section says so |

**Findings:** OK.

### Section 5: Code quality

- Reuse `cutText` (`src/shared/cutText.ts`) for every cap, so nothing ends in half a character.
- Keep the page model pure in `src/shared` and the HTML built from it, so preview and PDF are one
  renderer.
- The owner send path is one small method next to `MailService.send`, sharing its SMTP and timeout
  handling, not a second mail stack.

**Findings:** OK.

### Section 6: Tests

| New thing | Test | Happy | Failure | Edge |
|---|---|---|---|---|
| Page model | unit | all fields present | missing profile | name switch hides name and website everywhere, zero figures |
| Figures | unit | Pulse range figures map to the page | store unreadable | spend always on the page, no switch (D14) |
| Draft prompt | unit | built from the allowlisted fields | engine unsupported gives empty boxes | customers answer never in the prompt; name left out with the switch |
| Logo read | unit, fake fetch | finds the Open Graph image | private host refused, SVG refused, too big | http tried over HTTPS once |
| Owner send | unit, fake SMTP | sent with the PDF attached and the permission text | refused shows its reason | timeout says may have gone out; not counted in Pulse |
| Nudge | unit | shows at 30 distinct days with work | not before | per office; never again after dismiss |
| PDF | Electron test on macOS | one page, matches the preview | render failure message | right to left in Arabic |
| Docs | source pin | TELEMETRY.md and README name the send and the logo read | | |

The test that lets this ship at 2am: the page model test that proves no customer name, email
subject or memory text can reach the page or the prompt. No prompt eval suite applies; the draft
is one owner edited call.

### Section 7: Performance

- Slowest paths: the draft (a few seconds, async, the page shows while it runs), the logo read
  (capped), the PDF render (about a second). None runs on a timer, only on the owner's click.
- Memory: one page of HTML and one capped image.

**Findings:** OK.

### Section 8: Observability

- App log lines for: draft ok or failed (with the reason class), logo found, refused or failed
  (reason class), PDF made or failed, send ok, refused or maybe sent. No business text in logs.
- A crash in this code is already caught by automatic failure reports.
- How we know it works: case studies arriving at hello@dontbemichael.com. There is no usage
  metric, by design.

**Findings:** OK.

### Section 9: Deployment and rollout

- Additive, no migration. Windows ships with every release untested on a real Windows machine;
  `printToPDF`, SMTP and the logo read are cross platform, and the Electron PDF test runs only on
  macOS (platform scoped tests).
- Before ship: hello@dontbemichael.com must be read by someone; FEATURES.md, TELEMETRY.md and
  README updated; the Behavior changes section goes into the ship and land notes.

**Findings:** OK.

### Section 10: Long-term trajectory

- Debt: low; one new mail path to keep in step with `MailService.send`.
- Reversibility: 4 of 5. The code is easy to remove; a sent email can't be unsent, which the
  publish tick makes deliberate.
- After this: a website gallery by business type (website repo), and a structured entry file sent
  alongside the PDF to make publishing quicker.
- Retrospective: D4 (measured facts only) keeps the page honest; D8 (no name) needed the extra
  draft and quote rules added above to hold.

**Findings:** OK.

### Section 11: Design and UX

```
  Pulse --[Get featured]--> Screen: drafting --> ready (preview, edits, toggles)
     ^                                   |            |                  |
     | invitation (once, per office)     | failed --> empty boxes, Retry |
                                          v                               v
                               Save as PDF            Send (tick permission) --> sending --> sent
                                                                                  |--> failed (reason)
                                                                                  '--> maybe sent
```

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Draft | boxes show "Writing a first draft" | empty boxes, hint | empty boxes, Retry | text in place | one box filled |
| Logo | placeholder | pick a file | pick a file | logo shown | |
| Figures | | "No recorded work in this period" | block left out with a note | figures | zeros left out |
| Send | button busy | | reason shown | "Sent" | maybe sent note |

- First the page itself, then the edits, then Send. The benefit sits behind the title's info icon
  (less verbose UI); the button label carries it in short.
- Keyboard: every control reachable; the preview's editable parts are labelled for screen readers.
- Recommend `/plan-design-review` before building, since this is a new screen and a printed page.

### Outside voice (codex exec -p deepseek-review, plan review)

First pass timed out at five minutes while reading code (no output); the second pass, with a
reading budget, completed. Findings and dispositions:

| # | Finding | Severity | Disposition |
|---|---|---|---|
| O1 | Publication consent: no take down promise; team names treated as personal data | High | Take down promise added (D10). Team names: factual correction, team members are the office's AI agents, named by the owner |
| O2 | One page fit is assumed: print styles and measurement missing | High | Fixed in plan: preview drawn at paper size with the PDF's print styles, fit measured on it (makes the approved one page rule buildable) |
| O3 | Same site redirects block logos on image services | Medium | Fixed in plan: the named image may be on any public HTTPS host; private addresses refused (reviewer mechanic within D3) |
| O4 | The owner send path is a privileged write | Medium | Fixed in plan: main builds the page and PDF and fixes the recipient; the screen sends only text, toggles and mailbox |
| O5 | A Pulse day range has real semantics (day boundaries, time zones) | Medium | Kept for the eng review; build on Pulse's existing `measure(range)` (`pulse.ts:271`) |
| O6 | Strategic: a submission funnel is marketing, not usage measurement | Medium | Recorded disagreement. The owner turned usage tracking off by choice and asked for case studies |
| O7 | D8 keeps team names | Low | Same correction as O1 |

## Reality rows

REALITY: premise-table pass 15 premises, unverified=0 docs/designs/case-study.md:38
REALITY: already-done pass no case study feature on main or this branch (only blog text) docs/blog/feed.xml:248
REALITY: surface-check pass no CLI command, flag or HTTP route named; IPC names left to eng review src/main/mail.ts:1238
REALITY: binding-decisions pass branch decisions cover foundations and REST calls only; none overruled src/shared/foundations.ts:1
REALITY: numbers pass file count tagged [estimated]; 30 days, 12 members, 600 and 280 character caps are design values, not measurements docs/designs/case-study.md:150
REALITY: deferred-asks pass no linked issue src/shared/teamPerformance.ts:184
REALITY: pr-count pass no ship policy file; one PR per wave src/main/config.ts:278

## NOT in scope

- Publishing on the website (separate repo); we review what arrives at hello@dontbemichael.com.
- Any time saved figure or estimate (D4: measured facts only).
- A new intake server (D1 B, declined) and a save only flow (D1 C, declined).
- Michael drafting the case study as a card (D5 B, declined).

## What already exists

| Piece | Reused |
|---|---|
| Business name, city, type; company profile; foundations offer | yes, read only |
| Roster roles | yes, read only |
| Pulse snapshot and `measure(range)` | yes, through one new range entry |
| `runHiddenModel` | yes |
| `MailService` SMTP and timeout handling | yes, with a new owner path and file attachment |
| `cutText` | yes, for every cap |
| `nativeImage` | yes, to check and re-encode the logo |

## Dream state delta

After this ships, any owner can send a real, honest case study in a few clicks, and we hold
permission to publish it. Still to come for the 12-month ideal: the public gallery by business
type (website repo) and a structured entry file to speed publishing.

## Failure modes registry

```
  CODEPATH        | FAILURE MODE                     | RESCUED? | TEST? | USER SEES?                       | LOGGED?
  ----------------|----------------------------------|----------|-------|----------------------------------|--------
  Pulse range     | store unreadable / no records    | Y        | Y     | "No recorded work in this period" | Y
  draft           | unsupported engine / timeout     | Y        | Y     | empty boxes, Retry               | Y
  draft           | empty or over-long output        | Y        | Y     | empty boxes or text cut to cap   | Y
  logo read       | no site, private host, SVG, big  | Y        | Y     | "Pick your logo"                 | Y
  one page fit    | text runs past the page          | Y        | Y     | overflow marked, Save/Send off   | N
  pdf             | render fails                     | Y        | Y     | "Couldn't make the PDF"          | Y
  owner send      | refused / auth / not set up      | Y        | Y     | the mailbox's reason             | Y
  owner send      | timeout after hand over          | Y        | Y     | "It may have gone out"           | Y
  nudge           | flag store unreadable            | Y        | Y     | no invitation (fails quiet)      | Y
```

0 CRITICAL GAPS (no row is unrescued, untested and silent at once).

## Scope expansion decisions

- Accepted: D6 quote box, D7 one time invitation, D8 send without the name, D10 take down promise.
- Deferred: none.
- Skipped: none.

## Diagrams

Produced: system architecture and data flow (Section 1), state machines (Section 1), error flow
(Section 2), user flow (Section 11). Deployment and rollback: additive feature, no migration, so a
sequence diagram adds nothing. Stale diagram audit: no existing diagrams in the files this touches
(`mail.ts`, `pulse.ts`, the Pulse view) need changes.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with
Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~4h / CC: ~15min)** — shared — Build the case study page model and HTML
  - Surfaced by: Section 1, Accepted scope (page order, caps, name switch)
  - Files: src/shared/caseStudy.ts, test/case-study.test.cjs
  - Verify: unit tests for fields, caps, name switch hiding, zero figures, no customer or memory text
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** — pulse — Add a snapshot entry that takes a day range
  - Surfaced by: P15, Outside voice O5
  - Files: src/main/pulse.ts, test/pulse-range.test.cjs
  - Verify: 30 day range figures equal the sum of its days; time zone day boundaries
- [ ] **T3 (P1, human: ~6h / CC: ~25min)** — mail — Owner send path with a local file attachment
  - Surfaced by: P13, P14, Outside voice O4
  - Files: src/main/mail.ts, test/mail-owner-send.test.cjs
  - Verify: fake SMTP: PDF attached, recipient fixed, refused and timeout outcomes, not counted in Pulse
- [ ] **T4 (P1, human: ~4h / CC: ~20min)** — main — Gather, draft, logo read, PDF
  - Surfaced by: D3, D5, Sections 2 and 3
  - Files: src/main/caseStudy.ts, src/main/index.ts, src/preload/index.ts, test/case-study-logo.test.cjs
  - Verify: logo read refuses private hosts and SVG; draft failure gives empty boxes; PDF from a hidden window
- [ ] **T5 (P1, human: ~6h / CC: ~30min)** — renderer — The case study screen and Pulse entry
  - Surfaced by: Section 11, D7
  - Files: src/renderer/src/components/CaseStudyScreen.tsx (new), the Pulse view, locales en, ar, zh-CN
  - Verify: states map in Section 11; one page fit check; per office invitation shows once
- [ ] **T6 (P1, human: ~1h / CC: ~5min)** — docs — Disclose the send and the logo read
  - Surfaced by: 0A, Behavior changes
  - Files: TELEMETRY.md, README.md, docs/FEATURES.md
  - Verify: source pin test that both are named

## Completion summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | no logo, no time saved, no owner send path, |
  |                      | no range snapshot entry, no file attachment |
  | Step 0               | D1 own email; D3 logo from site; D4 facts   |
  |                      | only; D5 app drafts; D9 hello@ address      |
  | Section 1  (Arch)    | 0 issues found                              |
  | Section 2  (Errors)  | 9 error paths mapped, 0 GAPS (1 fixed)      |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 9 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 1 risk flagged (hello@ must be read)        |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 9 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 4 proposed, 4 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex (deepseek-review), completed on pass 2 |
  | Lake Score           | N/A (no question offered a 10/10 option)    |
  | Diagrams produced    | 5 (architecture, state, error, user flow,   |
  |                      | data flow)                                  |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

## Behavior changes (for ship and land notes)

| Rule today | Proposed | Who | What the owner sees |
|---|---|---|---|
| Only Research uses the internet | The app reads the logo from the business's own website when the case study screen opens | the app | The logo on the page, and a line in TELEMETRY.md and the README |
| Nothing leaves the app but failure reports | A case study leaves only when the owner presses Send, from their own mailbox | the owner | The page, the permission tick and the email in their Sent folder |
| Mail is sent only by members, under their send grants | The app sends one email as the owner's own action, from a connected mailbox, outside member grants and approvals | the app, on the owner's click | The mailbox picker, the office log line "You sent a case study to Don't Be Michael" |

## Eng review (2026-11-03)

Target: this plan (docs/designs/case-study.md), checked against the code on
mit/october-cash-flow-discrepancy-b32468 at 0811e593. Every remedy below keeps an approved
behavior (D1 to D10) and is a small mechanic, so it is decided under the owner's standing rules
(2026-10-27: take the recommendation on small mechanics; never ask file or module layout). No
behavior or scope question came up.

Prior learning applied: send-only-member-cannot-read-mailbox (confidence 10/10, from 2026-10-31):
the owner path sends from a mailbox no member may be able to read, so the Sent check after a
timeout runs as the app, not as a member. Retrospective: no reverts in mail.ts, pulse.ts or
hiddenModel.ts; mail.ts changes often (send once journal, issue 101 maybe sent rules), so the
owner path reuses `send` rather than copying it.

### Scope challenge

- **What already solves it.** `MailService.send(agentId, id, input, beforeSmtp)` (`mail.ts:1237`)
  checks no grant; grants and approvals live in the md-mail tool handler (`mail.ts:1700` to
  `1915`). The owner send is therefore a call to `send` with a fixed owner key, plus one new local
  file attachment field, and it inherits the send journal, the Sent check after a timeout and the
  10 minute repeat guard. Pulse already keeps per office dismissals (`telemetry_dismissed`,
  `pulse.ts:183`). Range checks for addresses: Node's built in `net.BlockList` [Layer 1].
- **Minimum change.** No new `MailService` method; no change to the office record.
- **Complexity.** About 19 files [estimated] and 3 new modules, over the 8 file line, so the
  structure gate tripped. Search: WebSearch (Aside not used), one query on connect time address
  checks; it agreed with the fix in A3.
- **TODOS.** No TODOS.md entry blocks or overlaps this plan.
- **Distribution.** No new artifact; ships inside the app.

Structure (question_id `plan-eng-review-structure`, decided under the no code arrangement rule):

| | Original arrangement | Chosen arrangement |
|---|---|---|
| Page model and HTML | `src/shared/caseStudy.ts` | same |
| Main service | `src/main/caseStudy.ts`: gather, draft, logo, PDF, send | `src/main/caseStudy.ts`: gather, draft, PDF, send |
| Logo read | inside the main service | `src/main/siteLogo.ts`, one call: `readSiteLogo(site, limits)` returns a PNG or a reason |
| Owner send | a new `MailService` method | the existing `send` plus a local file attachment field |
| Nudge flag | office record (`officeRecord.ts`, `officeFile.ts`) | Pulse store, per office |
| Files | about 20 [estimated] | about 19 [estimated] |

Scope record: feature answers: none asked; structure: chosen arrangement (standing rule, no code
arrangement questions); accepted scope: the CEO accepted scope unchanged; pending remedies: none.
Scope Challenge result: scope accepted as-is.

REALITY: premise-table pass 15 CEO premises plus 6 eng premises below, unverified=0 docs/designs/case-study.md:38
REALITY: already-done pass origin/main has no case study work and no change to mail.ts, pulse.ts or officeFile.ts since 2026-11-03 src/main/mail.ts:1237
REALITY: surface-check pass no CLI flag or HTTP route named; IPC names (caseStudy:open, :draft, :logo, :pdf, :send) are new and checked against src/preload/index.ts at build src/preload/index.ts:1
REALITY: binding-decisions pass branch decisions (foundations, custom REST saved calls) do not touch mail send, Pulse or the office record src/main/pulse.ts:243
REALITY: numbers pass file counts are [estimated]; draft limit 60 s [estimated], page cap 1 MB [estimated], image cap 2 MB [estimated], logo limit 10 s [estimated], pixel cap 4096 [estimated]; send limit is SEND_TIMEOUT_MS src/main/mail.ts:69
REALITY: deferred-asks pass no linked issue; the owner's ask (name, logo, about, team, Pulse, closing, send, benefit) is all in scope docs/designs/case-study.md:8
REALITY: pr-count pass no .gstack/ship-policy.json; one PR on the running branch docs/designs/case-study.md:1

Eng premises:

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| E1 | Pulse counts every `mail-sent` office log event that names an agent | `index.ts:1063` `kind === 'mail-sent' && typeof e.agentId === 'string'`; backfill `pulseBackfill.ts:121` | verified |
| E2 | office.json is rewritten from the config alone | `officeFile.ts:58` `const rec = officeRecordFromConfig(cfg);` then `writeOfficeRecord(home, rec)` | verified |
| E3 | An interrupted earlier send is refused with "tell Michael" and not marked uncertain | `mail.ts:1275` and `1285` `throw new MailError('refused', mayHaveGone)` | verified |
| E4 | Members read only `uncertain` from a send error | `mail.ts:1723` `e instanceof MailError && e.uncertain` | verified |
| E5 | No guard against private addresses exists for outbound reads | `integrationBroker.ts:122` checks only that callers are loopback | verified |
| E6 | The hidden model waits 180 s by default | `hiddenModel.ts:118` `opts.timeoutMs ?? 180_000` | verified |

### Section 1: Architecture

Design twice. The plan's shape puts the logo read inside the main case study service. The second
shape gives it its own module, `src/main/siteLogo.ts`, with one call that hides DNS checks,
redirects, caps, decoding and re-encoding. Chosen: the second. It hides one whole policy (what
the app may reach on the internet) behind one function and one test file, and the main service
stays a short orchestrator.

```
  CaseStudyScreen --IPC--> caseStudy (main) --gather--> config, profile, foundations offer, roster,
     (iframe srcdoc,          |                         PulseService.figures(range)  [new]
      3 editable regions)     |--draft--> runHiddenModel(noTools, 60 s)
            ^                 |--logo---> siteLogo.readSiteLogo  [new module]
            |                 |--pdf----> hidden BrowserWindow, printToPDF, destroyed after
            |                 '--send---> MailService.send('owner:case-study', mailbox, input + file)
            |                                   '--> hive.appendLog({ kind: 'case-study-sent' })  (no agentId)
            '--- shared/caseStudy.ts: CaseStudyFacts -> pageHtml(facts, edits), draftPrompt(facts)
```

Findings:

- [CRITICAL] (confidence: 9/10) src/main/officeFile.ts:58 — `const rec = officeRecordFromConfig(cfg);`
  then `writeOfficeRecord(home, rec)`: a nudge flag kept in office.json is dropped on the next
  save of an office field, so a dismissed invitation comes back, breaking D7 ("never shows again").
  Fix: the flag lives in the Pulse store, per office (a row in `telemetry_dismissed` with the fixed
  id `case-study-invite`), and `PulseService` returns `caseStudyInvite` in its view, computed from
  30 distinct days with an outcome. `officeRecord.ts` and `officeFile.ts` are not touched.
- [CRITICAL] (confidence: 9/10) src/main/index.ts:1063 — `kind === 'mail-sent' && typeof e.agentId === 'string'`
  counts as a member's sent email (and `pulseBackfill.ts:121` counts it again on backfill). The
  office log line for the owner's send uses its own kind, `case-study-sent`, with no `agentId`, so
  it never counts in Pulse (plan rule "not a work outcome").
- [CRITICAL] (confidence: 8/10) src/main/integrationBroker.ts:122 — the only address check in the
  repo is for loopback callers; nothing guards an outbound read. A check on the hostname before
  `fetch` loses to DNS rebinding. Fix in `siteLogo.ts`: `node:https` (not Electron `net`, whose
  Chromium stack can't be pinned) with a `lookup` hook that refuses loopback, private, link local,
  shared (100.64/10), multicast, unspecified and unique local addresses via `net.BlockList`, with
  IPv4 mapped IPv6 normalized; literal IP hosts checked directly (Node skips `lookup` for them);
  no proxy; redirects followed by hand, each hop re-checked, at most 3; the same rules for the image.
- [INFORMATIONAL] (confidence: 8/10) red flag 8, hand synced list: the plan lists "the fields
  above" for both the page and the draft prompt. Fix: main gathers one `CaseStudyFacts` value, and
  both `pageHtml` and `draftPrompt` in `src/shared/caseStudy.ts` take only it; the customers answer,
  memory and mail are never in that type, so neither builder can reach them.
- [INFORMATIONAL] (confidence: 8/10) red flag 6, two ways to draw the page: the preview and the PDF
  must be one renderer. Fix: the screen shows `pageHtml` in an iframe (`srcdoc`, `sandbox` with
  same origin and no scripts) at paper size, with the three editable regions as `contenteditable`;
  the screen reads their text back. The PDF window loads the same HTML.
- [INFORMATIONAL] (confidence: 8/10) src/main/pulse.ts:271 — `measure` is a closure inside
  `snapshot`. Fix: move its setup into one private method used by `snapshot` and by a new
  `figures(range)`; the last 30 days are built from local midnight dates like `periodRange`
  (`teamPerformance.ts:87`), so a DST change never loses a day. This settles outside voice O5.

Dispositions: all six accepted (standing rule, small mechanics keeping D3, D4, D7 and the plan's
"not counted in Pulse" rule).

### Section 2: Code quality

- [CRITICAL] (confidence: 9/10) src/main/mail.ts:1285 — `if (!found) throw new MailError('refused', mayHaveGone);`
  An earlier case study send the app stopped in the middle of comes back as a plain refusal whose
  text says "tell Michael", with `uncertain` false. The screen would show it as a failure and
  invite a retry. Fix: those two throws (`mail.ts:1283`, `1285`) also carry a new `interrupted`
  mark (a fourth constructor argument), read only by the case study, which treats it as maybe
  sent. Members read only `uncertain` (`mail.ts:1723`), so their behavior is unchanged.
- [INFORMATIONAL] (confidence: 8/10) src/main/mail.ts:1316 — the timeout text also says "tell
  Michael". Fix: the screen shows the mailbox's own text only for refusals; every uncertain or
  interrupted send shows the screen's own "It may have gone out. Check Sent first." in the app's
  language.
- [INFORMATIONAL] (confidence: 7/10) src/main/mail.ts:1652 — the tool handler builds `ComposeInput`
  field by field, so the new local file field stays out of the md-mail tool, and a test pins that.
  `send`'s repeat key (`mail.ts:1240`) is changed to include the file's hash (outside voice OE3).
- [INFORMATIONAL] (confidence: 8/10) src/main/hiddenModel.ts:118 — 180 s default. The screen's
  draft passes 60 s [estimated]; past that the boxes open empty with Retry.
- Also decided: Close is off while a send runs (at most the 60 s send limit plus the Sent check),
  so a result is never dropped unseen.

Shared code: no extraction proposed. `clipUnits` (`src/shared/cutText.ts`) is reused for every cap,
and the Sent check and journal by calling `send`.

Dispositions: all five accepted (standing rule).

### Section 3: Tests

Framework: `node tools/run-tests.cjs` runs `test/*.test.cjs` with `node --test`; Electron tests are
`*.electron.test.cjs`.

```
CODE PATHS                                               USER FLOWS
[+] shared/caseStudy.ts                                  [+] Make and send
  ├── pageHtml(facts, edits)                               ├── [GAP] [→E2E] open, draft, edit, Send, Sent
  │   ├── [GAP] all fields, order, footer                  ├── [GAP] Send double click sends once
  │   ├── [GAP] name switch hides name, logo, website      ├── [GAP] Close off while sending
  │   ├── [GAP] zero figures left out; all zero note       └── [GAP] no mailbox: PDF, then mail app
  │   ├── [GAP] team cap 12 + "and N more"               [+] Error states
  │   └── [GAP] caps via clipUnits; quote signature        ├── [GAP] draft fails: empty boxes, Retry
  └── draftPrompt(facts)                                   ├── [GAP] logo refused: pick a file
      └── [GAP] no customers answer; name out with switch  ├── [GAP] refused send: mailbox reason
[+] main/siteLogo.ts                                       ├── [GAP] timeout or interrupted: may have gone out
  ├── [GAP] private, loopback, mapped v6, literal IP       └── [GAP] PDF render fails: message
  ├── [GAP] redirect off site or to private refused
  ├── [GAP] image on another public host allowed
  ├── [GAP] SVG, too big, too slow refused
  └── [GAP] http tried once over https
[+] main/pulse.ts figures(range), invite
  ├── [GAP] figures equal snapshot for the same span
  ├── [GAP] 30 local days across DST
  └── [GAP] invite at 30 distinct days, per office, dismiss survives an office save
[+] main/mail.ts send with a file
  ├── [GAP] file attached; key includes its hash
  ├── [GAP] interrupted mark only on the two throws; members unchanged
  └── [GAP] md-mail tool cannot pass a local file
[+] main/index.ts log observer
  └── [GAP] case-study-sent never counted (live and backfill)
[+] PDF (macOS)
  └── [GAP] [→E2E] one page, right to left in Arabic

LLM integration: the draft prompt is pinned by unit tests on its fields; no eval suite applies
(one call, the owner edits the result).

COVERAGE: 0/27 paths tested (all new)  |  GAPS: 27 (2 E2E, 0 eval)
```

Regression contract (decided under the standing rule on test shape): member sends keep every
result they have today (sent, repeated, uncertain, and the same messages); the existing mail tests
stay green, and one new assertion pins that the interrupted throws keep `uncertain` false and their
text.

Tests to add:

| File | Asserts | Kind |
|---|---|---|
| test/case-study.test.cjs | page and prompt from `CaseStudyFacts` only; name switch; caps; zero figures; team cap; quote signature | unit |
| test/case-study-logo.test.cjs | fake `lookup` and server: every refusal above, redirects, image host, caps, http once | unit |
| test/pulse-case-study.test.cjs | `figures(range)` matches `snapshot`; DST; invite rule; dismiss survives `syncOfficeRecord` | unit |
| test/mail-file-attachment.test.cjs | fake SMTP: file attached, key hash, interrupted mark, md-mail can't pass a file, member results unchanged | unit |
| test/case-study-log.test.cjs | `case-study-sent` is not counted by the log observer or `logPoints` | unit |
| test/case-study-pdf.electron.test.cjs | one page Letter and A4; right to left in Arabic (macOS only) | E2E |
| test/case-study-docs.test.cjs | TELEMETRY.md and README name the send and the logo read | source pin |

Tests made obsolete by this plan: none.

### Section 4: Performance

- [INFORMATIONAL] (confidence: 8/10) logo read: the home page is read as a stream and stopped at
  1 MB [estimated], the image at 2 MB [estimated], 10 s [estimated] for the whole read, never a
  whole body read. Scale: one read per screen open, none once a logo is kept.
- [INFORMATIONAL] (confidence: 7/10) PDF: one hidden window at a time, destroyed after
  `printToPDF`. Scale: one per click.
- Invite check: one `COUNT(DISTINCT day)` over the office's day rows per Pulse view, skipped once
  dismissed. Scale: a few hundred rows; no issue.

Dispositions: both accepted (standing rule).

### Outside voice (eng phase, codex exec -p deepseek-review)

One pass, completed (reading budget kept it inside five minutes). Each finding was checked against
the code; agreement is evidence, and only R1 changes a behavior, so only R1 is asked.

| # | Finding | Severity | Check | Disposition |
|---|---|---|---|---|
| OE1 | The draft prompt would carry legal name, CEO, phone, email, social and street address if built from `companyProfileContext` | Critical | verified, `companyProfile.ts:171` adds all of them | Accepted (standing rule; tightens the approved 0B list): `CaseStudyFacts` takes only business type and city (config), industry, service area, hours and languages (profile), the foundations offer, roles, each member's role description and scheduled job names (D13) and figures; business name and website only with D8 off. Never legal name, CEO, address, phone, email, social, currency. The CEO name is used only to sign the quote, never in the prompt |
| OE2 | "30 days with an outcome" can't be a bare `COUNT(DISTINCT day)`: daily rows exist for days with only prompts or tools | High | verified, `db.ts:89` rows per agent per day with cost columns | Accepted: a day counts when emails, sent, tasks or checks is above zero for any member (Pulse's four outcomes); Michael's routing does not count |
| OE3 | The send once key must hash the PDF, or a second Send within 10 minutes returns `repeated` | High | verified, `mail.ts:1240` | Accepted: a change to `send`'s key, not only a test (Section 2 now says so) |
| OE4 | No string inventory for en, ar, zh-CN | High | verified, the plan named the locales only | Accepted: every new string is in all three locales (buttons, picker reasons, outcomes, tick, hints, office log line); the email's language is R1 |
| OE5 | One model call, two boxes: no output contract | Medium | verified, `runHiddenModel` returns text | Accepted: the prompt asks for JSON `{ "about", "closing", "subtitle", "headlines": { "<figure>": "<words around {n}>" }, "team": { "<member id>": "<line>" } }`; parsed, each capped with `clipUnits`; unparsable output opens every drafted part empty with Retry (D13); a test pins it |
| OE6 | Logo read gaps: tag extraction, relative URLs, reserved ranges, image bombs, proxies | Medium | verified, no HTML parser dependency | Accepted: tags read with a bounded scan of the page's head (no new dependency), URLs resolved with `URL`; the block list adds 0.0.0.0/8, 192.0.0.0/24, 198.18.0.0/15, 240.0.0.0/4; width and height read from the file header before decoding, refused over 4096 px [estimated]; behind a proxy the read fails and the owner picks a file (recorded limit) |
| OE7 | PDF and logo files left on disk; mailto limits | Medium | verified, unspecified | Accepted: the PDF for Send is built in memory and never written; Save as PDF writes only where the owner chooses; a picked logo is re-encoded and copied into the private folder; the mailto link carries the address, subject and permission line only, URL encoded, under 2,000 characters |

### R1: the language of the email to us
Finding: OE4 (High, confidence 8/10, outside voice, verified): the plan never says which language
the email's subject, body and permission line use.
Plan baseline: none; D10 fixed the permission's words, not their language.
Runtime evidence: the app runs in en, ar or zh-CN; case studies are read at hello@dontbemichael.com.
Comparison grid:

| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 email language | unspecified, pending | app language, then English | English only | app language only |
| On page language | app language (D5) | unchanged | unchanged | unchanged |
| Tick on screen | app language | unchanged | unchanged | unchanged |

Question D11:
D11 — Which language is the case study email to us written in?
Project/branch/task: the case study plan on mit/october-cash-flow-discrepancy-b32468, eng review.
ELI10: The page itself is in the owner's language. The email that carries it has a subject, a
short body and the line that gives us permission to publish and promises take down. We need to
read it; the owner needs to know what they agreed to.
Stakes if we pick wrong: an owner gives permission in words they can't read, or we get an email
we can't read.
Recommendation: A because the owner reads the promise they gave and we read the same words in English.
Note: options differ in kind, not coverage — no completeness score.
Header: Email language
Options:
A) Both languages (recommended)
Subject, body and permission line in the app's language, then the same in English. Arabic and Chinese owners read what they agreed to; we always have English. Effort: human ~30 min / CC ~5 min. Slightly longer email.
B) English only
Every case study email is in English. Simplest and uniform for our inbox. An Arabic or Chinese owner sends a permission line they may not read.
C) App language only
The owner's language only. The owner reads everything; we translate Arabic and Chinese emails ourselves before publishing.

State: approved
Actual answer: C) App language only (owner, D11, 2026-11-03)
Accepted scope: the email's subject, body and permission line (D10's words) are written in the app's
language only, the same language as the page and the tick; all three locales carry them. We translate
Arabic and Chinese case studies ourselves before publishing. Page and tick languages unchanged.
History: none

### Approval readiness (eng)

Approval readiness: PASS. Checked R1 against D11's answer (C, App language only,
2026-11-03). Every other eng remedy (A1 to A6, C1 to C5, P1, P2, OE1 to OE7, the structure and the
regression contract) is a small mechanic keeping an approved CEO row (D1, D3, D4, D5, D7, D8, D10)
and is decided under the owner's standing rules of 2026-10-27; none changes a behavior the owner sees.

### Eng additions to the review body

**NOT in scope (eng).** Reading the logo through an enterprise proxy (the owner picks a file
instead); a public gallery (website repo); an English copy of the email (D11 chose app language
only).

**What already exists (eng).** `MailService.send` with its journal, Sent check and repeat guard
(reused, one new field and one new mark); `telemetry_dismissed` per office (reused for the
invitation); `periodRange` and `span` local day building (reused for 30 days); `clipUnits`;
`net.BlockList` and `node:https` (built in). Nothing is rebuilt.

**Failure modes (eng additions).**

```
  CODEPATH         | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?                  | LOGGED?
  -----------------|--------------------------------------|----------|-------|-----------------------------|--------
  invitation       | office save wipes the flag (A1)      | Y        | Y     | nothing; it stays dismissed | n/a
  office log       | owner send counted as work (A2)      | Y        | Y     | true Pulse figures          | Y
  logo read        | DNS rebinding to a private address   | Y        | Y     | "Pick your logo"            | Y
  owner send       | interrupted earlier send (C1)        | Y        | Y     | "It may have gone out"      | Y
  owner send       | same key, new PDF (OE3)              | Y        | Y     | the new PDF is sent         | Y
  draft            | unparsable model output (OE5)        | Y        | Y     | empty boxes, Retry          | Y
  draft prompt     | contact data reaches the model (OE1) | Y        | Y     | nothing leaves              | n/a
```

0 critical gaps: before these fixes A1 would have been silent and untested; each now has a rescue
and a test.

**Worktree parallelization.**

| Step | Modules touched | Depends on |
|---|---|---|
| Page model and prompt | src/shared | none |
| Pulse figures and invitation | src/main (pulse) | none |
| Mail file attachment and interrupted mark | src/main (mail) | none |
| Site logo | src/main (siteLogo) | none |
| Main service, IPC, log kind | src/main, src/preload | the four above |
| Screen, Pulse entry, locales | src/renderer | main service |
| Docs | docs, root | none |

Lane A: page model. Lane B: Pulse. Lane C: mail. Lane D: site logo. Launch A to D together, merge,
then the main service, then the screen; docs any time. Conflict flag: lanes B, C and the main
service all touch `src/main/index.ts` lightly; sequence those edits. On the one running branch
(owner rule), run it sequentially unless the owner asks for lanes.

## Implementation Tasks (eng)

Synthesized from this review's findings. Each task derives from a specific finding above. They
replace the CEO list T1 to T6 for building (same work, sharpened). Effort assumes features ~30x and
tests ~50x human to CC.

- [ ] **E1 (P1, human: ~4h / CC: ~15min)** — shared — `CaseStudyFacts`, `pageHtml`, `draftPrompt` and the JSON reply parser
  - Surfaced by: A4, A5 red flags 6 and 8, OE1, OE5
  - Files: src/shared/caseStudy.ts, test/case-study.test.cjs
  - Verify: allowlist only; name switch; caps via `clipUnits`; zero figures; team cap; unparsable reply gives empty boxes
- [ ] **E2 (P1, human: ~3h / CC: ~15min)** — pulse — `figures(range)` and the per office invitation
  - Surfaced by: A1, A6, OE2
  - Files: src/main/pulse.ts, test/pulse-case-study.test.cjs
  - Verify: figures equal `snapshot` for the same span; DST; 30 outcome days; dismiss survives `syncOfficeRecord`
- [ ] **E3 (P1, human: ~4h / CC: ~20min)** — mail — local file attachment, key hash, interrupted mark
  - Surfaced by: C1, C3, OE3, regression contract
  - Files: src/main/mail.ts, test/mail-file-attachment.test.cjs
  - Verify: fake SMTP; md-mail can't pass a file; member results unchanged; existing mail tests green
- [ ] **E4 (P1, human: ~5h / CC: ~20min)** — main — `readSiteLogo`
  - Surfaced by: A3, P1, OE6
  - Files: src/main/siteLogo.ts, test/case-study-logo.test.cjs
  - Verify: every refusal in Section 3, redirects, other image host, header pixel cap, caps and limit
- [ ] **E5 (P1, human: ~4h / CC: ~20min)** — main — case study service, IPC, `case-study-sent` log kind, PDF
  - Surfaced by: A2, C2, C4, C5, P2, OE7, D11
  - Files: src/main/caseStudy.ts, src/main/index.ts, src/preload/index.ts, test/case-study-log.test.cjs, test/case-study-pdf.electron.test.cjs
  - Verify: log kind not counted live or on backfill; PDF one page, right to left; email in the app language
- [ ] **E6 (P1, human: ~6h / CC: ~30min)** — renderer — screen (iframe preview), Pulse button and invitation, locales
  - Surfaced by: A5, C5, OE4, Section 11
  - Files: src/renderer/src/components/CaseStudyScreen.tsx, the Pulse view, src/renderer/src/i18n/locales/en.json, ar.json, zh-CN.json
  - Verify: states map; Close off while sending; every new string in three locales
- [ ] **E7 (P1, human: ~1h / CC: ~5min)** — docs — disclose the send and the logo read
  - Surfaced by: 0A, Behavior changes
  - Files: TELEMETRY.md, README.md, docs/FEATURES.md, test/case-study-docs.test.cjs
  - Verify: source pin

Unresolved decisions that may bite you later: none.

## Completion summary (eng)

- Step 0: Scope Challenge — scope accepted as-is (chosen arrangement: separate site logo module, no new mail method, invitation in the Pulse store)
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 6 issues found (3 critical)
- Code Quality Review: 5 issues found (1 critical)
- Test Review: diagram produced, 4 gaps identified beyond the CEO test table (invitation storage, log kind, interrupted send, connect time address check)
- Performance Review: 2 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex (deepseek-review), completed, 7 findings, all accepted (1 by owner answer D11)
- Parallelization: 4 lanes, 4 parallel / 3 sequential
- Lake Score: N/A (D11 options differed in kind)

## Design review (2026-11-03)

Target: this plan. Calibrated against `branding/DESIGN.md` (v2, Studio): Pulse §7.27, dialogs §7.23,
buttons §7.7, fields §4.2, color §3. Initial rating 4/10: the plan said what the screen does but
not what the owner or a reader sees. Focus: all seven areas (D12). Mockups are HTML and CSS in the
app's tokens (owner rule, never the image generator). The owner redirected the outside opinion
step to a deep research run on case study design; its findings shaped D15 to D18. Small visual
mechanics below are decided under the owner's standing rule (2026-10-27); each owner choice has a
ledger row (D13 to D19).

Research basis (deep research, 2026-11-03; agency and vendor guides that agree with each other, no
tested conversion data): outcome first with a measured result in the headline and a results band
at the top; a short business, team, results story; results as large numbers with what was
counted, when and by what; spend always shown with its context; the quote as a large callout.
Sources: [Veza Digital](https://www.vezadigital.com/post/best-saas-case-study-page-examples),
[Genesys Growth](https://genesysgrowth.com/blog/designing-customer-case-study-pages),
[Candu](https://www.candu.ai/blog/case-study-design),
[Visme](https://visme.co/blog/case-study-one-pager/),
[Shopify customer stories](https://www.shopify.com/retail/topics/case-study),
[INFORMS on cost transparency](https://informs.org/News-Room/INFORMS-Releases/News-Releases/New-Research-Finds-Cost-Transparency-Can-Increase-Sales-20).

### Pass 1: Information architecture (4/10 → 9/10)

The page is a Persuade surface (published), the dialog an Operate surface.

```
  PAGE (Letter or A4)                         DIALOG (Dialog.tsx, fill)
  +----------------------------------+        +--------------------------+-----------+
  | HERO (logo color)                |        |                          | Headline  |
  |  logo  name / type, city / site  |        |   the page, drawn at     |  3 radios |
  |  CASE STUDY                      |        |   paper size, scaled     | Period    |
  |  headline with [locked number]   |  1st   |   to fit, editable       | Name sw.  |
  |  subtitle                        |        |   parts dashed           | Send from |
  +----------------------------------+        |                          | Tick      |
  | RESULTS BAND  4 numbers + source |  2nd   |                          | [Send]    |
  +----------------------------------+        |                          | [Save PDF]|
  | The business      |  "Quote"     |  3rd   +--------------------------+-----------+
  | The team (rows with figures)     |
  | While the owner was away (bars)  |
  | Why a small business ... (tint)  |
  | mark  Made with ...   site       |
  +----------------------------------+
```

First the measured headline, second the results band, third the story. In the dialog: first the
page, second the headline choice, third Send. Persuade checks: one action (on the page, our site
in the footer; on the website the CTA is the website repo's); proof beside each claim (every
number is a counted figure with a source line); no invented risk reversal. Remaining: the web
rendering of a received case study is the website repo's (not in scope).

### Pass 2: Interaction states (5/10 → 9/10)

```
  FEATURE          | LOADING                 | EMPTY                        | ERROR                    | SUCCESS        | PARTIAL
  -----------------|-------------------------|------------------------------|--------------------------|----------------|-------------------
  Drafted text     | parts show "Writing a   | (n/a)                        | parts empty, one Retry   | text in place  | filled parts kept
  (headline words, | first draft" in ink-3   |                              | under the page; a team   |                | empty ones Retry
  subtitle, about, |                         |                              | line falls back to the   |                |
  team, why)       |                         |                              | stored role description  |                |
  Headline choices | the figure chips show   | fewer than 3: only those     | (n/a)                    | radio picked   | 1 or 2 choices
  Hero color       | our ink until the logo  | our ink                      | our ink                  | logo color     |
  Logo             | white tile, initials    | initials on the tile; Change | initials; Change         | logo           |
  Results band     |                         | D19 empty state, Save and    | band left out, a note    | 4 numbers      | under 3 nonzero:
                   |                         | Send off                     | "Couldn't read Pulse"    |                | fewer columns
  Away strip       |                         | no away time: "Hours the     | strip left out           | bars           |
                   |                         | office worked", one legend   |                          |                |
  Fit              |                         |                              | over a page: the page    | fits           |
                   |                         |                              | marks the overflow, Save |                |
                   |                         |                              | and Send off             |                |
  Send             | button reads "Sending", | (n/a)                        | the mailbox's reason in  | "Sent. We read | may have gone out
                   | Close off               |                              | a coral free note        | every one."    | note (eng C2)
```

Decided: a failed team line starts from the member's stored role description rather than empty,
so the owner edits instead of writing from nothing.

### Pass 3: Journey (5/10 → 9/10)

```
  STEP | OWNER DOES                     | OWNER FEELS                 | PLAN SPECIFIES
  -----|--------------------------------|-----------------------------|---------------------------------------------
  1    | sees the invitation on Pulse   | proud: a month of work      | indigo soft mark, "Your office has a month of
       | after 30 work days             |                             | work to show", Make my case study / Not now
  2    | opens it                       | curious, a little wary      | the page appears at once with their own logo
       |                                |                             | color and real numbers; drafts fill in
  3    | reads the headline             | "that's us"                 | a counted number, three headline choices
  4    | edits the words                | in control                  | dashed editable parts; numbers locked, said so
  5    | ticks permission, sends        | safe: nothing left unasked  | the take down promise beside the tick
  6    | sees "Sent"                    | done, maybe featured        | "Sent. We read every one." and the office log
```

5 seconds: their own colors and a big real number. 5 minutes: edit, tick, send. Later: their page on
our website, made of facts they can stand behind.

### Pass 4: AI slop risk (5/10 → 8/10)

Classifier: page PERSUADE, dialog OPERATE. Hard rejections: none. Litmus: brand unmistakable
(the business's own color, logo and name) yes; one anchor (the headline) yes; scannable by
headings yes; one job per section yes; cards necessary (none on the page; the Why tint is a band,
not a card) yes; motion none, fine for print; premium without shadows yes (the page has none).
Avoided: no gradient, no icon tiles, no left border accents, no centered layout, no generic
headline (the number and business name are required in it). Remaining risk: drafted words can
drift into marketing phrases; the draft prompt forbids hype words and the owner edits.

### Pass 5: Design system (5/10 → 9/10)

Dialog: `shell/Dialog.tsx` with `fill`; groups as soft panels (`fieldText` Panel, Field); buttons
§7.7 (Send primary, full width, first; Save as PDF secondary); switch §7.12; `InfoTip` for every
explanation (less verbose UI); a mailbox that can't send greyed with its reason (connector rule);
the D9 address in Plex Mono. Page: Sora and IBM Plex Mono only, numbers in mono (§4.1), hairline
rules, the Struck M mark from `branding/`. The hero color is outside the brand palette on purpose
(D17): it is the business's page. No new app components besides the screen itself.

### Pass 6: Responsive and accessibility (3/10 → 8/10)

- Window: the dialog fills the window (`fill`); the page scales to the height left; the controls
  column stays 330 px; below 900 px wide the page scales further rather than stacking.
- Keyboard: Tab goes through the page's editable parts in reading order, then the controls; Esc
  closes only outside a field and never while sending (eng C5).
- Screen readers: the page is an `article` named "Case study page"; each locked number reads
  "1,284, from Pulse, can't be edited"; the away strip has a text label with both totals; the
  dashed outline is visual only, each part is labelled ("Headline, editable").
- Contrast: white on the hero 4.5:1 by construction (D17); every page text 4.5:1 or better; the
  smallest printed text is 9 px (source line, legend) and only for meta.
- Arabic: the whole page mirrors, the away strip included (latest day on the left); numbers stay
  Latin digits as in the app.
Remaining: touch targets are desktop sized (Mac and Windows app only).

### Pass 7: Unresolved decisions

None. Asked and decided: D13 to D19. Decided under the standing rule: failed team lines start
from the role description; Send above Save as PDF; Arabic mirrors the strip.

### NOT in scope (design)

- The case study's page on our website (website repo).
- A color picker for the hero (D17 chose the logo color; the owner changes it with the logo).
- Photos of the owner or the business: no verified evidence they help, and they bring consent and
  file handling the plan doesn't have.

### What already exists (design)

`shell/Dialog.tsx`, `fieldText` panels and fields, `InfoTip`, the §7.7 buttons and §7.12 switch,
Pulse's tile figures and labels, the Struck M mark in `branding/`.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Pulse entry and the case study dialog | /Users/moblizeit/.gstack/projects/agentvivekkumar-dontbemichael/designs/case-study-20261103/case-study-mockup.html | outcome first page in the logo's color, controls column on the right | screenshot mockup-shot.png in the same folder; fits Letter with 5 rows; the 8 row case sets the caps |

## Implementation Tasks (design)

Synthesized from this review's findings. They add to E1 to E7 (features ~30x human to CC).

- [ ] **DS1 (P1, human: ~6h / CC: ~30min)** — shared — Outcome first page HTML and print styles
  - Surfaced by: D15, D17, D18, Passes 1, 4, 5
  - Files: src/shared/caseStudy.ts, test/case-study.test.cjs
  - Verify: hero color contrast 4.5:1 and fallbacks; 8 rows plus every part fit Letter and A4; strip from per day sums; Arabic mirrors
- [ ] **DS2 (P1, human: ~3h / CC: ~15min)** — shared — Headlines from figures with a locked number
  - Surfaced by: D16, D19
  - Files: src/shared/caseStudy.ts, test/case-study.test.cjs
  - Verify: up to 3 choices from nonzero figures; the number can't be edited; no figure gives the D19 state
- [ ] **DS3 (P1, human: ~2h / CC: ~10min)** — pulse — Per day running sums and per member figures for the range
  - Surfaced by: D13, D18
  - Files: src/main/pulse.ts, test/pulse-case-study.test.cjs
  - Verify: daily totals and away parts equal `running` points summed per local day; member figures match Pulse
- [ ] **DS4 (P1, human: ~6h / CC: ~30min)** — renderer — Dialog per Pass 5, states per Pass 2, keyboard and labels per Pass 6
  - Surfaced by: Passes 2, 5, 6, D19
  - Files: src/renderer/src/components/CaseStudyScreen.tsx, locales en, ar, zh-CN
  - Verify: the states table; Tab order; screen reader labels; Send first and full width

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | branding/DESIGN.md v2; new dialog and page  |
  | Step 0               | 4/10; all 7 areas (D12)                      |
  | Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes                      |
  | Pass 2  (States)     | 5/10 → 9/10 after fixes                      |
  | Pass 3  (Journey)    | 5/10 → 9/10 after fixes                      |
  | Pass 4  (AI Slop)    | 5/10 → 8/10 after fixes                      |
  | Pass 5  (Design Sys) | 5/10 → 9/10 after fixes                      |
  | Pass 6  (Responsive) | 3/10 → 8/10 after fixes                      |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                            |
  | What already exists  | written                                      |
  | TODOS.md updates     | 0 items proposed                             |
  | Approved Mockups     | 1 generated (3 rounds), 1 approved           |
  | Decisions made       | 7 added to plan (D13 to D19)                 |
  | Decisions deferred   | 0                                            |
  | Overall design score | 3/10 → 8/10                                  |
  +====================================================================+
```

Unresolved decisions: none. Plan is design-complete. Run /design-review after implementation for
visual QA.

## Eng pass on the design additions (2026-11-03)

Scope: D13 to D19 and DS1 to DS4 only; everything else keeps the first eng review's record. Every
remedy enforces an approved decision (D4, D13, D16 to D19) and is decided under the owner's
standing rule on small mechanics; no question was needed. Scope accepted as-is; no new module
(color math joins `src/shared/caseStudy.ts`, sampling joins `src/main/siteLogo.ts`).

Receipts:
- Running points are office wide (`agentId: null`) and already split at local midnight, each
  stamped one millisecond before the next day (`telemetryStore.ts:258` `r.until = end === next.getTime() ? end - 1 : end`),
  so the away strip sums points by `dayKey(ts)` exactly, with Pulse's own range filter
  (`teamPerformance.ts:279`).
- Member figures come from the same per member day rows as the band (`MemberDay`,
  `teamPerformance.ts:16`); Michael's is requests routed (`telemetryProcessor.ts:390`).
- No code reads image pixels today (no `toBitmap` in `src/main`).

### Findings

- [CRITICAL] (confidence: 8/10) mockup headline, `<span class="lock" contenteditable="false">`
  inside an editable heading — a non editable chip inside an editable host can still be removed
  by selecting across it and pressing Delete, so the D16 lock fails. Fix: the headline is two
  sibling editable spans (before, after) with the number outside them; the screen sends main only
  `{ before, figure, after }`, and main fills the number from Pulse itself, so a number typed into
  either span is the only way one could appear (see the next finding).
- [CRITICAL] (confidence: 8/10) D4 on drafted text: the reply format lets the model write any words,
  so a drafted subtitle, About, team line or Why could carry an invented number ("saves 10 hours
  a week"). Fix: the prompt forbids numbers; main refuses any drafted part containing a digit or a
  spelled out number word in the app's language, redrafts once, then opens that part empty with
  Retry. A headline template must contain exactly one `{n}` and no other number, or the locale's
  built in template for that figure is used. Text the owner types stays the owner's words, except
  the headline's words, where typed numbers are refused too, checked again on Save and Send (D20).
- [INFORMATIONAL] (confidence: 8/10) member figure undefined: each row shows the member's largest
  of emails organized, emails sent, tasks finished and checks for the period, labelled by kind
  ("640 emails"); Michael shows requests routed; a member with none shows no figure. The band's
  totals equal the sum of the rows' sources (a test pins it).
- [INFORMATIONAL] (confidence: 7/10) hero color (D17): main resizes the kept logo to 32 px and reads
  `toBitmap()` (BGRA); a pure function in `src/shared/caseStudy.ts` skips pixels under 50% alpha,
  near white, near black and with saturation under 0.15, takes the most common hue bucket,
  darkens it in steps until white text reaches 4.5:1 by WCAG relative luminance, and derives the
  tint and away shades. Computed once when a logo is kept and stored beside it; no usable color
  gives our ink.
- [INFORMATIONAL] (confidence: 7/10) one page fit per language: character caps fit English, but
  Chinese and Arabic set differently. Caps are per locale, and the Electron test renders the worst
  case (8 rows, every part at its cap, a quote) in en, ar and zh-CN at Letter and A4 and asserts
  `printToPDF` gives one page.
- D19 note: with only Last 30 days and This month, a longer period with work exists only on a
  31st, so in practice the empty state shows its message; no change.

Dispositions: all accepted (standing rule). Performance: 32 px sampling once per logo, 30 day sums
over at most a few thousand points; no issue.

### Tests added

| File | Asserts |
|---|---|
| test/case-study.test.cjs (extends E1) | headline built from `{ before, figure, after }`; a digit or number word in any drafted part is refused; one `{n}` rule; color pick on fixed pixel arrays (grey, white, transparent, saturated) and the 4.5:1 darkening; member figure choice; quantity words (dozens, half, hundreds and their ar and zh-CN forms) refused in drafts; antialiased edge pixels don't win the color; tint and away shades keep label text at 4.5:1 |
| test/pulse-case-study.test.cjs (extends E2) | per day away sums equal `running` points by `dayKey(ts)`, including a point ending at 23:59:59.999; for each kind the band shows, its figure equals the sum of that kind over the members |
| test/case-study-pdf.electron.test.cjs (extends E5) | worst case fits one page in en, ar, zh-CN at Letter and A4; in Arabic the page mirrors, the strip runs latest day on the left and the headline spans keep the number between them |

Value: protects=no unmeasured number on a published page (D4, D16); fails_when=the number sits inside an editable host or drafted digits pass; why_new=new headline and drafted parts; seam=none; no_claim=what the model writes beyond the checks

### Tasks (eng pass)

- [ ] **EP1 (P1, human: ~2h / CC: ~10min)** — shared and renderer — Split headline and the number check on drafted parts
  - Surfaced by: the two critical findings
  - Files: src/shared/caseStudy.ts, src/main/caseStudy.ts, src/renderer/src/components/CaseStudyScreen.tsx, test/case-study.test.cjs
  - Verify: unit tests above
- [ ] **EP2 (P1, human: ~2h / CC: ~10min)** — shared and main — Logo color pick and per locale caps
  - Surfaced by: hero color and fit findings
  - Files: src/shared/caseStudy.ts, src/main/siteLogo.ts, test/case-study.test.cjs, test/case-study-pdf.electron.test.cjs
  - Verify: pixel array tests; worst case one page in three languages

Completion: Step 0 scope accepted as-is; 2 critical and 3 informational issues, all mapped; 0
critical gaps; 0 unresolved decisions; outside voice below.

### Outside voice (eng pass, codex exec -p deepseek-review)

One pass, completed. Checked against the code; dispositions:

| # | Finding | Severity | Disposition |
|---|---|---|---|
| EP-O1 | Owner typed digits beside the locked number still publish | Critical | Owner answer D20: typed numbers are refused in the headline's words only, checked again on Save and Send |
| EP-O2 | "Member figures sum to the band" can't hold (spend, away hours, largest kind per row) | High | Factual correction: the test is per kind, band figure equals the sum of that kind over members |
| EP-O3 | No "last 30 days" Period exists (`teamPerformance.ts:66`) | High | Factual: eng A6 already builds the 30 day span as a `DayRange` for `figures(range)`, not a Period; the label's day count comes from that range |
| EP-O4 | Color thresholds and shade contrast untested | Medium | Accepted: antialias and contrast cases added to the unit test |
| EP-O5 | Number ban misses quantity words | Medium | Accepted: a per locale list of quantity words in drafts |
| EP-O6 | Arabic test only counts pages | Medium | Accepted: mirroring, strip direction and headline spans asserted |
| EP-O7 | Drafting still runs with no work | Low | Accepted: in the D19 empty state no draft call is made |

Approval readiness: PASS. Checked D20 against its answer (A, 2026-11-03); the other remedies are
mechanics enforcing D4, D13 and D16 to D19 under the standing rule.

## Design review follow up (2026-11-03)

The headline's number sat in a grey box in IBM Plex Mono, so it looked pasted on (owner). D23: it
is now set in the headline's Sora at 700, no box, in `highlight`, a light tint of the logo's hue
from `heroPalette`, checked to 3:1 on the hero. Drawn in four hero colors at
/Users/moblizeit/.gstack/projects/agentvivekkumar-dontbemichael/designs/case-study-headline-20261103/headline-final.png.
Pass 4 (slop) and Pass 5 (system) stay 8 and 9: one font in the headline, no decorative chip.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 4 proposals, 4 accepted, 0 deferred |
| Outside Review | `codex exec -p deepseek-review` | Independent 2nd opinion | 4 (CEO 2, 1 timed out; eng 1; eng pass 1) | completed | CEO 7, eng 7, eng pass 7 findings; all resolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 for this plan | ISSUES OPEN (all mapped to tasks) | run 1: 17 issues; run 2 (design additions): 5 issues; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 2 for this plan | CLEAR | score: 3/10 → 8/10, 7 decisions; follow up: 1 decision (D23) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex with the deepseek-review profile: CEO phase (pass 2 completed), eng phase (completed), eng pass on the design additions (completed, 7 findings: 1 Critical settled by D20, 2 factual corrections, 4 accepted). Design phase skipped (the owner chose a deep research run instead).
- **CROSS-MODEL:** both reviewers found the headline lock and D4 enforcement as the weak point of the design additions. DeepSeek added owner typed numbers (settled by D20) and corrected the member to band test; the native pass added the deletable chip and the per locale fit.
- **VERDICT:** CEO and DESIGN CLEARED. Eng review complete with every issue mapped to tasks (E1 to E7, DS1 to DS4, EP1, EP2) and no decision open; its stored status stays issues open by the log's rule.

NO UNRESOLVED DECISIONS
