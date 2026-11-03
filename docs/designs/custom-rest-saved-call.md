# A saved call on a custom REST connection

Eng review target: the owner's request of 2026-11-02, quoted below. Status: built.

## The request

> adding a custom rest connection need to support GET and POST to the end point. if it is post then it should be able to take a json body which could have parameters. For example, business owner has a end point of type post that needs to pass below body:
>
> { "serverUrl": "https://myserver.com", "message": <some message> }
>
> So, <some message> would be a message passed by agent to call this end point. for example dwight may pass "Check my deals" or oscar may pass "This month pending invoices"

## What happens today

- An agent can already POST any JSON: `call_integration` takes `method`, `path` and `body` (`resources/md-integrations-mcp.cjs:40`), and the broker forwards it (`src/main/integrationBroker.ts:385`).
- What's missing is a saved shape. A connection stores no method, path or body (`src/shared/integrations.ts:39`), and `list_integrations` gives only id, label, base_url, access and ready (`src/shared/integrations.ts:478`). So every agent would have to guess the body, including the fixed `serverUrl`.

## Proposed change

A custom REST connection may hold one saved call, set on its configure screen.

```
Owner, Settings            Agent                         Broker (main process)
method, path, body  ---->  list_integrations: what the
what it is for             call is for, its parameters
                           call_integration:             reads the saved call
                           integration + params  ------> checks access
                                                         fills the body
                                                         forwards with the key
                           answer, screened    <-------- journal or read path
```

```ts
interface SavedCall {
  method: 'GET' | 'POST';
  path?: string;     // under baseUrl; {{name}} is URL encoded when filled
  body?: string;     // JSON text, POST only; {{name}} inside string values
  purpose: string;   // owner's words: what it is for and what to send
}
```

- **The agent sends only its message** (owner, R1). The one placeholder is `{{message}}`, and the connection supplies everything else. An unquoted `"message": {{message}}` is accepted on save, because that is how the owner wrote it: a small scan outside JSON strings adds the quotes, then the text must parse, and the quoted form is what's stored.
- **Filling happens on parsed JSON, in main.** Each string value is filled with `split` and `join` after parsing, then the tree is written back with `JSON.stringify`. Keys are never filled, so an agent's quotes or line breaks can't add or replace a field such as `serverUrl`. In `path` the message is URL encoded, which is how a GET takes it.
- **Refused on save:** an empty `purpose`, a saved call with no `{{message}}` in its path or body, a body that isn't a JSON object or list, a body on a GET, a path that leaves the base URL, or a saved call on a connection that isn't custom REST.
- **Refused before anything is sent:** a message that is missing, not text, or only spaces.
- **Route:** `POST /call/<id>` with `{ message }`, sharing the broker's existing token, access, enabled and slow-down steps. The `{ message }` body is read after the slow-down step, because a held call runs `handle` again on the same request. `forward` gets `readOnly` false for a saved call (R4). The answer goes through the same screening. Headers from the agent aren't forwarded.
- **Sent every time** (owner, R1). A saved call skips the send once journal, so the same message goes out again and an interrupted call isn't refused for 24 hours.
- **The exact address:** an empty path calls the base URL as saved. Today it gains a trailing slash (`resolveUpstreamUrl('https://x.example/api/run', '')` gives `.../api/run/`, measured), which many servers answer with a redirect or a 404, and the broker doesn't follow redirects.
- **Test button:** today it sends GET to the base URL (`src/main/index.ts:5163`), so a POST only endpoint reads as failed. With a saved call, main sends the real call with the fixed text "Test message", from both Test buttons, so `test(id)` keeps its signature and the screen gains no field.
- **What agents are told:** `list_integrations` adds `saved_call: { purpose }` and nothing else from the call, so the path and body never reach the agent.
- **Where it shows:** the fields appear on every custom REST connection, catalog presets included, and stay off until filled in. The lock applies only once a saved call exists.
- **Agent text:** the tool descriptions and `resources/skills/capabilities/SKILL.md` say to send `message` when a connection has a saved call, and show the owner's `purpose` line.
- **Existing connections** have no saved call and work exactly as before, so there is no migration.

## Traps the request hits today

1. **A POST is always a change on a custom connection** (`postReadsFor` finds no rule, measured). A Read only member is refused, so Dwight would need Can change.
2. **Send once replays answers.** The same agent sending the same body within 10 minutes gets the first answer back and nothing is sent (`src/main/brokerWriteOnce.ts:25`). "Check my deals" asked twice in 10 minutes returns stale deals. If the app stops mid call, that message is refused for 24 hours (`src/main/brokerWriteOnce.ts:27`).
3. **`validateIntegrationRecord` keeps only known fields** (`src/shared/integrations.ts:164`, measured), so a saved call would vanish on save unless added there.

