# Report a problem in the top bar, out of Settings

Status: CEO and eng reviews complete 2026-10-26; ready to build. Scope decided 2026-10-26 (SELECTIVE EXPANSION, D2 A): R1, R2,
R3, E1, E3, E5, P1 approved; E2 stays deferred. CEO review complete; ready for eng review.

## Ask (owner, 2026-10-26)

"Bring report a problem out of settings and to the main office."

## 0A. Premise

- **Real problem.** Report a problem is the last quiet link in the footer of
  Settings > General's About card (`SettingsHeroCard.tsx:114`). The top bar's
  Beta pill tip even says "use Report a problem in Settings" (`en.json:2180`):
  the app tells the owner where to go instead of letting them do it. An owner
  who hits a problem while working in the office has to know Settings has it,
  open Settings, and find a footer link.
- **Target outcome.** From any view of the office (Office, Tasks, Pulse, Who
  talks to whom, a file tab), one visible click opens the prefilled bug report.
- **Do nothing cost.** Problems go unreported or arrive late, especially from
  the business owners the beta is meant to learn from.
- **Proxy check.** Moving the link is the direct fix for "can't find it". A
  second friction stays: the link opens GitHub, which asks for a GitHub
  account. That is outside the ask; the hover text (E3) and the public
  warning (P1) say so before the click.

## 0B. Existing code to reuse

| Need | Existing code |
|---|---|
| The report URL | `reportProblemUrl` (`src/shared/reportProblem.ts:10`): app version, OS, OS version, nothing private; tested in `test/report-problem.test.cjs:12` |
| Opening it | `window.cth.openExternal(url)` (`SettingsHeroCard.tsx:54`) |
| Top bar slot | Beta pill beside the version, its own layer zIndex 240 (`TopBar.tsx:67-74`) |
| Beta tip words | `shell.betaInfo` (top bar), `settingsHero.betaInfo` (Settings), 3 locales |
| Guards | `test/report-problem.test.cjs:26-47`: pill placement, layer, one report link only |

Nothing is rebuilt: the link moves from the Settings footer to the top bar, and
the Beta pill and its tips are removed (R3).

## 0C. Dream state

```
  CURRENT STATE                   THIS PLAN                     12-MONTH IDEAL
  Footer link in Settings;  --->  A hard to miss Report a ---> One click from anywhere,
  the top bar's tip points        problem button in the top     the report already holds
  there                           bar, no Beta anywhere, a      what happened (diagnostics,
                                  window picture saved, a       a screenshot), no GitHub
                                  Help menu entry               hurdle for the owner
```

## Landscape (WebSearch, 2026-10-26; Aside not installed)

- Layer 1: help and feedback sit in secondary navigation; desktop apps can
  afford a visible Help or feedback control in the app bar.
- Layer 2: users often don't know where to report; a dedicated, plainly named
  "Report a problem" entry helps, and the label should say where it goes.
- Layer 3: for this app the report belongs in the bar itself, where the Beta
  pill sat, rather than only in a Help menu the owner would also have to
  discover (the owner then removed Beta altogether, R3, and kept a Help menu
  entry as a second door, E1).

## Binding instruction

- R2 (Settings link): the owner's words "out of settings" settle it: the link
  moves, it is not copied. Matches the guard "one report link, not a second"
  (`test/report-problem.test.cjs:41`). (Settings' Beta tip then had nothing to
  point to; R3 removed the pill altogether.)

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| R1 how Report a problem shows in the top bar (TopBar.tsx) | ask; `TopBar.tsx:67-74` | footer link in Settings only | the Beta pill is removed from the top bar; Report a problem takes its place as a clearly visible button, hard to miss (not a quiet link). Offered A, B, C were not taken as offered | approved | D1 answer, owner's own words (2026-10-26): "remove Beta and have it nicely visible hard to miss" |
| R3 Beta pill in Settings beside the version (SettingsHeroCard.tsx:71) | windows-11-installer.md E4 (D6, 2026-10-04) added it; R1 removes the top bar one | Beta pill in Settings, tip "use Report a problem below" | Beta removed everywhere: BetaPill.tsx, its use in TopBar and SettingsHeroCard, and the beta words in 3 locales go | (A keep in Settings: not taken) | approved | D3 answer B (owner, 2026-10-26) |
| E1 Report a problem in the app menu (main/index.ts menu) | no Help menu today (`main/index.ts:3779-3838`) | n/a | a Help menu with "Report a problem…" doing exactly what the top bar button does, Mac and Windows | approved | D4 answer A (owner, 2026-10-26) |
| E3 say where the report goes (tooltip) | landscape: label must say where it goes; link opens GitHub | n/a | hover text on the button saying it opens a bug report on GitHub (free account) and that a picture of the window is in Downloads to add | approved | D5 answer A (owner, 2026-10-26); words joined with E5 |
| E5 screenshot of the window on report | bug_report.yml asks for a screenshot first | n/a | the click also saves a picture of the window to Downloads and shows it in Finder, ready to drag into the form | approved | D6 answer A (owner, 2026-10-26; recommendation was B, defer) |
| P1 public report warning (hover text, E3 words) | spec review 2; repo agentvivekkumar/dontbemichael is PUBLIC (gh repo view) | the hover text ends with "Reports are public: check the picture first." | (B keep D5 words: not taken) | approved | D7 answer A (owner, 2026-10-26) |
| F1 report page fails to open (Section 2) | shell.openExternal can reject (no default browser, OS refusal); today's Settings link is silent then (main/index.ts:7196, no catch in the renderer) | the button reads "Couldn't open" for about two seconds (the Copy button's pattern); the reason is logged | (B stay silent: not taken) | approved | D9 answer A (owner, 2026-10-26) |
| E2 copy diagnostics | TODOS.md:1116, deferred 2026-10-04 (D21 B) | deferred | stays deferred; its "beside Settings' Report a problem" wording moves to the top bar button | deferred | prior answer D21 B (windows-11-installer.md S3); not re-asked |
| R2 Settings footer link (SettingsHeroCard.tsx:114) | ask "out of settings"; test :41 one link | in Settings footer | removed from Settings (its Beta tip goes with R3) | approved | owner instruction 2026-10-26 ("bring report a problem out of settings") |

