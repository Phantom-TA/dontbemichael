# Automatic failure reports: the reports repo

The app files failure reports into a private repo; this folder holds what
runs there. Design: `docs/designs/auto-report-failures.md`.

## One time setup (owner)

1. Create a GitHub account for the bot and, under it, the private repo
   `dontbemichael-reports/failures` (the name is `REPORTS_REPO` in
   `src/shared/failureReport.ts`; change both together). Add the labels
   `auto`, `rejected` and `duplicate`.
2. As the bot, create a fine grained token: repository access only
   `dontbemichael-reports/failures`, permission Issues read and write. Save
   it in this repo (agentvivekkumar/dontbemichael) as the Actions secret
   `FAILURE_REPORT_KEY`. Release builds ship it; nothing else gets it.
   Set the longest expiry GitHub offers (the form defaults to 30 days) and
   put the date in your calendar: every installed version ships this key,
   so when it expires they all stop sending, and a new key reaches people
   only in a new release. Rotate it well before the date.
3. As agentvivekkumar, create a fine grained token: repository access only
   `agentvivekkumar/dontbemichael`, permission Issues read and write. Save
   it in the reports repo as the Actions secret `MAIN_ISSUES_TOKEN`. Create
   the label `auto-report` in the main repo.
   Give it the longest expiry too: when it expires the hourly run fails.
4. Copy `promote.cjs` to the reports repo's root and `promote.yml` to its
   `.github/workflows/`. Run it once by hand (Actions, Promote reports, Run).

## After each release

The release workflow files a canary report. Within 3 hours the hourly run
must see it; if not, the run fails and GitHub emails you. The run summary
shows the last check and how many reports wait.

## Stop everything

Revoke the bot's token: every install stops sending at once. A release with
`AUTO_FAILURE_REPORTS = false` (`src/shared/buildFeatures.ts`) also stops
detection and the local file.
