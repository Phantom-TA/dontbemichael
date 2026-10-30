# Report failures to the developers automatically

Status: CEO review in progress (2026-10-27). Step 0 settled: PR1, AP1, E2,
E2b, E3, E7, SR1, SR2, SR3, SR4 approved; E1, E4, E5, E6 declined; mode
SELECTIVE EXPANSION. Spec review: round 1 4/10, round 2 6/10, round 3 6/10 (cap reached); every
finding applied below, verified by hand, not re-reviewed.

## Ask (owner, 2026-10-27)

"the entire system may keep failing silently such as agents erroring out in
the terminal, during routing, some harness specific issues or other
situations. As the entire system is targeted for business owners who may not
be technical, so allow the running instance to log issues and PRs to the
github automatically."

## System audit

What exists, with receipts (static read of `be64e6e9` plus this branch):

| Area | Today | Receipt |
|---|---|---|
| Main process crashes | `uncaughtException` / `unhandledRejection` print to the console only; a packaged build keeps no file | `src/main/index.ts:217-222` |
| Event log | `<hive>/log.jsonl` (`appendLog`), no rotation; its own write failure is swallowed | `src/main/hive.ts:6017-6027` |
| Failure kinds already logged | `drop` (hop-cap, no-inbox, malformed-json, outbox-not-a-file, owner-outbox-not-routed), `agent-exit`, `proxy-degraded`, `hook-server-error`, `trust-check-failed`, `*-fallback`, `*-unread` | `hive.ts:3403,3567,3736,3798,4630,6007,1557`; `hooks.ts:371`; `index.ts:1137` |
| Agent exits | abnormal exits write `<hive>/crashes/<iso>-<agent>.log` with the raw terminal tail (may hold tokens and paths, gitignored for that reason); `agent-exit` is logged but **nothing reads it** | `hive.ts:5971-6014`, `hive.ts:1199-1211`, grep: one writer at `hive.ts:6007`, no reader |
| Router | the 1.5 s router tick swallows every throw | `hive.ts:3644` |
| Screen crashes | `ErrorBoundary` logs to the console; no `window.onerror` | `renderer/.../ErrorBoundary.tsx:17` |
| Out of credit / expired login | Claude's StopFailure is registered only for `rate_limit`; other stop reasons leave the office stopped silently | prior learning `stopfailure-only-rate-limit` (2026-10-12), `hive.ts`, `hooks.ts` |
| Run outcome | `telemetry_runs.outcome` never records `failed` | prior learning `runs-have-no-failure-signal` (2026-10-24), `telemetryProcessor.ts` |
| Owner surfaces | `ownerToast` (native notice), `silentNotice` + Needs you card, `hive:degraded`; Ask me reports are written by Michael, never by the app | `index.ts:2230`, `index.ts:633`, `hive.ts:1559`, `hive.ts:412` |
| Report a problem | top bar + Help menu; opens a prefilled `issues/new` with versions only and saves a window picture | `src/main/reportProblem.ts`, `src/shared/reportProblem.ts:10` |
| Redaction | `redactSecrets` (keys, tokens); `patternHits` flags emails, phones, cards (detects, does not replace); **no path or name scrubber** | `hive.ts:631`, `shared/dataClasses.ts:170,208` |
| Sending data out | PostHog sender exists with a hard allowlist, **switched off** until the owner shows a choice | `shared/buildFeatures.ts:53` ("never sends without having shown the choice", owner 2026-09-24), `analytics.ts:40,198`, `TELEMETRY.md:3` |
| GitHub from the app | read only (`gh issue list`, releases poll); nothing creates issues | `main/github.ts:31,91`, `updater.ts:203,235` |
| Deferred | "Copy diagnostics for problem reports" (P3, D21 B, 2026-10-04): last 50 event types, exit summaries, redacted, clipboard only | `TODOS.md:1132-1146` |

The repo `agentvivekkumar/dontbemichael` is **public**: anything filed there is
public (prior learning `report-repo-is-public`, owner D7 A 2026-10-26).

## Landscape (WebSearch, 2026-10-27; Aside not installed)

- Layer 1: apps send crash events to a tracker (Sentry, PostHog error
  tracking) that groups them by fingerprint; a human or a bot turns the top
  groups into issues. Scrubbing runs on the device before sending
  (Sentry `beforeSend`; Trezor Suite redacts by category and sends only when
  the user turned it on).
- Layer 2: tools that file GitHub issues straight from an app either ship a bot
  token (extractable from any binary, so anyone can spam or vandalise the
  repo) or put a small relay in front that holds the token, dedupes and rate
  limits.
- Layer 2: agents acting on public issue or PR text were hijacked by prompt
  injection repeatedly this year (Claude Code GitHub Action, Azure DevOps,
  Google ADK).
- Layer 3: for this app the hard part is not "file an issue". It is (a) that
  most failures are never *detected* as failures (nothing reads `agent-exit`,
  the router swallows throws), and (b) that an office's logs are full of its
  customers' names and mail, and the issue tracker is public.

## 0A. Premise

- **Real problem, two halves.** (1) The developers never hear about failures
  in owners' offices, so they stay unfixed. (2) The owner is not told either:
  a member that crashed, a message that was dropped, a check that quietly fell
  back. The ask targets half 1 directly. Half 2 is the same detection work
  pointed at the owner.
- **Target outcome.** A failure in any office reaches the developers as a
  grouped, deduplicated GitHub issue with enough to act on and nothing private,
  without the owner doing anything (always on, SR3).
- **Do nothing cost.** Beta problems stay invisible unless a non technical
  owner notices, finds Report a problem, has a GitHub account and writes it up.
  Windows ships untested every release (owner 2026-10-05), so Windows breakage
  is found late or never.
- **Proxy check.** "Issues and PRs" are the means. The goal is "failures get
  fixed". A PR written by an agent inside a customer's office is a proxy with a
  large risk (see PR1).

## 0B. Existing code leverage

| Sub problem | Reuse |
|---|---|
| Detect failures | `log.jsonl` kinds above, `recordAgentExit`, `silentWatch`, `PulseHealth`, `spawnFailReason` enum (`index.ts:3959`) |
| Classify without free text | closed enums already used for telemetry (`agent_spawn_failed.reason`, `TELEMETRY.md`) |
| Scrub | `redactSecrets` (`hive.ts:631`), `patternHits` (`dataClasses.ts:170`) |
| Send with an allowlist | `analytics.ts` (PostHog, allowlist, off switch, `DO_NOT_TRACK`) |
| Consent wording and switch | `COLLECT_USAGE_STATS` gate, `TELEMETRY.md` contract |
| Human report path | `reportProblem.ts` (top bar, Help menu) |
| Store a GitHub token safely (if ever needed on device) | `safeStorage` in `shared/integrations.ts:6-19` |

## 0C. Dream state