## Answered: R1 (D1, owner's words)

## currentDecision (R1, answered)

Commitment comparison:

```text
Commitment                           | Source/approval | Current        | A                      | B                       | C
Report reachable from every view     | ask             | no (Settings)  | yes                    | yes                     | yes, one click deeper
Visible words, no hover needed       | 0A, landscape   | n/a            | yes                    | no (tooltip only)       | no (behind the pill)
Top bar width added                  | TopBar.tsx      | 0              | ~110 px (en)           | ~32 px                  | 0
Same prefilled URL (reportProblemUrl)| shared/reportProblem.ts | yes    | yes                    | yes                     | yes
Settings link removed (R2)           | owner           | n/a            | yes                    | yes                     | yes
Beta tips reworded (3 locales)       | R2              | n/a            | yes                    | yes                     | yes
```

Question: D1 — R1: How should Report a problem show in the top bar?
Header: Placement
A) Words beside Beta (recommended)
A quiet text button "Report a problem" right after the Beta pill, on every view; one click opens the same prefilled report. Effort S, risk low, reuses reportProblemUrl and openExternal; tested by the existing report-problem guard, moved to the top bar.
B) Icon by Settings
A small icon button beside the Settings gear, its name in a tooltip and for screen readers. Effort S, risk low, keeps the bar narrow; an owner has to hover to learn what the icon does.
C) Inside the Beta pill
Clicking the Beta pill opens a small card that says what Beta means, with a Report a problem button. Effort S, risk low, adds nothing to the bar; the report hides one click deeper behind a pill most owners never click.

## currentDecision (R3, E1, E3, E5, answered: D3 B, D4 A, D5 A, D6 A)

Commitment comparison (each row independent; other rows stay as approved):

```text
Row | Current                      | A (Add / Keep)                                 | B (Defer / Remove)                 | C (Skip)
R3  | Beta in Settings             | keep in Settings, tip points to top bar button | remove Beta everywhere             | n/a
E1  | no Help menu                 | Help menu "Report a problem…" (Mac, Windows)   | TODOS.md                           | nothing
E3  | no hover text                | tooltip says GitHub, free account, screenshot  | TODOS.md                           | nothing
E5  | no screenshot                | window picture saved to Downloads, shown       | TODOS.md                           | nothing
```

Questions D3 (R3), D4 (E1), D5 (E3), D6 (E5): asked in chat with the texts below.
R3 A) Keep it in Settings (recommended): Beta stays beside the version in Settings only; its tip says to use Report a problem in the top bar. Effort S. B) Remove Beta everywhere: BetaPill.tsx and its words go; nothing says the app is early. Effort S.
E1 A) Add (recommended): a Help menu with Report a problem… Effort S. B) Defer. C) Skip.
E3 A) Add (recommended): hover text on the button. Effort S. B) Defer. C) Skip.
E5 A) Add: picture of the window saved to Downloads and shown in Finder. Effort M. B) Defer (recommended). C) Skip.

## currentDecision (P1, answered: D7 A)

Question: D7 — P1: Should the hover text warn that reports are public?
Header: Public warning
A) Add the warning (recommended)
The hover text ends with "Reports are public: check the picture first." so an owner looks at the saved picture before dragging it into a public GitHub page. Effort S, risk low; three locales.
B) Keep D5's words
The hover text stays as approved: GitHub, a free account, a picture in Downloads to add. Effort S of zero extra work; the owner may attach a picture with client names to a public page without a hint.

## Accepted scope (R1, R2, R3, E1, E3, E5)

### What the owner sees