## Decision ledger

### R1: Is a saved POST sent every time?
Finding: 1, CRITICAL, confidence 9, `src/main/integrationBroker.ts:422`, native review.
Plan baseline: not in the request.
Runtime evidence: custom POSTs are writes and replay for 10 minutes (measured above).
State: approved
Actual answer: owner, D1, chose neither listed option: "treat every agent call post as a request irrespective of time interval. agent should only send message like my pipline data. connnector alredy knows the shape it needs the post body. so app can make the needed transformation."
Accepted scope: a saved call skips the send once journal and goes out every time. The agent sends only `message`, and the app builds the request.
History: D1 offered an owner mark per POST, or every POST staying a change. Neither was taken, so the mark is dropped.

### R2: Does a saved call lock the connection to that one call?
Finding: 2, INFORMATIONAL, confidence 8, `resources/md-integrations-mcp.cjs:40`, native review.
Plan baseline: not in the request.
Runtime evidence: `call_integration` reaches any path under the base URL.
State: approved
Actual answer: settled by the D1 answer, "agent should only send message".
Accepted scope: on a connection with a saved call, every `/i/<id>` form (with a path, without one, or with only a query) is refused with words telling the agent to send `message`. A connection without one is unchanged.
History: none

### R4: May a Read only member use a saved call?
Finding: 4, CRITICAL, confidence 9, `src/main/integrationBroker.ts:400`, native review.
Plan baseline: R1 makes a saved POST a request, and R2 allows nothing else on the connection.
Runtime evidence: Read only refuses a custom POST today.
Comparison grid:

| Choice | Today | A | B |
|---|---|---|---|
| Read only member, saved POST | refused | sent | refused |
| Can change member, saved POST | sent, once | sent every time (R1) | sent every time (R1) |
| R3 count | pending | pending | pending |

Question D2: see the review transcript.
State: approved
Actual answer: owner, D2: "lets not worry about agent level read or write at this point. a lot of 3rd party systems requires POST calls even for read only access."
Accepted scope: option A in effect. A saved GET or POST ignores Read only and Can change; holding either level is enough. A member with no level has no access, and connections without a saved call keep today's rules.
History: none

### R3: One saved call per connection, or several?
Finding: 3, INFORMATIONAL, confidence 8, `src/shared/integrations.ts:39`, native review.
Plan baseline: the request names one end point.
Runtime evidence: a connection holds one base URL and one key.
Comparison grid:

| Choice | Today | A | B |
|---|---|---|---|
| Saved calls per connection | none | one | a named list |
| Second endpoint on one server | n/a | a second connection, key entered again | a second row on the same connection |
| What the agent sends | method, path, body | integration and message | integration, call name and message |

Question D3: see the review transcript.
State: approved
Actual answer: owner, D3: "One call (recommended)".
Accepted scope: a connection holds at most one saved call. Ceiling: a second endpoint needs a second connection and the key typed again. Upgrade when one server needs two or more saved calls (decision 754058e5).
History: none

Structure question: not asked, by the owner's standing rule against code arrangement questions. The change stays in existing files, with no new class or module.

Approval readiness: PASS. R1, R2 and R4 cite D1 and D2. R3 cites D3.

## Eng review

### Scope challenge

Scope accepted as-is, with the owner's answers making it smaller: one `message`, no parameter list and no read or change mark. About 12 existing files change and no new class is added. No new infrastructure, so no outside search was needed.

### Architecture

Two shapes compared:

1. **The broker fills the call (chosen).** The MCP server sends `{ message }`, and main holds the template, the fill and the access check. The agent never sees the body, which matches the MCP file's header, "this file holds no keys and no rules".
2. **The MCP server fills it.** `list_integrations` would hand the template to the agent's process, and the fixed `serverUrl` would be enforced nowhere. Rejected: more leaks through a bigger surface.

Findings:

- [CRITICAL] (confidence: 9/10) `src/shared/integrations.ts:164` — `validateIntegrationRecord` returns a fixed set of fields, so `call` is dropped on save (measured). Add it there, and carry it through `draftFromRecord` and the save at `IntegrationsRegistry.tsx:153`, or a rename silently loses the call.
- [CRITICAL] (confidence: 9/10) `src/shared/integrations.ts:240` — an empty path gains a trailing slash (measured). Fix it in `resolveUpstreamUrl`, so every connection reaches the base URL as saved. This also changes a connection with no saved call, such as Linear's `/graphql`. One test pinned the old result (`test/broker-write-once.test.cjs`, Linear's `/graphql/`) and now expects `/graphql`, Linear's documented address. Decided as a small mechanic; say so in the ship notes.
- [INFORMATIONAL] (confidence: 8/10) `src/main/integrationBroker.ts:54` — `UPSTREAM_TIMEOUT_MS` is 30 seconds. An endpoint that thinks before it answers may run past it. A saved call has no journal, so this is a plain error the agent can retry. Scale unknown, so it stays at 30 seconds until a real endpoint shows otherwise.
- [INFORMATIONAL] (confidence: 7/10) `src/renderer/src/components/CapabilitiesTab.tsx:519` — Read only and Can change mean the same on a saved call (R4). The level control stays, and its info tip says so.
- [INFORMATIONAL] (confidence: 7/10) body template — it's stored in `config.json` without encryption, and an owner might paste a key there. Agents never receive it. The field's info tip says keys go in the key field.

Red flags: no shallow module, pass-through or importable internals. **Two ways to do one task** is closed by the lock (R2). **Hand-synced list:** the draft carries fields by hand, so a test covers the round trip.

### Code quality

- [CRITICAL] (confidence: 9/10) `String.replace` with a string replacement treats `$&` as a pattern, so a message holding `$&` would be mangled. Fill with `split` and `join`, one pass, so a message containing `{{message}}` isn't filled again.
- [INFORMATIONAL] (confidence: 8/10) `src/main/integrationBroker.ts:407` — `forward` copies the caller's headers. A saved call builds its own: user agent, content type for a body, and the injected auth.
- [INFORMATIONAL] (confidence: 8/10) i18next would treat `{{message}}` in a locale string as its own placeholder. Pass the example text as a value, in all three languages.
- [INFORMATIONAL] (confidence: 7/10) a saved call read from a damaged `config.json` isn't validated by `listRecords`. The fill fails closed with a plain error, and nothing is sent.
- `encodeURIComponent` leaves `..` as it is, and a path message such as `../admin` must be stopped. Filling before `resolveUpstreamUrl` does this: that function decodes and refuses `..` (line 237).

### Tests

```
CODE PATHS                                         USER FLOWS
[+] validateIntegrationRecord                      [+] Owner sets up
  ├── [GAP] keeps a good call                        ├── [GAP] save, reopen, rename keeps the call
  ├── [GAP] unquoted {{message}} accepted            ├── [GAP] both Test buttons on a POST only endpoint
  └── [GAP] each refusal in the plan                 └── [GAP] bad JSON shows a clear error
[+] fill                                           [+] Agent
  ├── [GAP] quotes, newlines, $&, {{message}}        ├── [GAP] [→E2E] message, real server, real broker
  ├── [GAP] keys never filled                        ├── [GAP] [→E2E] same message twice, sent twice
  └── [GAP] path encoded, ../ refused                ├── [GAP] Read only sends, no level refused
[+] broker /call and /i lock                         ├── [GAP] /i refused on a saved connection
  ├── [★★★ TESTED] token, level, disabled            └── [★★★ TESTED] answer screening, same path
  ├── [GAP] message after a slow-down hold           [+] Regression
  └── [GAP] no saved call answers with guidance
[+] resolveUpstreamUrl                               └── [GAP] no saved call: journal and Read only as today
  └── [GAP] empty path, query only, trailing slash
```

Coverage today: 2 of 19 paths. All gaps are in the implementation tasks. Tests live in `test/integration-access.test.cjs`, which already runs the real MCP server against the real broker. No LLM eval is needed: the agent text changes only tool descriptions.

### Performance

No findings. One small JSON parse per call, no database and no loop. Skipping the journal removes a disk write. Request rate is unknown; the existing per connection slow-down still applies.

### Outside voice

DeepSeek V4 Pro through `codex exec -p deepseek-review`, one pass, read-only. Every finding was checked against the code.

- Applied to the plan: the unquoted placeholder scan, body read after the slow-down, `readOnly` false, the `saved_call` shape, every `/i` form locked, non-text and blank messages refused, `purpose` required.
- Changed: it asked for a Test sample through the bridge. The plan now uses fixed text in main, which is smaller.
- Rejected: a level-only check on `/call`. A temporary worker granted the id has access by the broker's existing rule, and `ALLOW_TEMP_WORKERS` is off.
- Noted: catalog presets are also `custom-rest`, so the plan now says the fields show there and stay off until filled in.

No finding reopened R1 to R4, and none needed a new owner decision.

### Reality rows

- premise-table: 11 premises, each with a receipt above, unverified=0.
- already-done: nothing on `origin/main` since 2026-11-01 in the named files.
- surface-check: `/call/<id>` is new. Existing routes, tools and fields were read in the code.
- binding-decisions: none recorded beyond D1 to D3.
- numbers: 10 minutes, 24 hours and 30 seconds read from code; effort figures estimated.
- deferred-asks: no linked issue.
- pr-count: one wave, on the running branch.