```
  CURRENT STATE                  THIS PLAN                       12-MONTH IDEAL
  Failures print to a     --->   Repo fixable failures are --->  Every failure is detected;
  console nobody reads;          detected, scrubbed and          code bugs reach the main
  owners must find Report        filed as grouped issues,        repo grouped, with counts
  a problem and own a            promoted to the main repo;      per version and OS; owner
  GitHub account                 always on (SR3)                 fixable stops reach the
                                                                 owner; fixes ship to all
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| PR1 (owner) | Ask says "issues and PRs"; agents in an office read customer mail and web text (injection screening exists because of it); repo is public | B: offices file issues only; PRs stay on the developer side | (A: offices open PRs, declined) | approved | D1 answer B, owner 2026-10-27: "lets do everything raised as issue only as doing PR will cost business owner tokens and cost". Scope: no PRs and no model calls for reporting on the owner's machine; decision log e705ba53 |
| AP1 (owner) | How an instance reaches GitHub without a token in the app (landscape L2); no owner tokens spent (PR1) | A: the app files issues itself with a GitHub write key shipped in the app | (B own relay, C PostHog + Action: declined) | approved | D2 answer A, owner 2026-10-27, over recommendation C. Scope: direct GitHub API from the app; the key's extraction risk is accepted and its containment is set in Design > Key containment (SR2); decision log entry 2026-10-27 |
| E1 (owner) | Zero silent failures to the owner (directive 1); `ownerToast` and Needs you exist (`index.ts:2230,633`) | not in scope | (add: one plain owner line per failure, declined) | declined | D4 answer C (skip), owner 2026-10-27. Scope: no owner notices from this plan; NOT in scope |
| E2 (owner) | StopFailure registered for rate_limit only (prior learning, 2026-10-12) | added: out of credit and expired sign in (and similar owner fixable stops, D11) reach the owner as an Ask me card; never filed to GitHub | | approved | D5 answer A, owner 2026-10-27, over recommendation B; delivery as Ask me card per D11. Scope: owner fixable stop reasons only; D4's no notices still holds for technical failures. Reality: already built since 2026-10-12 (`shared/officeBreak.ts:29-32`, `office-stopped-account.md`); this plan adds only "never filed" |
| E3 (owner) | Main failures live only in the console (`index.ts:217`) | added: `failures.jsonl` in userData, capped and rotated, scrubbed facts only; it is the send queue | | approved | D6 answer A, owner 2026-10-27 |
| E4 (owner) | Public repo; trust | not in scope | (add: "What was sent" list, declined) | declined | D7 answer C (skip), owner 2026-10-27; NOT in scope |
| E5 (owner) | Release notes per land (versioning memory) | not in scope | (add: "fixes a problem your office reported", declined) | declined | D8 answer C (skip), owner 2026-10-27; NOT in scope |
| E6 (owner) | PR1: PRs from the developer side only | not in scope | (add: scheduled job drafting fix PRs, declined) | declined | D9 answer, owner 2026-10-27: "considering everything an issue and log as an issue". Read as C (skip): no drafted fixes; every failure becomes an issue. Resolved by D11 |
| E7 (owner) | TODOS.md:1132 deferred (D21 B) | added: the manual Report a problem carries this office's recent automatic report fingerprints | | approved | D10 answer A, owner 2026-10-27, over recommendation B. Scope: fingerprints only (not event logs); replaces the TODOS.md "Copy diagnostics" entry |
| E2b (owner) | D9 words "considering everything an issue" vs D5 framing "never filed to GitHub" | B: owner fixable failures are never filed; they surface on Ask me cards where applicable. GitHub gets only failures the repo owners can fix: technical failures, agents in loops, abnormal code behavior | (A: file credit and sign in stops, declined) | approved | D11, owner 2026-10-27: "well issues that are like account sign, credit expire or simmilar that can be rectified by the business owner or the agents in the system should not be reported to github. they are supposed to be surfaced by ask me cards for owner if applicable. here issues are technical failures, or agents running in loop, abnormal behaviors in the code etc. are the one that needs to go to github as repo owners can actually investigage and fix those". Scope: the classification rule below governs every detection point; E2's notice is delivered as an Ask me card |
| SR1 (owner) | Spec review round 1 (Consistency 1): the app never writes Ask me cards; Michael owns every card (`hive.ts:412`, card lifecycle rule 2026-10-02); the app already hands Michael a typed note to raise a card (`foundations.ts:518` "Foundation gap"). Out of credit or expired sign in also stops Michael, who runs on the same account | A: the app sends Michael a typed note and he raises the Ask me card (Foundation gap pattern); when Michael himself is stopped by the same cause, the app shows a native desktop notice (`ownerToast`) instead | (B Michael only, C app writes the card: declined) | approved | D12 answer A, owner 2026-10-27 |
| SR2 (owner) | Spec review round 1 (Feasibility 1): under AP1 the shipped key with issues write on the main repo lets anyone edit, close or lock every issue there | issues on the main public repo | C + promotion: the app files into a separate private reports repo (the shipped key has issues write there only); a GitHub Action in that repo copies each new report into `agentvivekkumar/dontbemichael`, re-rendered from validated fields only, deduped by fingerprint, linked both ways | (A main repo, B public reports repo: declined) | approved | D13, owner 2026-10-27: "separate private repo is fine as long as those issues can automatically go to the dontbemichael repo" |
| SR3 (owner) | Spec review round 1 (Completeness 3): binding rule "never sends without having shown the choice" (`buildFeatures.ts:50-53`, owner 2026-09-24) | "seen the choice" | C: always on, no visible choice (no setup row, card or switch); the 2026-09-24 rule keeps governing usage stats only; disclosed in TELEMETRY.md and README | (A shown on, B shown off: declined) | approved | D14 answer C, owner 2026-10-27, over recommendation A; decision log 9104d35b supersedes the 2026-09-24 rule for failure reports only. DO_NOT_TRACK: honoured (SR4, D15 A) |
| SR4 (owner) | Spec review round 2 (Consistency 2): DO_NOT_TRACK left open by SR3; `analytics.ts:160` honours it for usage stats (any value but empty or 0) | A: honoured: nothing is sent, the ledger still records | (B ignore it: declined) | approved | D15 answer A, owner 2026-10-27 |
| R9 (owner, Section 9) | Plan partial deploys and rollbacks (engineering preference); flags live in `src/shared/buildFeatures.ts` (`COLLECT_USAGE_STATS` at :53); revoking the key stops sending but not detection or the ledger | A: `AUTO_FAILURE_REPORTS` build flag, on in releases; off skips detection, ledger and sending | (B no flag: not taken) | approved | Decided as recommended under the owner's instruction, 2026-10-27: "decide small choices like the build flag yourself using your recommendation" (D17 question withdrawn) |

## currentDecision (AP1, answered: D2 A)
Commitment comparison:

```text
Commitment                          | Source/approval or pending | Current | A (token in app)          | B (own relay service)              | C (PostHog + scheduled Action)
Offices file issues only            | PR1 approved               | n/a     | yes                       | yes                                | yes
GitHub write token location         | pending                    | none    | inside every app binary   | relay server secret                | GitHub Actions secret in this repo
New server to build and run         | pending                    | none    | none                      | yes (function + store + deploy)    | none; PostHog already wired (analytics.ts)
Grouping and dedupe                 | pending                    | none    | in each app (blind)       | relay code                         | PostHog fingerprints + Action thresholds
Spam / forged reports               | pending                    | n/a     | anyone with the binary    | relay rate limits                  | Action files only past N distinct installs
Delay from failure to issue         | pending                    | n/a     | seconds                   | seconds                            | up to the Action's schedule (e.g. 1 h)
Owner tokens or model calls         | PR1 approved               | none    | none                      | none                               | none
```

Question: D2 — AP1: How should an office's failure reach GitHub without putting a write token in the app?
Project/branch/task: auto reporting failures to GitHub, planned on mit/issue-416-investigation-54a923.
ELI10: To file an issue, something must hold a GitHub key that can write to your repo. If that key ships inside the app, anyone can pull it out and flood or vandalise the repo. So the office sends a small scrubbed failure report somewhere safe, and that safe place files the issue. The app already has a PostHog sender built in (switched off). PostHog groups identical errors, and a scheduled GitHub job in this repo can turn the groups seen in enough offices into issues, holding the key as a repo secret.
Stakes if we pick wrong: a leaked key lets strangers spam the public repo; an own server is one more thing to run, secure and pay for.
Recommendation: C because it reuses the installed sender and an existing vendor, needs no new server, keeps the key in GitHub, and only files what several offices hit.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Key inside the app
  ✅ Simplest code path: the app calls the GitHub API directly with its own key
  ✅ Issues appear within seconds of the failure, no middle service
  ❌ Anyone can extract the key from the download and spam or deface the repo
  ❌ No grouping across offices: every install files its own copy of the same bug
B) Own relay service
  ✅ Full control of grouping, rate limits and issue wording in one place
  ✅ Issues appear within seconds; no third party sees the failure reports
  ❌ A new server, deploy and on call duty; the website repo pushes straight to production
  ❌ Grouping and spam defence must be built from scratch
C) PostHog + scheduled GitHub Action (recommended)
  ✅ Reuses the installed PostHog sender (analytics.ts) with its allowlist and off switch
  ✅ Key stays a GitHub secret; an issue needs several distinct offices, so forged events can't file one
  ❌ Up to an hour's delay before an issue appears, and failure reports pass through PostHog
Net: C gets grouping, spam defence and a safe key for the least new code; B buys speed and privacy from third parties at the cost of running a server.
Header: How reports reach GitHub
A) Key inside the app
The app files issues itself with a GitHub key shipped in the binary. Effort S (human: ~2 days / CC: ~30 min), risk high. ✅ Simplest code path, direct API call ✅ Issues within seconds ❌ Anyone can extract the key and spam the repo ❌ No grouping across offices
B) Own relay service
A small server holds the key, groups reports, rate limits and files issues. Effort L (human: ~2 weeks / CC: ~1 day), risk medium. ✅ Full control of grouping and wording ✅ No third party sees reports ❌ A new server to run and secure ❌ Grouping and spam defence built from scratch
C) PostHog + scheduled GitHub Action (recommended)
Offices send scrubbed failure events through the existing PostHog sender; an hourly Action in this repo files or updates issues for groups seen in several offices. Effort M (human: ~1 week / CC: ~4 h), risk low. ✅ Reuses the installed sender and its allowlist ✅ Key stays a GitHub secret; forged events can't file an issue alone ❌ Up to an hour's delay, and reports pass through PostHog

## Mode

SELECTIVE EXPANSION (D3, owner 2026-10-27, as recommended). Approved before
the mode: PR1 (D1 B), AP1 (D2 A).

## Base scope (from the ask, PR1 and AP1)

1. **Detect.** One main side function `reportFailure(kind, facts)` in a new
   `src/main/failureReport.ts`, called from the points that fail silently
   today:
   - main `uncaughtException` / `unhandledRejection` (`index.ts:217-222`)
   - a screen crash (`ErrorBoundary.tsx:17`) and renderer `error` /
     `unhandledrejection`, through one IPC
   - an abnormal agent exit (`recordAgentExit`, `hive.ts:5971`)
   - a router tick that throws (`hive.ts:3644`)
   - routing drops (`drop` kinds at `hive.ts:3403,3567,3736,3798,4630`)
   - agents in loops: the breaker reaching `constrained` or `stopped`
     (repeated identical tool calls, error storms, runaway output, no
     progress; `breaker.ts`) and message ping pong (`drop` `hop-cap`,
     `hive.ts:3403`) (D11)
   - harness: hook server error and a hook handler that throws
     (`hooks.ts:352,371`), the lossy cmd.exe fallback (`pty.ts:660`), provider
     bridge install failure (`hive.ts:1561`), hidden model fallbacks
     (`*-fallback` kinds)
2. **Describe without private data.** A closed `kind` enum, a fingerprint
   (kind plus app code stack frames, normalized), app version, OS, arch, the
   engine and its CLI version, and an error class. No log text, no terminal
   tail, no office names, paths, mail or customer data.
3. **File.** The app calls the GitHub API with its shipped key (AP1): finds an
   issue (open or closed) for the same fingerprint and comments on it, or
   opens one. Offices never
   open pull requests and spend no owner tokens (PR1).
4. **Classification rule (D11).** Every detection point is one of two
   classes, fixed in code per `kind`, never decided by a model:
   - **Repo fixable** (goes to GitHub): technical failures, agents in loops,
     abnormal code behavior.
   - **Owner or agent fixable** (never to GitHub): expired sign in, out of
     credit and similar account or setup states; surfaced on an Ask me card
     for the owner where applicable (E2).
5. **Always on (SR3, D14 C).** No setup row, card or switch; a computer
   with DO_NOT_TRACK set sends nothing (SR4). Failure reports
   are disclosed in TELEMETRY.md and the README. The 2026-09-24 show the
   choice rule keeps governing usage stats only.

## Accepted scope (base, E2, E2b, E3, E7)

- **Base:** detect at the listed points, describe with scrubbed facts only,
  classify per `kind` (D11), file repo fixable failures to GitHub with the
  shipped key (AP1) into a private reports repo (SR2), promoted automatically
  into the main repo by an Action, never as pull requests (PR1), always on
  (SR3).
- **E2 + E2b + SR1:** owner fixable stops are never filed. Credit and sign in
  already stop the office and tell the owner (`officeBreak.ts`, built
  2026-10-12). SR1 (D12 A) is the rule for any future owner
  fixable kind: a typed note to Michael, who raises the Ask me card, and a
  desktop notice when Michael's own last StopFailure has the same cause. No
  kind in this plan uses it, so nothing is built for it now.
- **E3:** `failures.jsonl` in userData, capped and rotated, scrubbed facts only;
  it is the send queue (offline, quit, no key).
- **E7:** the manual Report a problem carries this office's recent automatic
  report fingerprints; this replaces the TODOS.md "Copy diagnostics" entry.

## NOT in scope

- Pull requests from offices (PR1: owner tokens and cost).
- A relay or PostHog path (AP1: owner chose the shipped key).
- Owner notices for technical failures (E1, D4 C).
- A "What was sent" screen (E4, D7 C).
- "Fixed for you" in the update card (E5, D8 C).
- Fix drafting on the developer side (E6, D9: "everything an issue").
- Filing owner fixable stops to GitHub (E2b, D11).

## Deferred to TODOS.md

- None from this review. (The "Copy diagnostics" entry is replaced by E7.)

## Design (routine mechanics for the approved scope; spec review round 1)

### Kinds and their class (D11: fixed in code, never decided by a model)

| kind | trigger (receipt) | class |
|---|---|---|
| `main-uncaught` | `uncaughtException` (`index.ts:217`) | repo |
| `main-rejection` | `unhandledRejection` (`index.ts:220`) | repo |
| `screen-crash` | `ErrorBoundary.componentDidCatch` (`ErrorBoundary.tsx:17`) | repo |
| `renderer-error` | renderer `error` / `unhandledrejection` (new listeners, one IPC) | repo |
| `agent-exit` | abnormal exit (`recordAgentExit`, `hive.ts:5971`). Exits the app starts never reach it: `PtyManager.kill` deletes the session before the exit lands (`pty.ts:792`); a test proves it for owner stop, respawn, quit and breaker `stopped`. Not reported while an office break is active (`officeBreak`, office wide; there is no per member StopFailure store, and none is added) | repo |
| `router-throw` | `routeOnce` throws (`hive.ts:3644`); one report per distinct fingerprint per run, not per tick | repo |
| `loop-messages` | `drop` `hop-cap` (`hive.ts:3403`) | repo |
| `loop-agent` | breaker reaches `constrained` or `stopped` (`breaker.ts`) | repo |
| `outbox-bad` | `drop` `malformed-json`, `outbox-not-a-file` (`hive.ts:3736,3798`) | repo |
| `research-inbox` | `drop` `unstamped-research-inbox`, `research-unchecked` (the app's own Research guard broke) | repo |
| `canary` | filed only by the release workflow (Section 8); detail `release` | none (never promoted; the Action only checks that it arrived) |
| `proxy-degraded` | `log.jsonl` kind `proxy-degraded` (`hive.ts:1558`, emitted with `hive:degraded` reason `proxy-bind`, `hive.ts:1559`) | repo |
| `owner-outbox-unrouted` | `drop` `owner-outbox-not-routed` (`hive.ts:4630`) | repo |
| `hook-server` | hook server error, a hook handler that throws (`hooks.ts:352,371`) | repo |
| `cmd-fallback` | lossy cmd.exe fallback with a multi line argument (`pty.ts:660`) | repo |
| `bridge-install` | provider bridge install throws (`hive.ts:1561`) | repo |
| `hidden-call-failed` | the hidden call logs `hire-check-fallback`, `work-style-fallback`, `work-style-revise-failed`, `focus-check-skipped`, `standing-check-unread`, `foundation-file-check-unread`, `run-compare-failed` (`hireCheck.ts:99`, `workStyleConvert.ts:94,242`, `standingCheck.ts:34`, `fileFitCheck.ts:46`, `runCompare.ts:164`). Their `reason` is free text today, so each caller also logs `errorClass` from one shared `hiddenErrorClass(error)` that maps `hiddenModel.ts`'s closed set of error strings (a thrown error maps to `threw`). The callers' own literals count too: `unreadable`, `empty` and `no verdict` (an
answer that came back but did not parse, `hireCheck.ts:99`,
`workStyleConvert.ts:94,242`, `standingCheck.ts:34`) are the code side class
`answer-unparseable`. Reported only when the class is code side: `could not submit background check`, `background answer too large` or an answer that does not parse (`hiddenModel.ts:118-128`). Never reported: `engine unavailable` (by design for other engines, `hiddenModel.ts:30`), `cancelled`, `hidden session timed out`, `background check failed`, `no assistant response` (these cannot tell sign in, credit or offline from a bug), and any hidden call while an officeBreak stop is active | repo |
| `trust-check-failed` | `index.ts:1138`, same rule as `hidden-call-failed`; it logs `error`, not `reason`, so the classifier reads `reason ?? error` for every kind | repo |
| (not reported) | StopFailure `rate_limit`, `billing_error`, `authentication_failed` (already handled by `officeBreak`); `drop` `no-inbox`, `not-an-asker`, `only-michael-assigns`, `reply-to-system-sender` (bounced so the agent or Michael fixes it); `drop` `research-off`, `research-held` (the owner's Research setting, by design); spawn `cli_missing` / `cwd_missing` (installer and setup handle them); disk full (`ENOSPC`) | owner or agent |

Every kind carries a closed `detail` value (part of the fingerprint):

| kind | detail values |
|---|---|
| `main-uncaught`, `main-rejection`, `screen-crash`, `renderer-error`, `router-throw`, `bridge-install`, `hook-server` | the Node error `code` if it matches `^[A-Z][A-Z0-9_]{1,23}$`, else `none` |
| `agent-exit` | the signal name (`SIGSEGV`, `SIGABRT`, ...) if `^SIG[A-Z0-9]{2,8}$`, else `code-1` to `code-255`, else `other` |
| `loop-messages` | `hop-cap` |
| `loop-agent` | `repeat`, `error-storm`, `velocity`, `no-progress` (the breaker arm), joined with the level `constrained` or `stopped` |
| `outbox-bad` | `malformed-json`, `outbox-not-a-file` |
| `owner-outbox-unrouted` | `owner-outbox-not-routed` |
| `research-inbox` | `unstamped-research-inbox`, `research-unchecked` |
| `proxy-degraded` | `proxy-bind` |
| `cmd-fallback` | `multiline` (only the lossy case is reported) |
| `hidden-call-failed`, `trust-check-failed` | the caller's log kind (above), joined with the code side error class |

The validators accept only these values per kind.
Every logged kind and drop reason has one of three classes: `repo`
(reported), `owner` (owner or agent fixable, never reported) or `none` (not a
failure: the ordinary events in `log.jsonl`). A test reads every
`reason: '...'` and `kind: '...'` logged in `src/main/*.ts` from the source
and fails if any lacks a class; a second test reads every error string in
`hiddenModel.ts`'s `finish({ ok: false, error: ... })` calls and fails if
`hiddenErrorClass` does not map it.

### What a report holds (no free text)

`kind`; `class`; `detail`; `errorName` (the error's constructor name, `[A-Za-z]{1,40}`,
else `Error`); `frames` (at most 8, see below); `fingerprint`; `appVersion`;
`os`; `osVersion`; `arch`; `engine` (preset id); `engineVersion`; `count`.
Field patterns (the app's validator and the Action's are one shared module):
`kind`, `class`, `detail` closed enums; `errorName` `^[A-Za-z]{1,40}$`;
`appVersion` `^\d+\.\d+\.\d+(-rc\.\d+)?$` (Windows beta ships on rc tags,
`release.yml:6-7`; the Action accepts published prereleases too); `os` one of `darwin`, `win32`, `linux`;
`osVersion` `^\d+(\.\d+){0,3}$`; `arch` one of `x64`, `arm64`; `engine` one
of the `AgentProvider` ids, listed in the shared module itself (it imports
nothing, so the Action can run the one fetched file); a test fails when the
list differs from the `AgentProvider` union (`shared/agentProvider.ts:25-38`),
so a new engine cannot be missed; or `none`; `engineVersion`
`^\d+(\.\d+){0,3}$` or `unknown`; `count` an integer 1 to 1000000;
`fingerprint` `^[0-9a-f]{12}$`.

**Context (2026-10-29, after issue 661).** An optional `context` map of closed
facts that tell one cause of a kind from another. Issue 661 read only
`error-storm:constrained` with `engineVersion` `unknown`, which fits an owner's
limit of 0 (fixed by #660), an agent that recovered and was never cleared
(fixed by #628) and a real storm alike, so it could not be diagnosed. Every
key has a fixed value check per kind (`cleanContext`, in the shared module):
any kind may carry `role` (`michael`, `member`, `research`) and `uptime`;
`loop-agent` adds `limit` and `hits` (whole numbers), `limitSet` (`default`,
`custom`, or `invalid` for a value Settings kept that the breaker cannot use),
`hardStop`, `sinceTool`, `tool` (Claude Code's own tool names, else `mcp` or
`other`, because an MCP tool names a server that can be the owner's), and for
an error storm `codes` (up to five HTTP statuses), `errorSpan` and
`sinceSuccess`. Times are bands only (`under-1m`, `1-5m`, `5-15m`, `15-60m`,
`1-4h`, `over-4h`, `never`). Context is rendered as `context.<key>` rows, is
not in the fingerprint (a failure groups the same whatever its context), and a
bad entry is dropped by the app rather than losing the report; the validator
refuses a report holding one. A release before this has no `context`, so its
reports validate as before against their own schema. `engineVersion` is now the
installed Claude Code version the app last probed (`claudeCliVersion.ts`),
`unknown` for other engines. The body also names where the kind is noticed
(`KIND_SOURCE`), fixed text from the schema, so whoever picks an issue up
starts in the right file.

Never: the error message, log text, terminal tails, office or member names,
paths outside the app bundle, mail, or customer data.

**Frames.** Keep only frames inside the app's own bundle (`app.asar/` or
`/out/`): rewrite to the bundle relative file plus function name and line
(`out/main/index.js:routeOnce:3644`); drop `node_modules`, `node:` internals
and anything else. Only three prefixes are allowed, `out/main/`, `out/preload/` and
`out/renderer/assets/`. Renderer frames are written `out/renderer/assets/<chunk>.js:-:<line>`
(`-` in place of the minified function name, after the content hash is
stripped). Then `^(out/(main|preload)/[\w.-]+\.js|out/renderer/assets/[\w.-]+\.js):([A-Za-z_$][\w$.<>]{0,60}|-):\d+$`;
anything else is dropped. This removes `/Users/<name>/` and `C:\Users\<name>\` by
construction, not by pattern matching.

**Fingerprint.** First 12 hex of sha256(`kind` + `detail` + `errorName` +
frames without line numbers). The version is not in it, so a main process
failure groups across releases. Renderer frames come from content hashed,
minified chunks (`out/renderer/assets/*-<hash>.js`): the hash is stripped and
only the chunk name is kept (no function names), so renderer kinds group
coarsely across releases; that is accepted.

**Never throws.** `reportFailure` catches everything, has a reentrancy guard
(a failure inside it is not reported again), and when the ledger write fails
(for example `ENOSPC` inside `uncaughtException`) keeps at most 50 rows in
memory and drops the rest.

### Issue in the private reports repo

Title `[auto] <kind> <errorName> (<fingerprint>)`. Body: the fields above as
a fixed table, rendered by code, nothing else; frames sit in a fenced code
block so nothing in them is linkified (the Action renders main repo issues
the same way). One label, `auto`, created once
by hand with the repo.

### Filing, dedupe and limits (app side)

```
detect -> classify -> scrub -> ledger row (pending)
                                   |
             sender (main, every 10 min and at start, one at a time)
                                   |
  known fp -> issue number in the ledger?
     yes: add one comment, a single line
          `seen-on <appVersion> <os> <osVersion> <arch> <engine> <engineVersion> count=<n>`
          (once per fingerprint per app version per install)
     no:  search the reports repo for "<fingerprint> in:title"
          found -> remember the number, comment as above
          none  -> create the issue, remember the number
```

- Closed issue matched: comment on it, never reopen (the Action handles
  regressions in the main repo).
- The sender handles one row at a time and stores the issue number the
  moment it is created, and repeats fold into one row, so one install never
  races itself.
- Two offices racing on a new fingerprint can both create an issue; the
  Action dedupes by fingerprint in the main repo and labels the later private
  one `duplicate`.
- Per install cap: at most 5 GitHub writes per hour and 20 per day; beyond
  that rows wait, and repeats of a waiting fingerprint raise its `count`
  instead of adding rows. Searches have their own cap: at most 5 per hour per
  install (a fingerprint whose number is already in the ledger needs none), so
  a release with many new fingerprints spreads them over hours instead of
  meeting the shared token's 30 per minute search limit.
- A 404 on a comment to a known issue number (the issue was deleted): forget
  that number for the row and search or create again; never stop for it.
- 401, a 404 on search or create, or a 403 without `retry-after` and with
  `x-ratelimit-remaining` above 0 (key revoked, expired or repo gone): stop
  sending for this app version, keep the ledger; the next release's key sends what is still kept.
  Revoking the key is the kill switch.
- 429, or a 403 with `retry-after` or `x-ratelimit-remaining: 0` (GitHub's
  secondary and primary limits): wait `retry-after` (or 1 hour), then resume.
- Offline: rows stay pending.

### Key containment (AP1, SR2)

- The private reports repo is owned by a dedicated bot account (a fine
  grained token can only reach repos its own account or org owns). The
  token is that bot's, with repository access only to the reports repo, permissions Issues read and write (plus
  the mandatory Metadata read). A leaked copy can touch only that repo.
- Injected at build as `__REPORT_KEY__` from the CI secret
  `FAILURE_REPORT_KEY` in `release.yml`, beside `POSTHOG_KEY`
  (`electron.vite.config.ts:17`, `release.yml:62`); never in git. Mac and
  Windows release builds both get it.
- No key (dev builds, `npm run dev`, tests): the sender never runs; the
  ledger still records. The reports repo name is a constant, and the sender
  refuses any other target.
- Rotation: a new token before the old one expires, in the next release.
  Installs on old releases stop sending at revoke (above).

### Promotion Action (in the private reports repo, SR2)

- Trigger: hourly schedule plus manual run, one run at a time. It reads the
  reports repo's issues and comments oldest change first from a cursor per
  list, at most 50 a run, so a busy hour is finished by later runs and a
  flood of forged comments cannot burn Actions minutes per event. Its own
  "Promoted to" comments are skipped, both lists are handled in one time
  order, a full page that ends on the cursor's own second reads the next
  page, and reports already counted use no slot. (Ship reviews, 2026-10-28:
  one page since the last run lost anything past the first 50.)
- Its state (the two cursors, the ids of issues and comments already
  counted, the `queued` set of ids only, at most 200, given at most 25 of
  a run's 50 slots, failures to the back, given up after 24 runs; saved after
  every report so a run cut short keeps what it did) is a `state.json` the Action commits to the
  reports repo with its own `GITHUB_TOKEN` (contents write); the app key has
  Issues only and cannot change it. Counting is by issue or comment id, so a
  re-read or edited comment is never counted twice, and `queued` reports are
  retried from `state.json`, not from what changed since the last run.
- Validates each report on its own (an issue body or a `seen-on` comment),
  never trusting an issue's state or labels, so a decoy issue with a real
  fingerprint does not hide valid reports filed on it. Validates every field
  against the schema above (kind in the enum list,
  fingerprint 12 hex, version a published release of
  `agentvivekkumar/dontbemichael`, frames matching the frame pattern,
  `seen-on` exactly the one line format, and the fingerprint the hash of
  the report's own fields). Any failure: label `rejected`, nothing is
  promoted. A release with no schema (any release before reports) rejects.
  A failure that is GitHub's for now (the release list, a schema fetch, a
  report or search that does not answer) queues the report or ends the run;
  it never rejects one.
- Re-renders the main repo issue from the validated fields only (never copies
  text), label `auto-report`; dedupes in the main repo by fingerprint in the
  title; counts go into one "Seen on (unverified counts)" comment the Action
  edits in place, a row per app version and OS with the summed `count`
  (each install's count as of its one `seen-on` per version, so a first seen
  count, not a running total); a
  valid report on a closed main issue for a version newer than its closing
  release (the latest release published before the issue was closed) reopens
  it once per version with "seen again on <version>".
- Links both ways (comment in each).
- Caps per UTC day: 10 new main repo issues and 20 reopens; per run, one
  edit of each "Seen on" comment, at most 50 reports read, a 60 second work
  budget so state is always saved, and a 2 minute timeout. Hourly runs of at most 2 minutes cost at most 1,440 minutes a month
  (24 x 30 x 2), under the free private repo allowance of about 2,000
  [unverified]; a flood leaves the rest `queued`, it cannot use more minutes. Reports past a cap are `queued` and tried on the
  next run; nothing valid is lost.
- A failed or timed out run is not silent: GitHub emails the account that
  owns the scheduled workflow, and the run's summary names the step. The
  bot account's free Actions minutes are checked at setup (the 2 minute run
  cap keeps the month at most 1,440 minutes).
- Its own secret `MAIN_ISSUES_TOKEN`: a fine grained token owned by
  agentvivekkumar (who owns the main repo), Issues read and write on the main
  repo only. What a leaked app key can still do: create
  well formed reports that pass the patterns (enum fields, allowed frame
  paths and function names) and are promoted within the caps; inflate the
  unverified counts; reopen a closed issue once per published version; and,
  inside the private reports repo, edit or delete reports before the next
  hourly run, so it can suppress reports. It cannot touch the main repo
  directly, and nothing outside the patterns reaches it; frames are shown as
  code, never as links.
- The workflow and its script live in the reports repo; the schema module is
  not copied: the Action fetches `src/shared/failureReport.ts` from the main
  repo at the release tag named in each report (as Section 1 says).

### Local ledger (E3)

`userData/failures.jsonl`, written only by main (renderer reports arrive by
IPC, and main runs the scrubber and the validator on them again). Row: `{ts, kind, class, fingerprint, facts, state, count, issue?,
sentVersion?}`, one row per fingerprint and app version: a repeat raises
`count` in any state, never adds a row. `state` is `pending`, `sent`,
`local` (owner or agent class, or DO_NOT_TRACK: never sent) or `dropped`
(pending for more than 30 days). Cap 1 MB: past it, rename to
`failures.1.jsonl` (one old file kept) and carry into the new file every row
that is `pending` or has an `issue` number, so issue numbers and the once per
version marks survive rotation. Pending rows older than 30 days are
dropped. Every office on this computer shares one ledger; rows hold no office
identity.

### Manual report (E7)

Report a problem adds "Recent automatic reports: <fp>, <fp>, ..." for at most
5 fingerprints sent in the last 7 days, to the prefilled body in
`reportProblemUrl`. Fingerprints only (D10); they appear in each main repo
issue's title, so a search finds it.

### Tests (all platform independent, fakes only, no network)

- Scrubber: Mac, Windows and Linux shaped stacks; home paths, `node_modules`
  and node internals gone; at most 8 frames; fingerprint stable across line
  number changes and versions.
- Classifier: every kind has a class; an exit after `billing_error` is not
  reported; `engine unavailable` is not reported.
- Sender with a fake GitHub and clock: create, search hit, known number,
  once per version comment, caps, 401 stops, 429 waits, offline keeps rows,
  no key never calls.
- Ledger: rotation at the cap, 30 day drop, state changes, a partial last line
  after a crash is skipped.
- E7: the URL carries only fingerprints.
- Promotion script: valid report promoted and re-rendered; forged fields,
  free text and unknown version are `rejected`; over cap is `queued` and
  promoted next run; a valid report on a decoy issue is still promoted.
- Agent exit: an exit the app started is not reported.

## HOLD SCOPE checks (selective expansion step 1)

- **Complexity.** About 14 files [estimated] and one new main module; more
  than 8 files, so challenged: the detection points are one line each, calling
  one function, so the spread is wiring, not moving parts. No new service or
  class beyond `failureReport.ts`.
- **Minimum change.** The base scope above is the minimum that covers all
  three failure groups the owner named (terminal, routing, harness). Nothing
  in it is deferrable without leaving a named group silent, so no defer
  question is raised.
- **Invariants carried.** Public repo (never private data); always on with
  DO_NOT_TRACK honoured (SR3, SR4); no owner tokens; no dashes in owner text; fields only with
  explanations behind an InfoTip (less verbose UI); Windows ships each release.

## 10x and delight (selective expansion step 2)

- **10x (as proposed; E1 and E5 were declined, so this is vision only).** The
  same detection that files an issue could also tell the owner and close the
  loop when a release fixes it.
- **Platform potential (vision only, not in scope).** One failure ledger could
  feed issues, owner notices and a Pulse health view.

Candidates (all answered; see the ledger):

| ID | Owner sees | Effort | Risk |
|---|---|---|---|
| E1 | A plain line when a failure affects their office (Needs you or Pulse), not a stack trace | M | low |
| E2 | Out of credit and expired sign in stop the office with a clear notice, not silence (prior learning stopfailure-only-rate-limit) | M | low |
| E3 | A local failure ledger that keeps failures even when sending is off, with rotation | S | low |
| E4 | "What was sent" list in Settings: every report, exactly as sent, with its issue link | S | low |
| E5 | "Fixed in 0.x.y" in the update notes for a failure their office reported | M | medium |
| E6 | Developer side triage: a scheduled job on your machine or in CI drafts fixes for new auto issues (your tokens, never the owner's) | M | medium |
| E7 | Copy diagnostics (TODOS.md, deferred D21 B) attached to the manual Report a problem | S | medium |

## Answered: SR4 (D15)

Owner chose A: DO_NOT_TRACK is honoured; nothing is sent, the ledger still
records.

## Answered: SR3 (D14)

Owner chose C over the recommendation: always on, with no visible choice.
For failure reports only, this overrides the 2026-09-24 show the choice
rule (decision log 9104d35b).

## Answered: SR2 (D13)

Owner chose C on the condition that issues reach the main repo
automatically: the app files into a private reports repo, and an Action
there promotes each report into `agentvivekkumar/dontbemichael`, re-rendered
from validated fields only.

## Answered: SR1 (D12)

Owner chose A: Michael raises the card from a typed app note; when Michael is
stopped by the same cause, the app shows a native desktop notice.

## Answered: E2b (D11)

Owner chose B with a rule that governs the whole plan (see Classification
rule). No question is open in Step 0.

## Answered: E7 (D10)

Owner chose A, over the recommendation to keep it deferred: the manual Report
a problem carries this office's recent automatic report fingerprints.

## Answered: E6 (D9)

Owner: "considering everything an issue and log as an issue". No drafted
fixes; every failure becomes an issue.

## Answered: E5 (D8)

Owner chose C (skip): no "fixed for you" line.

## Answered: E4 (D7)

Owner chose C (skip): no "What was sent" screen.

## Answered: E3 (D6)

Owner chose A: a capped local failure file, also the send queue.

## Answered: E2 (D5)

Owner chose A (add), over the recommendation to defer: out of credit and
expired sign in are told to the owner; they are never filed to GitHub.

## Answered: E1 (D4)

Owner chose C (skip): no owner notices from this plan.

## Answered: PR1 (D1)

Owner chose B: offices file issues only. The owner's reason: "doing PR will
cost business owner tokens and cost". Carried forward: no pull requests and no
model calls for reporting on the owner's machine.

## currentDecision (PR1, answered: D1 B)
Commitment comparison:

```text
Commitment                         | Source/approval or pending | Current | A (instances open PRs)                | B (issues only from instances)
Instances file grouped issues      | ask                        | no      | yes                                   | yes
Instances write code and open PRs  | ask                        | no      | yes, an agent in the office           | no; PRs come from the developer side
Write access to the repo on device | pending                    | none    | needed (token or fork + PR rights)    | none
Customer data near code changes    | pending                    | n/a     | the fixing agent runs beside mail/web | never on the same machine
Injection path to the app's code   | pending                    | none    | a crafted email can steer a PR        | none from offices
```

Question: D1 — PR1: Should a running office open pull requests itself, or only file issues?
Project/branch/task: auto reporting failures to GitHub, planned on mit/issue-416-investigation-54a923.
ELI10: You asked for the app to file both issues and pull requests. An issue just says "this broke". A pull request is a code change, and to write one an agent inside the owner's office would have to edit the app's code and push it to your public repo. That agent sits next to the owner's customer mail and web pages, which is exactly the text attackers use to steer agents.
Stakes if we pick wrong: one crafted email could make an office push a malicious change or leak customer data into a public pull request.
Recommendation: B because issues alone close the "nobody hears about it" gap, and fixes are better written where the code and tests live, by you or a developer side agent.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Offices open PRs too
  ✅ Matches the ask word for word: a failure can arrive with a proposed fix attached
  ✅ Could shorten time to fix for simple, repeated failures across many offices
  ❌ Needs repo write rights on every customer machine and puts code changes beside untrusted mail
  ❌ Fixes made without the repo, tests and CI the office does not have; most would be noise
B) Issues only from offices (recommended)
  ✅ No write access to the code ever leaves your machines; no new injection path into the app
  ✅ Developer side tools (/investigate, a GitHub Action) can still draft PRs from the issues
  ❌ A human or developer side agent still has to pick each issue up to get a fix
Net: PRs from offices buy a little speed at the price of a supply chain and privacy risk; issues get you the signal safely.
Header: PRs from offices
A) Offices open PRs too
Instances write code and open pull requests on the public repo in addition to issues. Effort XL (human: ~3 weeks / CC: ~2 days), risk high; needs repo write rights on every install. ✅ Matches the ask word for word, a failure arrives with a fix attached ✅ Could shorten time to fix for simple repeats ❌ Repo write rights on customer machines beside untrusted mail ❌ Fixes made without the repo's tests and CI
B) Issues only from offices (recommended)
Offices file grouped issues; pull requests are drafted on the developer side from those issues. Effort S for this choice (zero implementation; it removes work), risk low. ✅ No write access to the code leaves your machines ✅ Developer side tools can still draft PRs from the issues ❌ Someone still has to pick each issue up

## 0I. Temporal interrogation

```
  HOUR 1 (foundations):   the kind table and field patterns in src/shared/failureReport.ts;
                          hive.logObserver (hive.ts:6029) already sees every log.jsonl event
  HOUR 2-3 (core logic):  classify -> scrub -> fingerprint -> ledger fold; the frame rewrite for
                          app.asar vs out/ (dev runs from out/, packaged from app.asar)
  HOUR 4-5 (integration): the direct points (uncaught, renderer IPC, router throw, hook handler,
                          cmd fallback, killedByApp mark); __REPORT_KEY__ define; sender with fakes
  HOUR 6+ (polish/tests): source scan test for classes; the promotion script and its tests;
                          TELEMETRY.md + README disclosure; owner setup runbook
```

Effort: human ~1.5 weeks / CC ~5 h for the app side, plus ~1 day / ~1.5 h for
the promotion Action [estimated]. No scope or feasibility blocker; owner setup
steps (bot account, private repo, two tokens, secrets) gate the first real
send, not the merge (no key means no send).

## Review sections (CEO review, 2026-10-27)

### Section 1: Architecture

```
  MAIN PROCESS                                                     GITHUB
  ─────────────────────────────────────────────────────────        ─────────────────────────────
  hive.appendLog ──> logObserver ──┬─> Pulse telemetry (existing)
   (drops, agent-exit, fallbacks,  └─> failureReport.observe ─┐
    proxy-degraded, ...)                                       │
  direct points ──────────────────────> reportFailure(kind, facts)
   uncaught/rejection (index.ts:217)                           │
   router throw (hive.ts:3644)                                 v
   hook handler throw (hooks.ts:352)          classify (shared kind table) ──> owner/none: ledger `local`
   cmd fallback (pty.ts:660)                                   │ repo
   breaker level (index.ts beat)                               v
  renderer ── IPC failure:report ──> (re-scrub, re-validate) scrub + fingerprint
   ErrorBoundary, window error                                 │
                                                               v
                                            fold in memory (fp+version) ── flush ≤30 s ──> failures.jsonl
                                                               │                           (E3, userData)
                                                               v
                                            sender (10 min, serial, caps) ──REST──> private reports repo
                                                                                        │ hourly Action
                                                                                        v (validate, re-render)
                                                                                   main repo `auto-report`
  Report a problem (E7) <── recent fingerprints ── failures.jsonl
```

- **Boundaries.** New: `src/shared/failureReport.ts` (kinds, classes, field
  patterns, render; pure, shared with the Action), `src/main/failureReport.ts`
  (observe, reportFailure, scrub, fold, ledger), `src/main/failureSender.ts`
  (GitHub REST, caps, backoff). The detector does not know GitHub; the sender
  does not know kinds beyond the shared schema.
- **Reuse the event bus.** Most kinds already pass through `appendLog`; the
  reporter wraps `logObserver` (compose with the Pulse observer, never
  replace it). Only six direct calls are new.
- **Coupling.** hive.ts gains no import (observer is set from index.ts);
  index.ts wires it like `analytics`. The Action depends on the shared module,
  which it fetches from the main repo at the release tag being validated
  (`raw.githubusercontent.com`, as `hero.ts:16` does), so there is one source
  and no copy to drift.
- **State machine (ledger row).**
  ```
  (new) ──repo class──> pending ──201/comment ok──> sent ──new version──> (new row)
    │                     │  └──>30 days──> dropped
    └──owner/none/DNT──> local   (terminal; never sent)
  invalid: sent -> pending (a sent row never resends in its version);
           local -> pending (class is fixed in code per kind)
  ```
- **Scaling.** **WARNING:** every install shares one bot token, so GitHub's
  per user limits are global: 5,000 REST calls an hour and roughly 500 content
  creations an hour [unverified, GitHub docs]. Dedupe makes creates rare; a
  new release is the spike (one `seen-on` per fingerprint per install). Past
  the limit installs get 403/429 and wait (Design > Filing); reports are
  delayed, not lost. First to break at 100x: the hourly content limit.
- **Single points of failure.** The bot token (revoked: all sending stops,
  ledgers keep rows); GitHub availability (rows wait); the Action (reports sit
  in the private repo; GitHub emails the schedule owner).
- **Security architecture.** Section 3.
- **Rollback.** Revoke the bot token (minutes; stops every install). Code
  rollback ships in the next release.
- **Value test.** No process artifacts; the issues are product observability.
- **Accepted cherry-picks' fit.** E3 is the fold and queue the sender needs;
  E7 reads it. Both integrate cleanly.

### Section 2: Error & Rescue Map

```
  CODEPATH                    | WHAT CAN GO WRONG                 | CLASS
  ----------------------------|-----------------------------------|------------------------
  reportFailure / observe     | throws inside uncaughtException   | any (guarded)
                              | reentry (a failure while reporting)| reentrancy
  scrub / fingerprint         | stack missing or not a string     | TypeError (guarded)
  ledger flush                | disk full, permission             | ENOSPC, EACCES, EPERM
                              | partial last line after a crash   | JSON SyntaxError
  ledger rotate               | rename held (Windows AV)          | EBUSY (writeFileAtomic retries)
  renderer IPC                | malformed or oversized payload    | validation failure
  sender                      | offline, DNS                      | fetch TypeError
                              | key revoked or expired            | 401
                              | repo gone or no access            | 404, 403 (no retry-after)
                              | rate or abuse limit               | 429, 403 + retry-after
                              | GitHub 5xx                        | 500-503
                              | search lag: create twice          | duplicate (benign)
  Action                      | forged or malformed report        | validation failure
                              | over cap                          | cap
                              | main token revoked                | 401
                              | run timeout                       | timeout

  CLASS                 | RESCUED | ACTION                                         | WHO SEES
  ----------------------|---------|------------------------------------------------|-----------------------
  guarded throw         | Y       | swallow inside reporter only; console.warn       | nobody (by design: the
                        |         | `[failure-report]`                             | reporter must not crash)
  reentrancy            | Y       | dropped                                        | nobody
  ENOSPC/EACCES/EPERM   | Y       | keep ≤50 rows in memory, retry flush next tick | nobody; owner already sees
                        |         |                                                | disk full elsewhere
  SyntaxError (ledger)  | Y       | skip the bad line                              | nobody
  EBUSY                 | Y       | writeFileAtomic retry ladder (100/300/900 ms)  | nobody
  IPC validation        | Y       | drop the report, warn                          | nobody
  offline               | Y       | rows stay pending, next 10 min tick            | nobody
  401/404/403 hard      | Y       | stop sending this version; rows kept           | developers (no reports)
  429/403 limit         | Y       | wait retry-after or 1 h                        | nobody
  5xx                   | Y       | retry next tick (2x backoff, max 1 h)          | nobody
  duplicate             | Y       | Action dedupes in main                         | developers (dup label)
  Action validation     | Y       | `rejected` label                               | developers
  Action cap            | Y       | `queued`, next run                             | developers (delay)
  Action 401/timeout    | N->Y    | run fails, GitHub emails the schedule owner     | repo owner by email
```

- **GAP (was CRITICAL, closed):** when the sender stops on 401/403/404 the
  developers would see silence. Rescue: the reporter writes one
  `failure-report-stopped` line to `log.jsonl` (version, status), and the
  release canary (Section 8) fails the Action and emails the schedule owner
  when the key or the Action is broken.
- No catch alls outside the reporter's own guard, which is the one place a
  catch all is right (it runs inside `uncaughtException`).
- No LLM calls (PR1).

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| Key extracted from the download | High | Med | Accepted (AP1). Contained to the private reports repo (SR2); revoke is the kill switch |
| Forged reports promoted to the public main repo | Med | Med | Patterns and caps (Design); enum and allowed paths only; frames rendered as code |
| Suppression: key holder deletes reports in the private repo before a run | Low | Low | Accepted residual (Design > Promotion Action) |
| Private data in a report (names, paths, mail) | Low | High | By construction: no free text fields; frames whitelisted by prefix; renderer reports re-scrubbed in main |
| Prompt injection into maintainers' agents reading `auto-report` issues | Low | Med | Main issues hold only enum and pattern checked fields; no free text survives re-render |
| Key auto revoked by GitHub secret scanning of the public release asset | Unknown | High | **Unverified.** Deploy checklist: after the first signed release, confirm a test send succeeds and the token is still active |
| Office IP visible to GitHub on each send | High | Low | Same as the existing update check (`updater.ts:203`, every 6 h); no new category |
| MAIN_ISSUES_TOKEN leak (Action secret) | Low | Med | Stays in Actions secrets of a private repo; fine grained to main repo Issues only |
| Supply chain: no new npm dependency | n/a | n/a | REST via Electron `net`/`fetch`; no Octokit |

- **Input validation.** Every field has a closed pattern (Design > What a
  report holds); IPC payload capped at 8 KB and re-validated in main.
- **Authorization.** The app key can write Issues in one private repo only;
  the Action's token Issues in main only.
- **Secrets.** `FAILURE_REPORT_KEY` and `MAIN_ISSUES_TOKEN` in Actions secrets,
  never in git; rotation in the runbook (Section 8).
- **Audit.** The ledger (`sent` rows with issue numbers) and the Action's
  `state.json` history are the audit trail.

### Section 4: Data flow & interaction edge cases

```
  INPUT (error/event) -> VALIDATE (kind known? class) -> TRANSFORM (scrub, fp) -> PERSIST (fold, flush) -> OUTPUT (sender)
     | nil stack -> frames [] (fp from kind+detail+errorName)
     | unknown kind -> class lookup fails -> test catches at build; runtime: `none`, warn
     | huge stack -> first 8 allowed frames only
     | renderer payload too long / wrong type -> dropped in main
     | exception in transform -> guarded, dropped
     | duplicate (same fp+version) -> count += 1, no new row
     | partial line (crash mid write) -> skipped on read
     | stale: app updated with pending rows of an old version -> sent with their own version
```

**Async ordering.** Invariant: one ledger file, every row for a fingerprint
and version appears once, and a `sent` row is never sent again.
- Writers: the fold flush (≤ every 30 s) and the sender's state updates; both
  run on the main thread through one in process queue, and each flush is a
  whole file `writeFileAtomic` of the folded set. Order A (flush, then sender
  marks sent) and order B (sender marks sent, then flush) both read the queue's
  latest in memory set, so neither overwrites the other. The mechanism is the
  single queue; an `await` inside the sender (the HTTP call) does not hold the
  file, and the sender re-reads the row's state from memory after its await
  before marking it.
- Regression proof: a test pauses the fake GitHub response, lets a flush run,
  then resumes; the row ends `sent` with the folded count.
- Shutdown: `before-quit` flushes once, synchronously.

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Report a problem (E7) | no recent fingerprints | Yes | the line is omitted |
| Report a problem (E7) | ledger unreadable | Yes | the line is omitted; the report still opens |
| Report a problem (E7) | URL length | Yes | at most 5 × 12 hex |

No other owner interaction (SR3: no switch, no screen).

### Section 5: Code quality

- Fits existing patterns: a pure shared module plus a main module wired in
  index.ts with injected deps (as `createReporter`, `reportProblem.ts`).
- Reuse: `writeFileAtomic` (`atomicFile.ts:97`), `dntSet` logic
  (`analytics.ts:160`, export it rather than copy), `logObserver`.
- The sender's branch count (status codes) passes 5: split into
  `classifyResponse(status, headers)` (pure, tested) and the loop.
- Names: `reportFailure`, `failureKind`, `FailureClass` say what they do.
- Not over built: no Octokit, no retry library, no new service.

### Section 6: Tests

```
  NEW THING                         TYPE   HAPPY                     FAILURE                         EDGE
  kind/class table (shared)         unit   every kind classed        a logged kind with no class      new reason added later
  scrub + fingerprint               unit   mac/win/linux stacks      home path, node_modules          no stack, 100 frames
  field patterns (shared)           unit   valid report passes       each field off pattern           max lengths
  observe (logObserver compose)     unit   drop -> repo row          owner reason -> local            Pulse observer still called
  direct points                     unit   uncaught -> row           reporter throws inside handler   reentry
  agent-exit                        unit   crash -> repo             app kill never reaches it;        signal vs code
                                                                     office break active -> none
  fold + ledger                     unit   repeat raises count       ENOSPC keeps ≤50 in memory        rotate carries pending/issue
  sender (fake GitHub, fake clock)  unit   create; search hit        401 stop; 429 wait; offline       caps; no key no call
  async order (flush vs sender)     unit   both orders               —                                 paused response
  renderer IPC                      unit   ErrorBoundary -> IPC      oversize, wrong type dropped      —
  E7 URL                            unit   fingerprints added        ledger unreadable                 none recent
  DO_NOT_TRACK                      unit   set -> local, no call     —                                 '0' and '' mean unset
  promotion script                  unit   valid -> main re-render   forged fields, free text rejected decoy issue, over cap queued
  hiddenErrorClass                  unit   every hiddenModel error   unmapped string fails the scan    thrown error -> `threw`
  release canary (Action)           unit   canary seen -> green      none in 3 h -> run fails          canary never promoted
```

- **2am Friday test:** an end to end fake: throw in main, flush, sender
  creates the private issue, the promotion script renders the main issue; the
  main body matches a fixed snapshot with no path or text outside patterns.
- **Hostile QA:** a stack whose frames are `scam.example/visit:Buy:1` and a
  renderer payload with HTML; both must drop out.
- **Chaos:** disk full plus offline plus a 403 limit in one run; the app keeps
  working and the ledger recovers.
- Pyramid: all unit with fakes (platform independent, so they run on the
  Windows CI job too); no network, no time dependence (fake clock).
- No prompt or LLM change.

### Section 7: Performance

- Hot paths: `router-throw` (every 1.5 s) and breaker beats (8 s) can repeat;
  the fold keeps them in memory and the ledger is written at most every 30 s.
  Memory ceiling: rows are per fingerprint and version, so bounded by the kind
  table times frames shapes; the 50 row in memory cap applies only when disk
  writes fail.
- Ledger 1 MB cap; one rotation file.
- Sender: one request at a time, every 10 min; ≤5 writes an hour.
- Startup: reading a 1 MB ledger once (<10 ms [estimated]).
- Slowest paths: the GitHub call (network), the ledger flush (≤1 MB write),
  the source scan test (test time only).

### Section 8: Observability

- The reporter logs to `log.jsonl` only its own state changes:
  `failure-report-stopped` (status, version), `failure-report-waiting`
  (until when). Never per failure (that is what the ledger is for).
- Developers' view: the main repo's `auto-report` label is the dashboard;
  "Seen on" comments give counts per version and OS.
- **Release canary (closes the Section 2 gap):** the release workflow, after
  publishing, files one `canary` report with the release's key (a `none`
  class kind the Action never promotes). If the Action sees no canary for the
  newest release within 3 hours of its publishing, the run fails and GitHub
  emails the schedule owner. This catches a revoked, expired or secret
  scanned key and a broken Action at each release, without waiting on real
  failures, so "no failures" and "pipeline broken" are told apart.
- **Forged volume alert:** a run that hits the daily new issue or reopen cap
  fails after doing its work (GitHub emails the schedule owner), so a
  sustained forged flood is noticed the first day, not discovered later.
- The Action's run summary still shows "last report received <time>".
- Alert: GitHub's failed workflow email (Section 2).
- Runbook (add to RELEASE-CHECKLIST.md): create or rotate the bot token;
  verify a test send after release; revoke to stop all sending; read
  `rejected` and `queued` in the reports repo; promote by hand if the Action is
  down.
- Debuggable 3 weeks later: the issue carries version, OS, engine, frames and
  counts; the office's ledger keeps the same row.

### Section 9: Deployment and rollout

- **Flag (R9).** `AUTO_FAILURE_REPORTS` in `buildFeatures.ts`, on in releases;
  off skips detection, ledger and sending. Tests run with it on.
- **No migration.** A new file in userData; old installs simply start it.
- **Order.**
  ```
  1 owner setup: bot account -> private reports repo (label `auto`) -> bot's fine grained
    token -> FAILURE_REPORT_KEY secret in this repo; MAIN_ISSUES_TOKEN (agentvivekkumar)
    + workflow + state.json in the reports repo
  2 merge the app change (no key in dev builds: nothing sends)
  3 release build injects the key (Mac and Windows)
  4 verify: a test send from the release build creates a private issue; the next
    hourly run promotes it; the token is still active (secret scanning check)
  5 watch: "last report received" in the Action summary over 48 h
  ```
- **Mixed versions.** Old releases never report; new ones do; the schema is
  versioned by the release tag the Action validates against, so an old report
  format is checked against its own release's module.
- **Rollback.**
  ```
  bad behaviour seen ─┬─ sending only ──> revoke the bot token (minutes; every install stops)
                      └─ detection/ledger ─> release with AUTO_FAILURE_REPORTS = false
  Action misbehaving ──> disable the workflow in the reports repo (reports wait)
  ```
- **Windows leg.** `release.yml:22` keeps the Windows build `continue-on-error`
  (Windows is a beta): when it fails, that release is Mac only and has no
  Windows reports. The land checklist already verifies Windows assets (owner
  rule 2026-10-05); the canary is filed once per published release.
- **Environment parity.** No staging; the fake GitHub tests stand in, and step
  4 is the live check. Windows ships untested (owner rule 2026-10-05); the
  sender and scrubber have no platform code paths beyond the frame paths the
  tests cover.
- **Post release (first hour):** test send landed; Action run green; no
  `failure-report-stopped` in the dev machine's `log.jsonl`.

### Section 10: Long-term trajectory

- **Debt.** Two repos (the Action lives in the private one); the schema is
  fetched from the main repo by tag, so no copy drifts. Operational debt: the
  token's expiry (fine grained tokens expire, at most a year [unverified]) is
  a dated chore in RELEASE-CHECKLIST.md.
- **Reversibility: 4/5.** Revoke and flag make it stop at once; issues already
  filed stay (they are enum only).
- **Path dependency.** The kind table becomes the contract new failure points
  must join; the source scan test enforces it, which is the point.
- **Ecosystem fit.** Same shapes as `analytics.ts` (main side sender, build
  time key, DNT) and `reportProblem.ts` (injected deps, fakes).
- **The 1 year question.** A new engineer reads the kind table and the
  Design section and knows what is reported and why.
- **Phase 2 (not in scope).** The ledger and kind table could later feed owner
  notices (E1, declined) or developer side triage (E6, declined).
- **Retrospective on cherry-picks.** E3 turned out to be required (the queue);
  E7 is small and independent. None of the declined items is needed by the
  accepted ones.

### Section 11: Design and UX

SKIPPED (no UI scope): SR3 removed every switch, row and card; E7 changes
only the prefilled report text.


## Outside voice (codex exec -p deepseek-review, model deepseek-v4-pro, 2026-10-27)

Completed, read only; 9 findings (1 Critical, 5 High, 3 Medium). Each was
checked against the source before acting; all are routine fixes inside
approved scope and were applied under the owner's instruction to decide small
choices (2026-10-27).

| # | Finding | Check | Disposition |
|---|---|---|---|
| O1 | Critical: `detail` has no values per kind | true | applied: detail table per kind |
| O2 | High: classification test cannot see dynamic hidden call reasons; 4 kinds missing | true (`workStyleConvert.ts:242`, `runCompare.ts:164`, `fileFitCheck.ts:46`) | applied: `hiddenErrorClass`, all seven kinds listed, a second scan test |
| O3 | High: no per member StopFailure store; app kills never reach `recordAgentExit` | true (`officeBreak.ts:37`, `pty.ts:792`) | applied: office break gate, `killedByApp` dropped, test of app kills |
| O4 | High: zero reports looks like a broken pipeline | true | applied: release canary that fails the Action |
| O5 | High: Windows release leg is `continue-on-error` | true (`release.yml:22`) | applied: stated in Section 9; no change to the release gate (owner rule) |
| O6 | High: schema copied vs fetched | true (plan text) | applied: fetched by tag everywhere |
| O7 | Medium: searches uncapped | true | applied: 5 searches per hour per install |
| O8 | Medium: engine list missing `cursor`, `custom` | true (`agentProvider.ts:37-38`) | applied: read from `AgentProvider` |
| O9 | Medium: leaked key risk renews daily, no alert | true | applied: cap hit fails the run (email) |

Cross-model: both this review and the outside voice flagged the silent
pipeline failure (Section 2 gap, O4); the outside voice alone found O1, O2,
O3, O5, O7 and O8, which the three Claude spec reviews missed.

## Approval readiness

Approval readiness: PASS. Checked rows and their answers: PR1 (D1 B), AP1
(D2 A), E1 (D4 C), E2 (D5 A), E3 (D6 A), E4 (D7 C), E5 (D8 C), E6 (D9),
E7 (D10 A), E2b (D11), SR1 (D12 A), SR2 (D13), SR3 (D14 C), SR4 (D15 A),
documents (D16 A), R9 (decided as recommended under the owner's 2026-10-27
instruction "decide small choices like the build flag yourself"), outside
voice O1 to O9 (routine fixes, same instruction). No declined, deferred or
unanswered change sits in accepted work.

## Reality rows

- REALITY: premise-table pass 31 claims checked with receipts (index.ts:217-222, hive.ts:3644, hive.ts:6017-6029, hive.ts:5971-6014, hive.ts:1557-1559, hive.ts:3403, hooks.ts:136-137, hooks.ts:352, pty.ts:660, pty.ts:792, breaker.ts:1-31, shared/officeBreak.ts:29-36, buildFeatures.ts:50-53, analytics.ts:160, atomicFile.ts:97, agentProvider.ts:25-38, hiddenModel.ts:110-128, workStyleConvert.ts:94,242, runCompare.ts:164, fileFitCheck.ts:46, standingCheck.ts:34, hireCheck.ts:99, ErrorBoundary.tsx:17, release.yml:22,62, electron.vite.config.ts:17, TODOS.md:1132), unverified=5 (GitHub per user limits, fine grained token expiry, private to public transfer, free Actions minutes, secret scanning of release assets; each tagged [unverified])
- REALITY: already-done pass `git log origin/main --since=2026-10-20 --grep` found no failure reporting work; credit and sign in handling found already built (shared/officeBreak.ts:29-32), recorded on E2
- REALITY: surface-check finding GitHub REST routes (issue search `in:title`, create issue, create comment) and the Actions schedule are named but not live probed (docs/designs/auto-report-failures.md:335, :389); T9 verifies them on the first release
- REALITY: binding-decisions pass decision search read; the 2026-09-24 show the choice rule is superseded for failure reports only by D14 (decision log 9104d35b); the card ownership rule (2026-10-02) is kept by SR1 (docs/designs/auto-report-failures.md ledger)
- REALITY: numbers pass caps and intervals are plan choices; timings and Actions minutes tagged [estimated]; GitHub limits tagged [unverified] (docs/designs/auto-report-failures.md:335)
- REALITY: deferred-asks pass the ask's "PRs" is left out by D1 with the owner's reason (cost to owners); everything else in the ask is covered (docs/designs/auto-report-failures.md:7-13)
- REALITY: pr-count finding one PR in this repo (no .gstack/ship-policy.json), plus a second deliverable in the new private reports repo (workflow, script) and owner setup outside both (docs/designs/auto-report-failures.md:891; .github/workflows/release.yml:62)
- PLAN_REALITY: 7/7 rows present (5 pass, 2 finding), unverified=5

## What already exists (reused)

| Existing | Reused for |
|---|---|
| `hive.appendLog` + `logObserver` (hive.ts:6017-6029) | the event bus for most kinds |
| `recordAgentExit` (hive.ts:5971) | agent exits |
| breaker levels (breaker.ts) and `hop-cap` drops | agents in loops |
| `officeBreak` (credit, sign in, limit) | E2, already built; kept out of GitHub |
| `writeFileAtomic` (atomicFile.ts:97) | the ledger |
| `dntSet` (analytics.ts:160) | DO_NOT_TRACK |
| `__POSTHOG_KEY__` define and `POSTHOG_KEY` secret pattern | `__REPORT_KEY__` / `FAILURE_REPORT_KEY` |
| `reportProblemUrl`, `createReporter` | E7 |
| `buildFeatures.ts` | `AUTO_FAILURE_REPORTS` |
| raw.githubusercontent fetch pattern (hero.ts:16) | the Action fetches the schema by tag |

## Dream state delta

The plan reaches the developer half of the 12 month ideal: code fixable
failures arrive grouped in the main repo with counts. It leaves the owner
half where it is (E1 and E5 declined), except credit and sign in, which were
already built. No step makes the ideal harder later: the ledger and kind
table are the inputs owner notices would need.

## Error & Rescue Registry

Section 2's two tables are the registry (17 codepath rows, every class
rescued; the one CRITICAL gap, a silent sender stop, is closed by the release
canary and the `failure-report-stopped` log line).

## Failure Modes Registry

```
  CODEPATH            | FAILURE MODE                 | RESCUED? | TEST? | USER SEES?            | LOGGED?
  --------------------|------------------------------|----------|-------|-----------------------|--------
  reportFailure       | throws in uncaughtException  | Y        | Y     | nothing (by design)   | console
  ledger flush        | disk full                    | Y        | Y     | nothing               | console
  ledger read         | partial line                 | Y        | Y     | nothing               | no
  renderer IPC        | forged or oversize payload   | Y        | Y     | nothing               | console
  sender              | offline                      | Y        | Y     | nothing               | no
  sender              | 401/404/403 hard             | Y        | Y     | devs: canary fails     | log.jsonl
  sender              | 429/403 limit                | Y        | Y     | nothing               | log.jsonl
  sender              | 5xx                          | Y        | Y     | nothing               | no
  sender              | duplicate create (race)      | Y        | Y     | devs: dup label       | Action
  Action              | forged report                | Y        | Y     | devs: rejected label  | Action
  Action              | cap reached                  | Y        | Y     | devs: email           | Action
  Action              | main token revoked / timeout | Y        | N     | devs: email           | Action
  Action              | no canary after release      | Y        | Y     | devs: email           | Action
  classify            | new log kind without class   | Y        | Y     | build fails (test)    | n/a
```

Total 14; CRITICAL GAPS 0 (no row is unrescued, untested and silent; the
Action token row is untested by design: it is GitHub's own failure email).

## Scope Expansion Decisions

From the CEO plan (~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-27-auto-report-failures.md):
- Accepted: E2 (already built; never filed), E3 (local ledger and queue), E7 (fingerprints on the manual report)
- Deferred: none
- Skipped: E1 (owner line), E2b (file owner fixable stops), E4 (What was sent), E5 (Fixed for you), E6 (draft fixes)

## Diagrams

1. System architecture (Section 1)
2. Data flow with shadow paths (Section 4)
3. State machine, ledger row (Section 1)
4. Error flow (Section 2 tables)
5. Deployment sequence (Section 9)
6. Rollback flowchart (Section 9)

## Stale Diagram Audit

Files this plan touches with ASCII diagrams: `docs/designs/report-problem-top-bar.md`
("How it works": the click flow). E7 only adds text to the URL body, so the
diagram stays accurate. No other touched file has a diagram.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1 day / CC: ~40min)** — shared — schema module: kinds, classes, detail values, field patterns, render, `hiddenErrorClass`
  - Surfaced by: Design > Kinds; outside voice O1, O2, O8
  - Files: src/shared/failureReport.ts, test/failure-report-schema.test.cjs
  - Verify: `node --test test/failure-report-schema.test.cjs` (source scan for unclassed kinds, unmapped hidden errors)
- [ ] **T2 (P1, human: ~2 days / CC: ~1h)** — main — reporter: observe via composed `logObserver`, `reportFailure`, scrub, fingerprint, fold, ledger (E3), DNT, flag
  - Surfaced by: Section 1 architecture; Section 4 async ordering; E3; SR4; R9
  - Files: src/main/failureReport.ts, src/main/index.ts, src/shared/buildFeatures.ts, test/failure-report.test.cjs
  - Verify: unit tests incl. paused fake GitHub vs flush order, ENOSPC, rotation carry forward, stack memo; regressions E-R2 (Pulse still records) and E-R5 (crash handlers keep the app alive, router keeps ticking)
- [ ] **T3 (P1, human: ~1 day / CC: ~40min)** — main, renderer — direct points (hidden call failures are classified from the logged reason, E-R1: no caller edits)
  - Surfaced by: Base scope 1; outside voice O3; eng E-R1, E-R2
  - Files: src/main/index.ts, src/main/hive.ts, src/main/hooks.ts, src/main/pty.ts, src/renderer/src/components/ErrorBoundary.tsx, src/preload/index.ts
  - Verify: tests for app kills never reported, office break gate, renderer IPC validation
- [ ] **T4 (P1, human: ~1.5 days / CC: ~50min)** — main — sender: caps (writes and searches), status handling, `__REPORT_KEY__` define, release secret
  - Surfaced by: Design > Filing; Section 2; outside voice O7
  - Files: src/main/failureSender.ts, electron.vite.config.ts, .github/workflows/release.yml, test/failure-sender.test.cjs
  - Verify: fake GitHub and clock: create, search hit, 401 stop, 429/403 limit wait, 400/422 drop the row (E-R4), 404 on a known issue re-searches (OV10), offline, no key no call
- [ ] **T5 (P2, human: ~2h / CC: ~15min)** — shared — E7 fingerprints in the manual report; remove the TODOS.md "Copy diagnostics" entry
  - Surfaced by: E7 (D10 A)
  - Files: src/shared/reportProblem.ts, src/main/reportProblem.ts, TODOS.md, test/report-problem.test.cjs
  - Verify: URL holds only fingerprints; ledger unreadable omits the line
- [ ] **T6 (P1, human: ~3h / CC: ~15min)** — docs — disclosure and runbook
  - Surfaced by: SR3 (D14 C: disclosed in TELEMETRY.md and README); eng D1 B (TELEMETRY.md: failure reports are separate from the usage stats opt out); Section 8 runbook
  - Files: TELEMETRY.md, README.md, RELEASE-CHECKLIST.md, docs/FEATURES.md, CHANGELOG.md
  - Verify: docs name every field sent and the reports repo; checklist has rotate, revoke, canary check
- [ ] **T7 (P1, human: ~1.5 days / CC: ~1.5h)** — reports repo — promotion Action, `state.json`, caps, canary check; release canary step
  - Surfaced by: SR2 (D13); Design > Promotion Action; outside voice O4, O6, O9
  - Files: (reports repo) .github/workflows/promote.yml, promote.cjs and its tests; (this repo) .github/workflows/release.yml canary step
  - Verify: script tests (valid, forged, decoy, over cap, canary missing); a manual run on a test report
- [ ] **T8 (P1, owner, human: ~1h)** — setup — bot account, private reports repo with label `auto`, bot fine grained token, `FAILURE_REPORT_KEY` secret here, `MAIN_ISSUES_TOKEN` and workflow there
  - Surfaced by: Section 9 order
  - Files: none in this repo
  - Verify: the token reaches only the reports repo (a call to the main repo returns 404)
- [ ] **T9 (P2, human: ~1h / CC: ~10min)** — release — first live check
  - Surfaced by: Section 3 (secret scanning unknown); reality surface-check finding
  - Files: none
  - Verify: after the first release with a key, the canary lands, the hourly run promotes nothing for it and stays green, the token is still active

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | failures print to console only; nothing     |
  |                      | reads agent-exit; router swallows throws;   |
  |                      | credit/sign in already handled (officeBreak)|
  | Step 0               | issues only, key in app, private repo +     |
  |                      | promotion, always on, DNT honoured          |
  | Section 1  (Arch)    | 1 issue found (shared token limits)         |
  | Section 2  (Errors)  | 17 error paths mapped, 1 GAP (closed)       |
  | Section 3  (Security)| 9 threats, 3 High severity (1 accepted)     |
  | Section 4  (Data/UX) | 11 edge cases mapped, 0 unhandled           |
  | Section 5  (Quality) | 1 issue found (sender branching)            |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 1 issue found (hot path fold)               |
  | Section 8  (Observ)  | 1 gap found (closed by release canary)      |
  | Section 9  (Deploy)  | 3 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | SKIPPED (no UI scope)                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (7 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 17 rows, 0 CRITICAL GAPS                    |
  | Failure modes        | 14 total, 0 CRITICAL GAPS                   |
  | TODOS.md updates     | 0 items proposed (1 entry removed by T5)    |
  | Scope proposals      | 8 proposed, 3 accepted (SEL)                |
  | CEO plan             | written                                     |
  | Outside voice        | codex (deepseek-v4-pro): completed, 9 found |
  | Lake Score           | N/A (no coverage scored question)           |
  | Diagrams produced    | 6 (arch, data flow, state, error, deploy,   |
  |                      | rollback)                                   |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 5 unverified       |
  +====================================================================+
```

### Unresolved Decisions

None.

## Eng review (2026-10-27)

Target: `docs/designs/auto-report-failures.md` (named by the owner). Report file:
this plan. Small choices are decided under the owner's 2026-10-27 instruction
("decide small choices like the build flag yourself using your recommendation,
and only ask me about real behavior or scope changes") and the standing rule
that file and module layout is never asked (memory "No code arrangement
questions"). Nothing below changes what an owner, agent or office sees beyond
the CEO decisions.

### Scope Challenge

- **Already solves it.** `hive.logObserver` (hive.ts:6029, set once at
  index.ts:929 for Pulse) carries most kinds; `writeFileAtomic`
  (atomicFile.ts:97); `dntSet` (analytics.ts:160); `engineSetup.ts` already
  calls HTTPS with `fetch` and maps statuses (learning
  api-key-400-shown-as-network); `fetchText.ts` is GET only.
- **Complexity.** About 30 changed files [estimated] (T1 to T7 file lists,
  docs and tests) and 3 new modules: gate tripped.
- **Feature cuts.** None proposed: every item is CEO approved (PR1, AP1, E2,
  E2b, E3, E7, SR1 to SR4, R9).
- **Structure (question_id plan-eng-review-structure).** Original
  arrangement: 3 new modules plus `errorClass` added in 5 hidden call callers.
  Smaller arrangement: the same 3 modules, and the reporter classifies hidden
  call failures from the `reason` text the 5 callers already log (they log
  `result.error` verbatim, `hireCheck.ts:99`, `workStyleConvert.ts:94,242`,
  `standingCheck.ts:34`, `fileFitCheck.ts:46`, `runCompare.ts:164`), so those
  5 files do not change. Same behavior, contracts and tests. Decided: smaller
  arrangement (authorized: "No code arrangement questions" plus the owner's
  2026-10-27 instruction).
- Scope record: feature answers: none needed; structure: smaller arrangement
  (authorized auto decision above); accepted scope: CEO scope unchanged, 5
  caller edits removed; pending remedies: none.
- **Search check.** Reused the CEO landscape (2026-10-27): client to GitHub
  issue filing, bot token in binary, relay pattern, prompt injection via
  issues. No new pattern beyond it.
- **TODOS.** The "Copy diagnostics" entry (TODOS.md:1132) is replaced by E7
  (T5). Nothing else blocks or is blocked.
- **Distribution.** Key injected in `release.yml` for Mac and Windows; the
  Windows leg is `continue-on-error` (release.yml:22), stated in Section 9.

Findings:

`[INFORMATIONAL] (confidence: 9/10) src/main/hiddenClaude.ts:380 — "hidden session never took the prompt (signed out, or a screen is waiting)"` and the dynamic errors at hiddenClaude.ts:197, 239, 266 reach the same callers, but the plan maps only `hiddenModel.ts` strings. A signed out owner would be unclassified.
`[INFORMATIONAL] (confidence: 9/10) src/main/index.ts:929 — "hive.logObserver = (e) => {"` is a single slot: a second assignment for the reporter would silently stop Pulse telemetry.
`[INFORMATIONAL] (confidence: 8/10) src/main/fetchText.ts:1-11 — "One place that fetches text over https"` is GET only; the plan's "Electron net/fetch" would add a third HTTP style beside `fetchText` and `engineSetup.ts`'s `fetch`.

Dispositions: all three approved as routine (ledger E1 to E3 below).
Scope Challenge result: scope accepted as-is.

### Decision ledger (eng review)

### E-R1: hidden call failures classified from the logged reason
Finding: Scope Challenge 1 and structure, INFORMATIONAL, 9/10, hiddenClaude.ts:380, reviewer Claude
Plan baseline: CEO plan maps `hiddenModel.ts` strings through `hiddenErrorClass` logged by each caller
Runtime evidence: callers log `result.error` verbatim; `hiddenClaude.ts` adds 'empty prompt', 'picture path has control characters', 'hidden session never took the prompt (signed out, or a screen is waiting)', 'hidden session timed out', 'cancelled', 'no assistant response found in transcript' and three dynamic errors
Comparison grid: classify in each caller (5 edits) vs classify the logged `reason` in `src/shared/failureReport.ts` (0 caller edits); both use one map of every literal error in `hiddenModel.ts` and `hiddenClaude.ts`; dynamic and unknown reasons map to `none` (never reported), which applies D11 (owner fixable never to GitHub)
State: approved
Actual answer: smaller arrangement; authorized auto decision (owner instruction 2026-10-27; "No code arrangement questions")
Accepted scope: `hiddenErrorClass(reason)` in the shared module maps every literal error string of `hiddenModel.ts` and `hiddenClaude.ts`; code side: 'could not submit background check', 'background answer too large', answer unparseable; everything else, including 'never took the prompt' and any dynamic or unknown text, is `none`; the source scan test covers both files
History: none

### E-R2: one observer, two consumers
Finding: Scope Challenge 2, INFORMATIONAL, 9/10, index.ts:929, reviewer Claude
Plan baseline: "the reporter wraps `logObserver` (compose with the Pulse observer, never replace it)"
Runtime evidence: `hive.logObserver = (e) => {` assigned once at index.ts:929; hive calls it inside try/catch (hive.ts:6026)
Comparison grid: second assignment (breaks Pulse) vs one line at the top of the existing observer calling `failureReport.observe(e)`
State: approved
Actual answer: the one line call; authorized auto decision (code arrangement)
Accepted scope: the existing observer calls `failureReport.observe(e)` first, in its own try/catch; a regression test proves Pulse still records a `message` event
History: none

### E-R3: one HTTP style for the sender
Finding: Scope Challenge 3, INFORMATIONAL, 8/10, fetchText.ts:1-11, reviewer Claude
Plan baseline: "REST via Electron `net`/`fetch`; no Octokit"
Runtime evidence: `engineSetup.ts` uses global `fetch` with status mapping; `fetchText.ts` uses `node:https` GET only
Comparison grid: Electron `net` (new style) vs global `fetch` injected into the sender (the `engineSetup.ts` style, testable with a fake)
State: approved
Actual answer: injected global `fetch`; authorized auto decision (code arrangement)
Accepted scope: `createSender({ fetch, now, key, ... })`; production passes global `fetch`; tests pass a fake
History: none

### E-R4: 400 and 422 from GitHub
Finding: Section 2 Code quality, INFORMATIONAL, 8/10, plan Design > Filing, reviewer Claude (prior learning api-key-400-shown-as-network)
Plan baseline: statuses mapped: 2xx, 401/404/hard 403 stop, 429 and limit 403 wait, 5xx retry, offline keep
Runtime evidence: unmapped 400/422 (bad body, validation) would fall into no branch
Comparison grid: treat as stop (one bad row stops all sending) vs mark that row `dropped` with the status and continue
State: approved
Actual answer: row `dropped`, continue; authorized auto decision (owner instruction 2026-10-27)
Accepted scope: 400 and 422 mark the row `dropped` (status kept in the row), one `failure-report-dropped` line in `log.jsonl`, other rows continue; a test covers it
History: none

### E-R5: regression tests for behavior the plan touches
Finding: Section 3 Test review (IRON RULE), CRITICAL, 9/10, index.ts:217-222, index.ts:929, hive.ts:3644, src/shared/reportProblem.ts:10, reviewer Claude
Plan baseline: no regression tests named for unchanged behavior
Runtime evidence: no test covers the Pulse observer wiring or the crash handlers (grep of test/ for logObserver, uncaughtException: none)
Comparison grid: add regression tests for (1) Pulse still records after the reporter joins, (2) uncaught exception and rejection keep the app alive and still log, (3) the router keeps ticking after a throw, (4) the report URL still holds nothing private with fingerprints added; vs no tests
State: approved
Actual answer: add the four; authorized auto decision (test shape, owner instruction 2026-10-27)
Accepted scope: four regression tests, behavior unchanged, assertions as listed
History: none

### E-OV6: an owner who already turned usage stats off
Finding: Outside voice (eng), High, 9/10, TELEMETRY.md:99-105 ("Any one of these fully disables telemetry: Settings, General, Anonymous usage stats, off"), src/main/index.ts:8750 (`enabled: COLLECT_USAGE_STATS && readConfig().telemetryEnabled !== false`), src/main/config.ts:468, reviewer codex (deepseek-v4-pro)
Plan baseline: SR3 (D14 C): failure reports always on, not shown; SR4 (D15 A): DO_NOT_TRACK honoured
Runtime evidence: installs from before 2026-09-24 could set `telemetryEnabled: false` in Settings or setup; the switch is hidden now but the saved value stays
Comparison grid:
```text
Commitment                                  | Current (SR3)      | A (honour a saved no)              | B (ignore it)
New installs and owners who never said no   | send               | send                               | send
Owner whose config has telemetryEnabled=false| send               | nothing sent; ledger still records | send
DO_NOT_TRACK                                | honoured (SR4)     | honoured                           | honoured
TELEMETRY.md promise "fully disables"        | broken             | kept                               | rewritten: failure reports are separate
```
Question D1:
<gstack-qid:plan-eng-review-ov6-telemetry-optout> D1 — E-OV6: Should an owner who already turned usage stats off still send failure reports?
Header: Earlier opt out
Options:
A) Honour a saved no (recommended)
Owners whose saved settings say usage stats off send no failure reports; the ledger still records. Effort S (human: ~1h / CC: ~5 min), risk low.
B) Ignore it
Failure reports go out from every install; TELEMETRY.md is rewritten to say failure reports are separate from usage stats.

State: approved
Actual answer: B (Ignore it), owner D1 in the eng review, 2026-10-27, over recommendation A
Accepted scope: failure reports ignore `telemetryEnabled`; DO_NOT_TRACK stays the only off switch (SR4); TELEMETRY.md is rewritten so failure reports are a separate section, not covered by the usage stats opt out (T6)
History: none

Approval readiness: PASS. Checked: E-R1 to E-R5 (authorized auto decisions,
owner instruction 2026-10-27 and "No code arrangement questions"); CEO rows
carried unchanged (PR1, AP1, E2, E2b, E3, E7, SR1 to SR4, R9; answers in the
CEO ledger above).

### 1. Architecture

Two shapes (new modules):

```
  Shape A (chosen)                               Shape B (rejected)
  src/shared/failureReport.ts  pure schema       hive owns everything:
     classify(kind, reason) -> class/detail        hive.reportFailure() writes
     render(report) -> issue body                  failures into <hive>/failures.jsonl
     validate(report)                              and a hive timer sends them
  src/main/failureReport.ts    observe, report,
     fold, ledger (userData)                     - needs an office folder (none before
  src/main/failureSender.ts    GitHub I/O only     setup, none for main crashes at start)
                                                 - office switching splits the queue
                                                 - hive.ts is already ~7,000 lines
```

Depth: A hides kinds, scrubbing, folding and the ledger behind
`observe(event)` and `reportFailure(kind, facts)`; the sender hides GitHub
behind `tick()`. B is shallower (the hive grows another concern) and its store
depends on an office existing. The owner's "reuse the orchestrator" rule
allows a separate store with a serious downside; here the downside of B is
losing reports when no office is open, and E3 (D6) chose userData.

Red flags:
1. Hand synced list: the kind table vs logged kinds in source. Mitigated: the
   source scan test fails the build on a new unclassed kind.
2. Two ways to do one task: HTTP. Resolved by E-R3.
3. Split ownership: none; main owns the ledger, the renderer only sends IPC.
4. Information leakage: the schema lives once (shared module, fetched by the
   Action by tag).
5 to 8 (shallow module, temporal decomposition, pass through, importable
   internals): none found; `failureSender` is imported only by index.ts.

Production failure per new path: observer throws (guarded, E-R2); ledger
disk full (memory cap); sender offline (rows wait); Action down (reports wait,
email). All handled in the plan.

`[INFORMATIONAL] (confidence: 8/10) src/main/hive.ts:6018-6019 — "const root = this.root(); if (!root) return;"` drops events before the observer when no office is open; acceptable (no office means no hive events) but noted so nobody expects pre setup drops to report.

Dispositions: no new choice.

### 2. Code quality

- E-R4 (400/422) approved above.
- `[INFORMATIONAL] (confidence: 7/10)` plan Design > What a report holds — `errorName` comes from the constructor name, which minified renderer code can shorten to one letter; renderer kinds then group by chunk name and `errorName` `e`. Accepted coarse grouping (Design > Fingerprint already says so); no change.
- Sender branching: `classifyResponse(status, headers)` pure (plan, Section 5 of CEO review).

Dispositions: E-R4 approved; the rest no new choice.

### 3. Tests

Framework: `node:test` via `tools/run-tests.cjs`; TypeScript loaded with
`test/load-ts.cjs`.

```
CODE PATHS                                               USER FLOWS
[+] src/shared/failureReport.ts                          [+] Owner (none: SR3, no UI)
  ├── classify(kind, reason)                               └── Report a problem (E7)
  │   ├── [GAP→planned ★★★] every logged kind classed           ├── [GAP→planned ★★★] fingerprints added
  │   ├── [GAP→planned ★★★] hidden reasons both files            └── [GAP→planned ★★] ledger unreadable
  │   └── [GAP→planned ★★]  unknown reason -> none
  ├── validate(report)  [GAP→planned ★★★] each field off pattern
  └── render(report)    [GAP→planned ★★★] snapshot, no links, code block
[+] src/main/failureReport.ts
  ├── observe(e)        [GAP→planned ★★★] drop->repo, owner->local, Pulse intact (E-R2)
  ├── reportFailure     [GAP→planned ★★★] throw inside, reentry, DNT, flag off
  ├── scrub/fingerprint [GAP→planned ★★★] mac/win/linux, home path, 100 frames
  └── fold/ledger       [GAP→planned ★★★] ENOSPC, rotation carry, partial line
[+] src/main/failureSender.ts
  └── tick()            [GAP→planned ★★★] create, search hit, caps, 401, 403 limit,
                                         429, 5xx, 400/422 drop (E-R4), offline, no key
[+] direct points       [GAP→planned ★★]  uncaught, router throw, hook throw, cmd fallback,
                                         breaker level, app kill not reported
[+] regressions (E-R5)  [GAP→planned ★★★] Pulse observer, crash handlers keep alive,
                                         router keeps ticking, report URL private
[+] promotion script    [GAP→planned ★★★] valid, forged, decoy, cap, canary missing
COVERAGE today: 0/24 (all new); planned: 24/24  |  QUALITY planned: ★★★ 19, ★★ 5
```

Value cards (one per critical path; all `seam=none` unless named):
- Value: protects=no free text or home path reaches a report; fails_when=the frame prefix check or field patterns loosen; why_new=no scrubber exists; seam=none; no_claim=real crash stacks (fixtures stand in)
- Value: protects=owner fixable failures never filed (D11); fails_when=a hidden reason or new kind defaults to repo; why_new=no classifier exists; seam=none; no_claim=none beyond protects
- Value: protects=Pulse keeps recording after the reporter joins; fails_when=the observer is reassigned; why_new=index.ts:929 untested; seam=none; no_claim=Pulse's own counting (team-advice tests cover it)
- Value: protects=sender stops, waits or drops per status; fails_when=a status falls into the wrong branch; why_new=new code; seam=injected fetch; no_claim=GitHub's real responses (fake fetch; T9 is the live check)
- Value: protects=a valid report reaches the main repo once; fails_when=dedupe or state.json counting breaks; why_new=new script; seam=none; no_claim=GitHub Actions runtime (script run locally with fakes)

No LLM or prompt change (PR1), so no eval.
Tests to retire: none. Platform: all platform independent (owner rule
"platform scoped tests").

Dispositions: E-R5 approved; all planned tests carried from the CEO plan.

### 4. Performance

- Ledger flush: whole file `writeFileAtomic` of at most 1 MB, at most every
  30 s and only when dirty, sync on the main thread: a few ms [estimated]. OK.
- `router-throw` can fire every 1.5 s: `reportFailure` keys a small in memory
  map by the raw stack string first, so scrub and sha256 run once per distinct
  stack per run. Routine; added to T2.
- Sender: at most 5 writes and 5 searches an hour per install; one request at
  a time; 12 s timeout like `fetchText` [estimated].
- Source scan test reads `src/main/*.ts` once per run: test time only.

`[INFORMATIONAL] (confidence: 7/10)` plan Section 7 — repeated scrubbing on hot paths; fixed by the stack memo above.

Dispositions: no new choice.

### Outside voice (eng review; codex exec -p deepseek-review, model deepseek-v4-pro, 2026-10-27)

Completed on the second launch (the first never started: an empty prompt file
from a shell quoting slip, no model call). 10 findings: 1 Critical, 5 High,
4 Medium; all checked against the source.

| # | Finding | Check | Disposition |
|---|---|---|---|
| OV1 | Critical: Actions minutes (hourly x 10 min = 7,200/month) | true (arithmetic) | applied: 2 minute run cap, 50 reports a run (at most 1,440/month) |
| OV2 | High: T3 still lists the 5 caller files | true | applied: T3 corrected |
| OV3 | High: `trust-check-failed` logs `error`, not `reason` | true (index.ts:1138) | applied: classifier reads `reason ?? error` |
| OV4 | High: no `canary` kind | true | applied: `canary` kind, class none |
| OV5 | High: fetched schema cannot import `agentProvider.ts` | true (agentProvider.ts:15-19) | applied: engine list in the module plus a test against the union |
| OV6 | High: failure reports vs the usage stats opt out | true (TELEMETRY.md:99-105, index.ts:8750) | owner D1 B: ignore it; TELEMETRY.md rewritten (T6) |
| OV7 | Medium: callers' `unreadable` / `empty` / `no verdict` unmapped | true | applied: mapped to `answer-unparseable` |
| OV8 | Medium: renderer frames cannot match the frame pattern | true | applied: `-` for the function name |
| OV9 | Medium: rc versions rejected | true (release.yml:6-7) | applied: `-rc.N` allowed |
| OV10 | Medium: one deleted issue stops all sending | true | applied: 404 on a known issue re-searches |

Cross-model: Claude's sections caught the hidden call errors in
`hiddenClaude.ts`, the single slot observer and the 400/422 gap; the outside
voice alone caught OV1, OV3 to OV10, which were contradictions inside the
plan's own Design section.

### Eng outputs

**NOT in scope (eng).** Nothing new deferred; the CEO list stands. Not taken:
Electron `net` (E-R3), per caller `errorClass` (E-R1).

**What already exists (eng additions).** `engineSetup.ts` (`fetch` plus status
mapping) is the model for the sender; `test/load-ts.cjs` and
`tools/run-tests.cjs` run the new tests; `index.ts:929` hosts the observer
call.

**Failure modes added by the eng review.**

```
  CODEPATH        | FAILURE MODE                  | RESCUED? | TEST? | USER SEES?          | LOGGED?
  ----------------|-------------------------------|----------|-------|---------------------|--------
  sender          | 400/422 on one row            | Y        | Y     | nothing             | log.jsonl
  sender          | 404 on a deleted known issue  | Y        | Y     | nothing             | no
  observer        | reporter throws inside Pulse's| Y        | Y     | nothing; Pulse runs | console
                  | observer                      |          |       |                     |
  Action          | flood vs minutes budget       | Y        | Y     | devs: queued, email | Action
```

No critical gap (each row is rescued and tested).

**Worktree parallelization.**

| Step | Modules touched | Depends on |
|------|----------------|------------|
| T1 schema | src/shared | — |
| T2 reporter | src/main (failureReport), src/shared/buildFeatures | T1 |
| T3 direct points | src/main (index, hive, hooks, pty), renderer, preload | T2 |
| T4 sender | src/main (failureSender), build config, release.yml | T1 |
| T5 E7 | src/shared/reportProblem, src/main/reportProblem | T2 (reads the ledger) |
| T6 docs | docs, root markdown | — |
| T7 Action | reports repo; release.yml canary step | T1 |

Lane A: T1 → T2 → T3 → T5 (shared src/main). Lane B: T4 after T1 (own file;
coordinate the one release.yml edit with T7). Lane C: T6 (independent).
Lane D: T7 after T1 (another repo). Execution: T1 first; then B, C, D in
parallel with A. Conflict: release.yml (T4 key, T7 canary): one lane edits it.
The owner works on one running branch, so lanes are sequential commits there
unless a session is asked to run in parallel.

**Reality rows (eng).**

- REALITY: premise-table pass 18 eng claims with receipts (index.ts:929, index.ts:1138, index.ts:8750, hive.ts:6018-6030, hiddenClaude.ts:190-423, hiddenModel.ts:110-128, fetchText.ts:1-11, agentProvider.ts:15-38, release.yml:6-7,22, TELEMETRY.md:99-105, config.ts:468, pty.ts:792, hireCheck.ts:99, workStyleConvert.ts:94,242, standingCheck.ts:34), unverified=2 (free Actions minutes allowance, GitHub per user limits)
- REALITY: already-done pass nothing on origin/main since 2026-10-20 builds failure reporting (`git log origin/main --since=2026-10-20`, docs/designs/auto-report-failures.md CEO reality rows)
- REALITY: surface-check finding GitHub REST routes and the Actions schedule remain unprobed; T9 is the live check (docs/designs/auto-report-failures.md:335)
- REALITY: binding-decisions pass CEO decisions carried; eng D1 B recorded (decision log d76752c1); "No code arrangement questions" applied to E-R1 to E-R3 (docs/designs/auto-report-failures.md:1166)
- REALITY: numbers pass 1,440 minutes = 24 x 30 x 2 [measured: arithmetic, docs/designs/auto-report-failures.md:431]; ledger flush cost [estimated] (docs/designs/auto-report-failures.md:389)
- REALITY: deferred-asks pass PRs left out by CEO D1 with the owner's reason (docs/designs/auto-report-failures.md:7-13)
- REALITY: pr-count finding one PR here plus the reports repo deliverable (docs/designs/auto-report-failures.md:891; .github/workflows/release.yml:62)

### Eng Completion summary

- Step 0: Scope Challenge — scope accepted as-is (smaller arrangement: no caller edits)
- Reality rows: 7/7 applicable rows emitted (PLAN_REALITY), 2 unverified premises
- Architecture Review: 1 issue found (pre office events dropped before the observer, accepted)
- Code Quality Review: 2 issues found (400/422 handling, minified error names)
- Test Review: diagram produced, 24 gaps identified (all new paths; all planned), 4 regression tests added (E-R5)
- Performance Review: 1 issue found (repeated scrubbing; stack memo)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex (deepseek-v4-pro), completed, 10 findings (1 owner decision, 9 applied)
- Parallelization: 4 lanes, 3 parallel / 1 sequential
- Lake Score: N/A (no coverage scored answer)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 8 proposals, 3 accepted, 0 deferred |
| Outside Review | `codex exec -p deepseek-review` (deepseek-v4-pro) | Independent 2nd opinion | 2 | completed | CEO pass: 9 findings, 9 resolved; eng pass: 10 findings, 10 resolved; 0 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 28 issues, 0 critical gaps (all resolved as planned work) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex (deepseek-v4-pro), plan-review phase, completed twice (CEO: 9 findings; eng: 10 findings, after one launch that never started because of an empty prompt file). All 19 resolved.
- **CROSS-MODEL:** Claude found the hidden call errors in `hiddenClaude.ts`, the single slot observer and the 400/422 gap; DeepSeek found the Actions minutes budget, the `trust-check-failed` field, the missing canary kind, the cross repo import and the usage stats opt out. No disagreement left open.
- **VERDICT:** CEO CLEARED; eng review required (Eng Review is ISSUES OPEN because it counts mapped work: 28 findings, each resolved into tasks T1 to T9, 0 unresolved decisions, 0 critical gaps).

NO UNRESOLVED DECISIONS