1. **Top bar.** The Beta pill is gone. In its place, inside the existing
   `cth-titlebar-nodrag` span (TopBar.tsx:65, or a click drags the window; eng
   2.1), after `<UpdateBadge />`
   (the version chip) and before `<CliUpdateBadge />`, a Report a problem button that is hard to miss: a filled pill in the
   solid amber fill `--cth-lemon` (#F2A93B light, #F2B45A dark; not the pale
   `--cth-lemon-light` the Beta pill used, which nearly matches the bar) with
   `--cth-on-accent` text (dark on amber in both themes), height 28, 12 px
   weight 600, pill radius, a 13 px flag icon and the words "Report a problem"
   (coral means "waiting on you" and stays Needs you's alone), on every
   view (Office, Tasks, Pulse, Who talks to whom, a file tab). It is a plain
   button with a native `title` hover text and the same words in
   `aria-description`, so keyboard and screen reader users get the public
   warning too (no InfoTip, so it needs no layer: the old zIndex 240 wrapper
   goes with the pill). Hover text: "Opens
   a bug report on GitHub (a free account). A picture of this window is saved in
   your Downloads to add to it. Reports are public: check the picture first."
   (E3 with E5, and the P1 warning, D7 A).
2. **One click** does three things: takes a picture of the app window, opens
   the report, then saves the picture to Downloads as `Don't Be Michael report 2026-10-26 20.15.png`
   (local time, no colons; " 2", " 3" and so on added if the name exists) and
   shows it in Finder ("Show in folder" on Windows) so it can be dragged into
   the form. The report is the prefilled bug report (same `reportProblemUrl`:
   app version, OS, OS version). Order, so the picture can never hold the report
   up: capture (in memory, at most 3 seconds, else skipped), open the report,
   then write and show the picture. The first write on a Mac may raise the
   Downloads permission prompt; the report is already open by then. If the picture can't be saved,
   the report still opens; nothing else is shown. An empty capture (the window
   minimized or hidden, possible from the Help menu) counts as a failed save:
   no empty file is written or shown. With no window (on a Mac the window can
   be closed while the app runs, main/index.ts:8722, and the Help menu still
   works) the capture returns null and only the report opens. A click while a
   report is still starting (from the click until the report has opened) is
   ignored and answers `{ ok: true, ignored: true }`; the picture write after
   that never blocks a new report.
3. **Help menu (E1).** A Help menu (`role: 'help'`, so macOS places it last
   and adds its search field; eng 1.2) at the end of the menu bar, on Mac and
   Windows, with "Report a problem…" doing exactly the same as the button. On
   Mac it shows in the menu bar. On Windows the window hides its title bar
   (`titleBarStyle: 'hiddenInset'`, main/index.ts:3603), so the menu bar may not
   show (unverified, no Windows machine here); there the top bar button is the
   way in, and the plan claims nothing more.
4. **Settings.** No Beta pill beside the version, and no Report a problem link
   in the About card's footer (What's new and Star on GitHub stay).
5. **No Beta anywhere (R3).** BetaPill.tsx is deleted; the keys
   `settingsHero.beta`, `settingsHero.betaInfo`, `shell.betaInfo` and
   `settingsHero.reportProblem` leave en, ar and zh-CN; new keys
   `shell.reportProblem` and `shell.reportProblemTip` arrive in all three.

### How it works

```
  TopBar [Report a problem] ──click──> window.cth.reportProblem()
                                          │ ipc app:reportProblem
  Help menu "Report a problem…" ──────────┤ (menu click, main side)
                                          v
                         main/reportProblem.ts  reportProblem(deps)
                           0. a report already starting? -> { ok: true, ignored: true }
                           1. capture() -> PNG bytes in memory, 3 s limit     (null / empty / late: no picture)
                           2. openExternal(reportProblemUrl({version, platform, arch, osVersion}))
                              (the in flight mark clears here)
                           3. writeFile(Downloads/<name>.png)                 (only with a picture)
                           4. showItemInFolder(<saved png>)                   (only when saved)
                         -> { ok: true, picture?: path }
```

- A `flag` icon is added to Icon.tsx (feather style paths, like its neighbours).
- `reportProblemUrl` (shared/reportProblem.ts) is unchanged; main fills it with
  `app.getVersion()`, `process.platform`, `process.arch` and
  `process.getSystemVersion()`.
- The report logic lives in `src/main/reportProblem.ts` as
  `createReporter(deps)`, which returns `report(window)`; main makes one at
  startup and both doors (IPC, Help menu) call it, so the in flight mark is
  shared (eng 1.1). Its parts are passed in, so tests drive it with fakes: `capture()` (PNG bytes, or null for an
  empty image or no window; the IPC call captures
  `BrowserWindow.fromWebContents(event.sender)`, the menu click
  `focusedWindow ?? mainWindow`), `wait(ms)` (the 3 s limit; a capture that
  resolves after it is discarded and nothing is written), `downloads`
  (app.getPath('downloads')), `exists(path)`, `writeFile(path, bytes)`,
  `openExternal(url)`, `showItemInFolder(path)`, `now()` and the URL inputs
  (version, platform, arch, osVersion).

### Files

- src/main/reportProblem.ts (new), src/main/index.ts (IPC `app:reportProblem`,
  Help menu), src/preload/index.ts (`reportProblem()`)
- src/renderer/src/shell/TopBar.tsx (button in, Beta pill and its layer out),
  src/renderer/src/components/Icon.tsx (`flag`),
  src/renderer/src/components/SettingsHeroCard.tsx (pill and footer link out),
  src/renderer/src/components/BetaPill.tsx (deleted)