## NOT in scope

- More than one saved call per connection (R3).
- Read only rules for POSTs with no saved call, which keep today's behaviour (R4).
- More than the one `message` value, and bodies that aren't JSON.
- A longer upstream timeout.

## What already exists

- `call_integration`, the broker, access levels, key injection, answer screening and the slow-down are all reused.
- `resolveUpstreamUrl` remains the only way a path reaches a server.

## Failure modes

| Path | Failure | Handling | Agent or owner sees |
|---|---|---|---|
| Fill | Damaged saved call | Fails closed, nothing sent | Plain error |
| Upstream | Longer than 30 seconds | Error, may retry | `bad_gateway` text |
| Upstream | Redirect | Not followed | The 3xx status |
| Repeat | An agent loops on a POST that really changes data | Owner's choice (R1); turn limits and slow-down still apply | Repeated sends |
| Test | Owner tests a POST that changes data | Sends for real, and the button says so | Real call |

No silent failure without handling, so no critical gaps.

## Behavior changes

| Who | Rule today | New rule | What the owner sees |
|---|---|---|---|
| Any member with a saved call | Sends method, path and body | Sends only `message` | Saved call fields in Settings |
| Same | A repeat POST within 10 minutes gets the old answer | Sent every time | Fresh answers, and repeats do reach the server |
| Read only member | POST refused | Saved call allowed | Level makes no difference on that connection |
| Any member | Empty path adds a trailing slash | The base URL as saved | Nothing, unless a server relied on the slash |

Sequential implementation, no parallelization opportunity.

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — shared — add `SavedCall` to the record, its validation and the fill
  - Surfaced by: Architecture, `validateIntegrationRecord` drops `call`; Code quality, `$&`
  - Files: `src/shared/integrations.ts`, `test/integration-access.test.cjs`
  - Verify: `node --test test/integration-access.test.cjs`
- [ ] **T2 (P1, human: ~1h / CC: ~5min)** — shared — keep the base URL exact on an empty path
  - Surfaced by: Architecture, trailing slash
  - Files: `src/shared/integrations.ts`, `test/integration-access.test.cjs`
  - Verify: table of base URLs, including Linear's
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** — broker — add `POST /call/<id>`, the lock on `/i/<id>`, no journal, own headers
  - Surfaced by: R1, R2, R4; outside voice on body order, `readOnly` and the `/i` forms
  - Files: `src/main/integrationBroker.ts`, `src/shared/integrations.ts`, `test/integration-access.test.cjs`
  - Verify: real broker test, same message reaches the server twice
- [ ] **T4 (P1, human: ~1h / CC: ~10min)** — agent — `message` on `call_integration`, `saved_call` in the list, skill text
  - Surfaced by: R1; outside voice on the `saved_call` shape
  - Files: `src/shared/integrations.ts`, `resources/md-integrations-mcp.cjs`, `resources/skills/capabilities/SKILL.md`
  - Verify: the real MCP server test
- [ ] **T5 (P1, human: ~4h / CC: ~20min)** — UI — saved call fields, Test with the fixed text, three languages
  - Surfaced by: Architecture, the draft round trip; Test button sends GET
  - Files: `src/renderer/src/components/IntegrationsRegistry.tsx`, `src/renderer/src/components/CapabilitiesTab.tsx`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/integrations/registryClient.ts`, locales
  - Verify: add the owner's example against a local server in the running app
- [ ] **T6 (P2, human: ~30min / CC: ~5min)** — docs — update `docs/FEATURES.md` at ship, with Behavior changes in the ship notes
  - Surfaced by: Behavior changes
  - Files: `docs/FEATURES.md`
  - Verify: read through

Mark the one call limit with `gstack-shortcut(dec-754058e5)` where the record type is defined.

## Completion summary

- Step 0: Scope Challenge: scope accepted as-is
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 5 issues found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 17 gaps identified
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: DeepSeek V4 Pro through Codex, completed, 9 findings
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: 0/1

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | none |
| Outside Review | Codex with DeepSeek V4 Pro, default step | Independent 2nd opinion | 1 | completed | 9 findings, all resolved in the plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 26 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | none |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | none |

- **OUTSIDE COVERAGE:** Codex with DeepSeek V4 Pro, plan review, completed, 9 findings.
- **VERDICT:** No review is CLEAR, because Eng's 26 issues are mapped to tasks and not yet built. eng review required only if the plan changes.

NO UNRESOLVED DECISIONS
