# Telemetry

> **Usage stats are currently off.** This build sends no usage events. The code described below is
> switched off by `COLLECT_USAGE_STATS` in `src/shared/buildFeatures.ts`, and the app does not show
> the choice in onboarding or Settings. This file describes what would be sent if it were switched
> back on.
>
> **Automatic failure reports are on**, and are a separate thing: see
> [Automatic failure reports](#automatic-failure-reports) below.

Don't Be Michael collects a small set of **anonymous** usage events so we can
understand adoption (how many people launch the app, whether they get a first
agent running, which features get used) and make the product better. This
document is the complete, authoritative
contract: **if an event or property is not listed here, the app does not send
it.** The implementation lives in [`src/main/analytics.ts`](src/main/analytics.ts)
and enforces this list as a hard allowlist — the code and this file are kept in
lockstep, and because the repo is open source you can verify that yourself.

## What is sent

Every event carries only these common properties:

| Property | Example | Notes |
| --- | --- | --- |
| `app_version` | `0.0.3` | The app's own version |
| `os` | `darwin` / `win32` / `linux` | Platform, nothing more |
| `arch` | `arm64` / `x64` | CPU architecture |

The events:

| Event | Extra properties | When |
| --- | --- | --- |
| `first_run` | — | Once, the first time the app ever starts |
| `app_launched` | — | Each app start |
| `update_applied` | `from_version`, `to_version` — version strings, or `unknown` for an install older than this event; `via` — one of `auto` (the app's own updater installed it), `manual`, `unknown` | Once, on the first start after the app's version changes |
| `agent_spawned` | `provider` (CLI engine name, e.g. `claude`, `codex`) | An agent terminal is spawned |
| `onboarding_completed` | `provider` (the CLI engine chosen in the setup wizard) | Once, when onboarding finishes |
| `agent_spawn_attempted` | `provider` | Every time an agent spawn is requested, so it can be compared against `agent_spawned` |
| `agent_spawn_failed` | `provider`; `reason` is one of `cli_missing`, `cwd_missing`, `already_running`, `spawn_error` | A requested spawn did not start an agent |
| `agent_install_started` | `provider`; `rung` is one of `npm`, `node-then-npm`, `native` | The engine CLI was missing, so the bundled auto-installer began |
| `agent_install_finished` | `provider`; `rung` as above; `outcome` is one of `agent_launched`, `install_failed` | The auto-installer exited |
| `message_sent` | `surface` — one of `terminal`, `composer`, `steer`, `hive` | Each time **you** send a message to an agent. A count of messages and nothing else: the message itself is never read, measured, or hashed |
| `feature_used` | `feature` — one of `slack_trigger`, `webhook_trigger`, `hire_install`, `voice_dictation` | At most once per feature per app session |
| `session_ended` | `duration_bucket` — one of `<5m`, `5-30m`, `30m-2h`, `2-8h`, `8h+` | On quit (coarse bucket, never raw duration) |

### About `message_sent`

This is the one event that fires while you work, so it is worth being precise
about what it does and does not do.

- It counts **one event per message you send**, at the moment you send it. It is
  counted at the *submit* — the Enter or the Send button — never per keystroke.
  The app does not report what you type as you type it.
- `surface` says only *where* you sent it from: `terminal` (typed into an
  agent's terminal), `composer` (the agent's message queue box), `steer` (the
  steer field on the agent control strip), or `hive` (a dispatch, thread reply,
  or ASK ME answer).
- Messages **agents send each other** are not counted. Only messages that came
  from a person are.
- No property carries the message. There is no text, no length, no character
  count, no first-N-characters, and no hash of the body — the event has exactly
  one property and it is the surface name above. The channel the app uses to
  report it does not accept a message argument at all, so there is no shape in
  which the content could be sent by mistake.

It exists to answer one question: after someone gets an agent running, do they
ever actually talk to it? Without it, an agent that was started and then ignored
is indistinguishable from one being used every day.

## What is never sent

No prompts. No agent transcripts or output. No file paths, repo names, branch
names, or hostnames. No email addresses, account identifiers, machine
identifiers, or API keys. Nothing free-form — the property allowlist in
`analytics.ts` drops anything not in the tables above.

## How it stays anonymous

- Events are sent to [PostHog](https://posthog.com) (itself open source) with
  `$process_person_profile: false`, which makes them **anonymous events**: no
  person profile is created and no identity is stored.
- The only identifier is a **random UUID** minted on first run and stored in
  the app's user-data directory (`telemetry-install-id`). It is not derived
  from your machine, and deleting the app's data deletes it.
- The only other thing stored for telemetry is the app version this install
  last ran (`telemetry-last-version`, beside the install id) — it exists so
  `update_applied` can name the version you came from, and it is deleted with
  the app's data in the same way.
- To set `via`, the app reads its own update log (`updater.log`, kept in the
  same user-data directory) to see whether the version it is now running is the
  one its updater downloaded and you asked it to restart into, and whether that
  restart is what actually installed it: the log names each version as it
  starts, so a build other than this one starting afterwards means something
  else did the installing. Only that one-word result leaves the machine — no
  line, path or message from that log is ever sent.
- No geolocation of any kind is derived. The app sends `$ip: null` on every
  event and disables the GeoIP lookup, so no IP address, country, city, postal
  code or coordinate is derived from your connection or stored on the event.

## Opting out

Any one of these fully disables usage stats (not failure reports, which have
their own section below):

1. **Settings → General → Anonymous usage stats → off** (or uncheck "Share
   anonymous usage stats" during onboarding). Takes effect immediately.
2. Set the standard [`DO_NOT_TRACK`](https://consoledonottrack.com)
   environment variable (any value other than `0`). Respected unconditionally.
3. **Build from source.** The PostHog key is injected only in official release
   CI; a local or forked build compiles without one and the analytics module
   is a no-op — forks never send events anywhere.

## Automatic failure reports

Separate from usage stats, official builds report failures that the developers
can fix in code, so they get fixed even when nobody writes in
(docs/designs/auto-report-failures.md). They are always on; there is no switch
in Settings, and the usage stats switch above does not cover them.

**What counts.** A crash of the app or of a screen, a team member's terminal
ending abnormally, a message the router could not deliver because of a bug, a
team member stuck in a loop, and failures in the app's own plumbing (its hook
channel, a provider bridge, a background check whose answer could not be read).
Anything you or your team can fix (a sign in, credit, your own spending caps,
a wrong recipient, Research being off) is never reported.

**What a report holds.** Closed fields only:

| Field | Example | Notes |
| --- | --- | --- |
| `kind` | `agent-exit` | One of a fixed list |
| `detail` | `SIGSEGV` | One of a fixed list per kind |
| `errorName` | `TypeError` | Letters only |
| `frames` | `out/main/index.js:Hive.routeOnce:3644` | At most 8, only the app's own files; anything else is dropped |
| `fingerprint` | `0123456789ab` | A hash that groups the same failure |
| `appVersion`, `os`, `osVersion`, `arch` | `0.2.9`, `darwin`, `15.1.0`, `arm64` | |
| `engine`, `engineVersion` | `claude`, `2.1.309` | The engine the failure ran on; the version only when the app has read it (Claude Code), else `unknown` |
| `count` | `3` | How often it happened in this version |
| `context.role`, `context.uptime` | `member`, `1-4h` | Which kind of team member it was (`michael`, `research` or `member`, never a name) and how long the app had been running, in rough bands |
| `context.*` for a stuck team member | `limit` `5`, `limitSet` `invalid`, `codes` `529-529`, `sinceSuccess` `never` | The breaker's limit and whether it is the default or yours, how many times it was reached, Hard stop on or off, how long since the last new step, the tool name if it is one of Claude Code's own (any other tool is only `mcp` or `other`), and for errors the HTTP status numbers and rough times |

Context values are a word from a fixed list, a whole number or a time band
(`under-1m` to `over-4h`), checked again before anything is sent.

**Never sent:** error messages, log lines, terminal output, your office, team
member or customer names, file paths outside the app, mail, or anything you
typed.

**Where it goes.** The app files each report as an issue in the private
repository `dontbemichael-reports/failures`; an hourly job re-renders the valid ones, field by field, into
public issues labelled `auto-report` on the main repository. Each computer
keeps its own copy in `failures.jsonl` in the app's data folder, which is also
where reports wait while you are offline.

**To stop it:** set `DO_NOT_TRACK` (any value other than `0`), in the
environment or exported in your login shell profile (`~/.zshrc`, fish
config), which the app reads shortly after it starts and before it sends
anything; the app still keeps the local file but sends nothing. Builds from source never send: the key
is injected only in official release CI.

## Self-hosting note

PostHog is open source and self-hostable. Official builds point at PostHog
Cloud (US); the endpoint is a build-time setting (`POSTHOG_HOST`), so the
project can move to a self-hosted instance without any code change.