- en.json, ar.json, zh-CN.json (keys out and in)
- test/report-problem.test.cjs: the URL test stays; the Beta test is replaced
  by guards that the button sits after `<UpdateBadge />` and before
  `<CliUpdateBadge />`, Settings has no report link and no Beta pill,
  BetaPill.tsx is gone, the button carries both `title` and
  `aria-description` with the tip words, `shell.reportProblem` and `shell.reportProblemTip`
  exist in all three locales and no beta keys remain, the Help menu calls the
  same function; and `reportProblem` with fakes: saved, empty capture, capture
  throws, capture never settles (3 s limit, fake timer), no window, name
  collision (" 2"), a second call while one runs is ignored, the report opens
  before the write, and the report opening in every case
- branding/DESIGN.md (7.1 top bar: Beta pill out, Report a problem in; log
  line), docs/FEATURES.md (Part 1 line), TODOS.md (Copy diagnostics: "beside
  the top bar's Report a problem")
- The URL holds nothing private (unchanged guard). The picture never leaves the
  computer unless the owner drags it into the form.

## NOT in scope

- Copy diagnostics (E2): stays deferred (TODOS.md "Copy diagnostics for problem
  reports", D21 B); its text is updated to say the top bar button.
- A way to report without GitHub (an email or in app form): not raised.

## currentDecision (F1, answered: D9 A)

Question: D9 — F1: What should the owner see if the report page can't open?
Header: Open failure
A) Say it briefly (recommended)
The button reads "Couldn't open" for about two seconds, the same pattern as the file tab's Copy; the reason is logged. Effort S, risk low; one fake test and three locale strings.
B) Stay silent
Keep today's behavior: nothing visible happens when the browser can't open. Effort S of zero extra work; an owner who clicks and sees nothing may think the app is broken.

## 0I. Temporal interrogation

```
  HOUR 1 (foundations):   main/reportProblem.ts with injected parts; IPC
                          app:reportProblem; preload reportProblem(); Help menu.
  HOUR 2 (core):          the order (capture 3 s, open, write, show), name
                          collisions, in flight mark, F1 result.
  HOUR 3 (renderer):      TopBar button (amber, flag, title + aria-description,
                          "Couldn't open" state); Beta pill and Settings link out;
                          BetaPill.tsx deleted; locale keys out and in.
  HOUR 4 (tests, docs):   report-problem.test.cjs rewritten; DESIGN.md 7.1, FEATURES,
                          TODOS wording; hand check on Mac: click, Finder, browser.
```

Effort: human about 1 day; CC + gstack about 45 minutes [estimated]. Blockers:
none. Unverified: the Windows menu bar (no Windows machine here).

## Review sections (CEO review, 2026-10-26)

**Current scope** (SELECTIVE EXPANSION, D2 A): accepted R1 (D1, owner's words),
R2 (instruction), R3 (D3 B), E1 (D4 A), E3 (D5 A), E5 (D6 A), P1 (D7 A),
F1 (D9 A); documents approved D8 A; E2 stays deferred (D21 B, earlier review).

### Section 1: Architecture

```
  renderer                         preload                main
  TopBar ─ ReportButton ──click──> reportProblem() ──ipc app:reportProblem──┐
     state: idle | busy | failed                                              v
                                   Help menu "Report a problem…" ──> runReport(win)
                                                                     │
                       NEW main/reportProblem.ts: reportProblem(deps) ◄┘
                         deps: capture, wait, openExternal, downloads, exists,
                               writeFile, showItemInFolder, now, url inputs
                         uses shared/reportProblem.ts reportProblemUrl (unchanged)
  removed: BetaPill.tsx; SettingsHeroCard Beta pill and footer link; TopBar layer 240
```

- One function serves both doors (button, menu), so they cannot drift.
- Data flow: happy (capture, open, write, show, `{ok:true, picture}`); nil
  (no window: report only); empty (empty image: report only); error (open
  rejects: `{ok:false}`, F1 shows "Couldn't open"; write rejects: report
  already open, no reveal, warn logged).
- State machine (button): idle -> busy (click) -> idle (opened) | failed
  (open rejected) -> idle after 2 s; busy ignores clicks; main's in flight mark
  also ignores a second call from the menu.
- Security: the IPC takes no input; the URL is built in main from fixed parts;
  the file name is built from the clock, never from renderer text.
- Rollback: revert; the only lasting effect is pictures already in Downloads.
Findings: 0 open.

### Section 2: Error & Rescue Map

```
  CODEPATH                    | WHAT CAN GO WRONG                 | RESCUE / USER SEES
  ----------------------------|-----------------------------------|----------------------------------------
  capture()                   | no window / empty / throws / >3 s | no picture; report still opens / nothing extra
  openExternal(url)           | rejects (no browser, OS refusal)  | {ok:false}; button "Couldn't open" 2 s (F1); warn logged
  writeFile(Downloads/...)    | permission denied, disk full      | warn logged; report already open; no Finder window
  showItemInFolder(path)      | (no error surface in Electron)    | nothing
  exists(path) collision      | name taken                        | " 2", " 3" suffix
  IPC from renderer           | rejects (main crashed)            | button "Couldn't open" (renderer catch)
  Help menu path              | open rejects                      | warn logged only (no button to show it on)
```

Gaps: the menu path's open failure is visible only in the log: accepted, the
button is the primary door and shows F1. No catch-all swallows silently.

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| Owner posts a picture with client data to the public repo | Med | High | Partly: P1 warning in title and aria-description; the picture stays local unless dragged in |
| Private data in the URL | Low | Med | Yes: unchanged reportProblemUrl, guarded by the existing URL test |
| Renderer steers the file path or URL | Low | Med | Yes: IPC takes no arguments |
| File overwrite in Downloads | Low | Low | Yes: exists check and numbered names |

### Section 4: Data flow and interaction edge cases

| INTERACTION | EDGE CASE | HANDLED? | HOW |
|---|---|---|---|
| Button | double click | Yes | busy state; main in flight mark |
| Button | click during the Mac Downloads prompt | Yes | in flight clears after open; a new report proceeds |
| Menu | window closed on Mac | Yes | report only |
| Menu | window minimized | Yes | empty capture -> report only |
| Both | browser missing | Yes | F1 on the button, log on the menu |
| Both | same minute twice | Yes | numbered names |
| Button | narrow window | Yes | the right group does not shrink (flexShrink 0); tabs shrink first (TopBar.tsx:63) |

Async: the only shared state is the in flight mark; it is set before the
first await and cleared after open in a finally, so a throw cannot leave it set
(fake test: open rejects, then a second call proceeds).

### Section 5: Code quality

- reportProblem.ts stays electron free so load-ts.cjs loads it (learning
  load-ts-no-renderer-alias); it imports `../shared/reportProblem`.
- The button is a small component in TopBar.tsx beside IconButton, using
  Icon `flag`; no new shared component.
- Removing BetaPill leaves no dead imports (TopBar, SettingsHeroCard).
Findings: 0 open.

### Section 6: Tests

```
  reportProblem (fakes)  saved | empty | throws | >3 s (late result discarded) | no window
                         collision " 2" | second call ignored | open before write
                         open rejects -> ok:false and in flight cleared | write rejects -> ok:true, no reveal
  TopBar source          button after UpdateBadge, before CliUpdateBadge; title and aria-description;
                         "Couldn't open" state; no BetaPill; no layer 240 wrapper
  Settings source        no BetaPill, no reportProblemUrl, What's new and Star stay
  Menu source            Help menu "Report a problem…" calls runReport
  Locales                shell.reportProblem, shell.reportProblemTip, shell.reportProblemFailed in en/ar/zh-CN;
                         settingsHero.beta, settingsHero.betaInfo, shell.betaInfo, settingsHero.reportProblem gone
  URL                    existing test kept unchanged
  Hand                   Mac: click, browser opens prefilled, Finder shows the picture; Help menu same
```

no_claim: the real capturePage, Finder and browser (fakes; hand check covers
Mac, Windows not covered). Hostile QA: click five times fast: one tab, one
picture. Flakiness: the 3 s limit uses an injected wait, no real timers.

### Section 7: Performance

A window capture is one bitmap of the window (a few MB at Retina size)
[estimated]; written once per click. No loops, no network from the app.
Findings: 0.

### Section 8: Observability

Every failure logs `[report]` with the step (capture, open, write) and the
error in main. The owner sees F1 on the button. Findings: 0.

### Section 9: Deployment

No migration or flag. Ships in the next release with the copy option. Windows
ships untested: the button works the same; the Help menu may be hidden by the
title bar style. Post ship check: click on the DMG build, see browser and
Finder. Findings: 1 risk (Windows menu bar, unverified).

### Section 10: Long-term trajectory

Reversibility 4/5 (pictures already saved stay in Downloads). reportProblem.ts
is the place Copy diagnostics (E2) plugs into later. Retrospective: E5 was
accepted against the defer recommendation; the public repo finding (P1) is the
price, and the warning covers it.

### Section 11: Design & UX

```
  any view ─> [⚑ Report a problem] (amber) ─click─> busy ─> browser + Finder ─> idle
                                                  └─> "Couldn't open" 2 s ─> idle
  menu bar ─> Help ─> Report a problem… ─> same flow (no button state)
```

- Information order in the bar: tabs, clock, version chip, Report a problem,
  CLI update, office break, theme, Settings, Needs you.
- Accessibility: a real button; title and aria-description carry the tip;
  the failure word announced through an aria-live span (Copy's pattern).
- DESIGN.md alignment: coral stays Needs you's; amber `--cth-lemon` is the
  highlight color already. Recommend /plan-design-review only for the exact
  pixel look.

## Outside voice

Skipped by owner rule (Codex only for the DeepSeek adversarial pass). No
outside coverage. Three in-host spec reviews ran.

## Approval readiness

Approval readiness: PASS. R1 (D1), R2 (instruction), R3 (D3 B), E1 (D4 A),
E3 (D5 A), E5 (D6 A), P1 (D7 A), F1 (D9 A), documents D8 A; E2 deferred (D21 B).

## What already exists

reportProblemUrl (kept), openExternal and showItemInFolder in main (reused),
the Copy button's failure pattern (reused for F1), Icon paths (extended).

## Dream state delta

After this: one hard to miss click from anywhere, with a picture ready. Still
ahead: diagnostics in the report (E2) and a path that needs no GitHub account.

## Failure Modes Registry

```
  CODEPATH         | FAILURE MODE          | RESCUED? | TEST? | USER SEES?            | LOGGED?
  -----------------|-----------------------|----------|-------|-----------------------|--------
  capture          | none/empty/late/throw | Y        | Y     | report only           | Y
  openExternal     | rejects (button)      | Y        | Y     | Couldn't open         | Y
  openExternal     | rejects (menu)        | Y        | Y     | nothing               | Y
  writeFile        | rejects               | Y        | Y     | report, no Finder     | Y
  in flight mark   | throw mid report      | Y        | Y     | next click works      | Y
```

CRITICAL GAPS: 0.

## Scope Expansion Decisions

Full record: ~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-26-report-problem-top-bar.md
- Accepted: E1 Help menu, E3 hover text, E5 window picture, P1 public warning, F1 open failure, R3 no Beta
- Deferred: E2 copy diagnostics (earlier, kept)
- Skipped: none

## Stale Diagram Audit

branding/DESIGN.md 7.1 describes the Beta pill in the bar: updated by T6.
TopBar.tsx's header comment lists "version" and controls: updated by T2.

## Reality rows

- REALITY: premise-table pass 11 claims checked (SettingsHeroCard.tsx:114, en.json:2180, TopBar.tsx:67-74, reportProblem.ts:10, main/index.ts:3603,7196,8722, tokens.css:78,205, report-problem.test.cjs:41, electron-builder.yml:112), unverified=0
- REALITY: already-done pass nothing on origin/main moves the report link; base commit 9104c25b, TopBar.tsx:73
- REALITY: surface-check pass Electron capturePage, openExternal, showItemInFolder, app.getPath('downloads') are documented API; existing uses at main/index.ts:5082
- REALITY: binding-decisions pass reverses windows-11-installer.md E4 Beta pill by owner answers D1 and D3 B (docs/designs/report-problem-top-bar.md:69)
- REALITY: numbers pass colors from tokens.css:78,205; sizes and timings tagged [estimated]
- REALITY: deferred-asks pass no linked issue; the ask (docs/designs/report-problem-top-bar.md:6) fully covered
- REALITY: pr-count pass no .gstack/ship-policy.json; same running branch, base 9104c25b

## Implementation Tasks

- [x] **T1 (P1, human: ~2h / CC: ~10min)** — main — reportProblem.ts with injected parts; app:reportProblem IPC; Help menu; preload reportProblem()
  - Files: src/main/reportProblem.ts, src/main/index.ts, src/preload/index.ts
  - Verify: node --test test/report-problem.test.cjs
- [x] **T2 (P1, human: ~2h / CC: ~10min)** — renderer — amber Report a problem button with flag, title, aria-description, busy and "Couldn't open"; Beta pill and layer out
  - Files: src/renderer/src/shell/TopBar.tsx, src/renderer/src/components/Icon.tsx
  - Verify: source guards; hand check
- [x] **T3 (P1, human: ~30min / CC: ~5min)** — renderer — Settings: Beta pill and footer link out; BetaPill.tsx deleted
  - Files: src/renderer/src/components/SettingsHeroCard.tsx, src/renderer/src/components/BetaPill.tsx
  - Verify: source guards
- [x] **T4 (P1, human: ~20min / CC: ~3min)** — i18n — keys out and in, en/ar/zh-CN, no dashes
  - Files: three locale files
  - Verify: npm test (arabic-ui parity, i18n-keys-exist, no-dashes)
- [x] **T5 (P1, human: ~3h / CC: ~15min)** — tests — report-problem.test.cjs per Section 6
  - Files: test/report-problem.test.cjs
  - Verify: npm test
- [x] **T6 (P2, human: ~30min / CC: ~5min)** — docs — DESIGN.md 7.1 and log line, FEATURES.md Part 1, TODOS.md Copy diagnostics wording
  - Files: branding/DESIGN.md, docs/FEATURES.md, TODOS.md
  - Verify: read through
- [ ] **T7 (P2, human: ~20min / CC: ~10min)** — QA — Mac: button and Help menu, browser, Finder, five fast clicks, window closed then Help menu
  - Files: none
  - Verify: results noted
  - Done so far (2026-10-26): the reporter ran in real Electron with a real capturePage of a hidden window (PNG 10 KB, about 73 ms, saved under the planned name, no window gave report only); the browser, Finder, the button's look, the Help menu and Windows are still to check by hand.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | report link buried in Settings footer; top  |
  |                      | bar tip points there; repo is public        |
  | Step 0               | R1 owner design, R2 move, R3 no Beta; E1,   |
  |                      | E3, E5, P1 added; docs approved             |
  | Section 1  (Arch)    | 0 open issues                               |
  | Section 2  (Errors)  | 7 paths mapped, 0 GAPS (F1 resolved)        |
  | Section 3  (Security)| 1 Med threat, mitigated by P1               |
  | Section 4  (Data/UX) | 7 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues                                    |
  | Section 8  (Observ)  | 0 gaps                                      |
  | Section 9  (Deploy)  | 1 risk (Windows menu bar unverified)        |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 0           |
  | Section 11 (Design)  | 0 open issues                               |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 7 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 new (E2 wording updated in T6)            |
  | Scope proposals      | 5 proposed, 4 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex skipped by owner rule (no coverage)   |
  | Lake Score           | N/A (no completeness-scored question)       |
  | Diagrams produced    | 5 (architecture, flow, error map, state,    |
  |                      |    UI flow)                                 |
  | Stale diagrams found | 2 (DESIGN.md 7.1, TopBar header comment)    |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 0 unverified                      |
  +====================================================================+
```

## Eng review (2026-10-26)

Target: docs/designs/report-problem-top-bar.md. Report file: this file.

### Scope Challenge

Existing: `reportProblemUrl` (shared/reportProblem.ts:10), `shell.openExternal`
and `showItemInFolder` in main (main/index.ts:5082, 7196), `capturePage` and
`toPNG` in this Electron (electron.d.ts:5049, 9087), `aria-description` typed
(@types/react index.d.ts:2671), the Copy button's state pattern. No new
pattern needs research beyond the CEO landscape. TODOS: Copy diagnostics wording
only. No new artifact to distribute.

Complexity: 14 files, 1 new module [counted from the CEO file list]. No feature
cut proposed: each piece carries an owner answer. No smaller arrangement keeps
the commitments: docs and locale files are required, and folding
reportProblem.ts into main/index.ts would load electron in tests (load-ts.cjs
does not stub it).

Scope record: feature answers: none asked; structure: original arrangement
confirmed, auto-decided under the owner's standing rule "never ask file or
module layout choices; pick the recommended one" (memory
no-code-arrangement-questions), not asked; accepted scope: CEO R1, R2, R3, E1,
E3, E5, P1, F1 unchanged; pending remedies: none.

Scope Challenge result: scope accepted as-is.

### 1. Architecture

```
  app start: reporter = createReporter({ capture, wait, openExternal, downloads,
                                          exists, writeFile, showItemInFolder, now, url })
  ipc app:reportProblem (event) ──> reporter.report(BrowserWindow.fromWebContents(event.sender))
  Help ▸ Report a problem… (_, focused) ──> reporter.report(focused ?? mainWindow)
  report(win): inFlight? -> {ok, ignored}
               png = race(capture(win), wait(3000) -> null)   inFlight = true
               try openExternal(url) catch -> {ok:false}       finally inFlight = false
               png? write(Downloads/name[ n].png) -> showItemInFolder
```

- [INFORMATIONAL] (confidence: 8/10) docs/designs/report-problem-top-bar.md, "How it works" — `reportProblem(deps)` as a plain function cannot hold the in flight mark both doors share; make it `createReporter(deps)` returning `report(win)`, one instance in main. (1.1)
- [INFORMATIONAL] (confidence: 7/10) src/main/index.ts:3836 — `{ role: 'windowMenu' }` is the last menu; add the Help menu after it with `role: 'help'` so macOS places it last and adds its search field. (1.2)

Failure per path: no window (menu, Mac) -> report only; capture never settles
-> 3 s then report only; open rejects -> F1; write rejects -> report open, no
Finder. All handled. Security unchanged from the CEO review.

Dispositions: 1.1 and 1.2 accepted as the implementation of approved R1, E1,
E5 (D1, D4, D6); no question needed.

### 2. Code quality

- [INFORMATIONAL] (confidence: 9/10) src/renderer/src/shell/TopBar.tsx:65 — `<span className="cth-titlebar-nodrag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>`: the bar is a drag region; the new button must sit inside this span (or carry the class) or a click drags the window instead of reporting. (2.1)
- TopBar's header comment (TopBar.tsx:19-22) lists the bar's parts; update it with the button (already in the Stale Diagram Audit).
- No shared code to extract: the Copy button's state lives in FileTabView; two small callers with different contracts.

Dispositions: 2.1 accepted (implementation detail of R1).

### 3. Test review

Framework: node:test via `npm test`; TS through test/load-ts.cjs; source checks
by reading files.

```
CODE PATHS                                           USER FLOWS
[+] main/reportProblem.ts createReporter             [+] Report from the top bar
  ├── saved: capture, open, write, reveal  [planned]   ├── [planned src] button inside nodrag span, after UpdateBadge
  ├── capture null / empty / throws        [planned]   ├── [planned src] title + aria-description
  ├── capture never settles (3 s, fake wait)[planned]  ├── [planned src] "Couldn't open" state + aria-live
  ├── late capture after limit discarded   [planned]   └── [hand]        browser + Finder on Mac
  ├── name collision " 2"                  [planned] [+] Report from the Help menu
  ├── second call while starting ignored   [planned]   ├── [planned src] role help, calls reporter.report
  ├── open before write (call order)       [planned]   └── [hand]        window closed on Mac
  ├── open rejects -> ok:false, mark cleared[planned][+] Removed
  └── write rejects -> ok:true, no reveal  [planned]   ├── [planned src] no BetaPill file, no Settings link or pill
[+] shared/reportProblem.ts URL            [★★★ TESTED] report-problem.test.cjs:12 (kept)
[+] locales                                [planned]   └── [planned] keys in/out, en/ar/zh-CN; no-dashes, parity

COVERAGE (after planned tests): 9/9 code paths, 7/7 user flows (2 by hand)
```

Value cards:
- Value: protects=one click opens the report even when the picture fails, hangs or the Downloads prompt waits; fails_when=the order or the 3 s limit regresses; why_new=new flow; seam=deps injected (production passes Electron's); no_claim=real capturePage and Finder (fakes)
- Value: protects=a second click or menu use during a report starts nothing; fails_when=the in flight mark is lost or never cleared after a throw; why_new=new state; seam=deps injected; no_claim=none beyond protects
- Value: protects=no file is overwritten in Downloads; fails_when=the exists check or numbering is dropped; why_new=new write; seam=deps injected; no_claim=real file system (fake exists/write)
- Value: protects=the button is clickable (not a drag handle), carries the public warning for keyboard and screen readers, and shows F1; fails_when=it leaves the nodrag span or loses aria-description; why_new=new control; seam=none (source check); no_claim=visual look (hand check)
- Value: protects=Beta is gone and Settings has no report link; fails_when=a leftover import or key returns; why_new=R2, R3; seam=none; no_claim=none beyond protects

Tests made obsolete: the Beta pill test in report-problem.test.cjs:26-47 is
replaced (its contract was reversed by owner answers D1 and D3 B); the URL test
at :12 stays. Test plan artifact:
~/.gstack/projects/agentvivekkumar-dontbemichael/moblizeit-mit-app-content-copy-option-d32902-eng-review-test-plan-*.md (report problem).

Dispositions: no gaps beyond planned tests.

### 4. Performance

- [INFORMATIONAL] (confidence: 6/10) `NativeImage.toPNG()` (electron.d.ts:9087) is synchronous on the main process; a Retina window encodes in tens to a few hundred ms [estimated, not measured], once per click. Acceptable; check by hand in T7. (4.1)

Dispositions: 4.1 accepted as a hand check.

### Outside voice

Skipped by owner rule (Codex only for the DeepSeek adversarial pass). No
native replacement. Outside coverage: none.

### TODOS.md

No new TODO.

### Approval readiness

Approval readiness: PASS. CEO answers D1, D3 B, D4 A, D5 A, D6 A, D7 A, D9 A,
D8 A and the R2 instruction; structure by the owner's layout rule; findings
1.1, 1.2, 2.1 implement approved contracts; 4.1 is a hand check.

### Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Reporter and menu (T1) | src/main, src/preload | — |
| Button, Settings, Beta out (T2, T3, T4) | src/renderer, i18n | T1 (preload API) |
| Tests and docs (T5, T6) | test, docs, branding | T1 to T4 |

Sequential implementation, no parallelization opportunity worth the merge
(about 45 minutes of CC time in one lane).

### Reality rows (eng)

- REALITY: premise-table pass 8 claims checked (TopBar.tsx:65, main/index.ts:3836,5082,7196, electron.d.ts:5049,9087, index.d.ts:2671, load-ts.cjs:57), unverified=0
- REALITY: already-done pass nothing on origin/main moves the report link; base commit 9104c25b, TopBar.tsx:73
- REALITY: surface-check pass capturePage, toPNG, role help, showItemInFolder are documented Electron API (electron.d.ts:5049)
- REALITY: binding-decisions pass CEO answers kept; owner layout rule applied (docs/designs/report-problem-top-bar.md:3)
- REALITY: numbers pass toPNG time tagged [estimated]; counts from the CEO file list (docs/designs/report-problem-top-bar.md:3)
- REALITY: deferred-asks pass no linked issue; ask at docs/designs/report-problem-top-bar.md:7 covered
- REALITY: pr-count pass no .gstack/ship-policy.json; same running branch on base 9104c25b

### Completion summary

- Step 0: Scope Challenge — scope accepted as-is (original arrangement)
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 2 issues found
- Code Quality Review: 1 issue found
- Test Review: diagram produced, 0 gaps beyond planned tests
- Performance Review: 1 issue found
- NOT in scope: written (CEO section)
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, skipped (owner rule)
- Parallelization: 1 lane, sequential
- Lake Score: N/A

### Suppressed findings

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 5 proposals, 4 accepted, 0 deferred |
| Outside Review | codex (skipped by owner rule) | Independent 2nd opinion | 0 | skipped | no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 4 issues, 0 critical gaps (all folded into the plan) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, skipped in both reviews (owner rule: Codex only for the DeepSeek adversarial pass); no completed external review.
- **VERDICT:** CEO CLEARED. Eng review complete: 4 issues found and folded into the plan, 0 critical gaps, 0 unresolved; logged as ISSUES OPEN because issues were found, not because any is open. Ready to implement.

NO UNRESOLVED DECISIONS
