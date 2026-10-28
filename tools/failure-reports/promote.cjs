'use strict';
/**
 * The reports repo's promotion Action (docs/designs/auto-report-failures.md,
 * Design > Promotion Action). Copy this folder's promote.cjs and
 * promote.yml into the private reports repo at setup (T8).
 *
 * Every hour it reads the reports repo's new issues and `seen-on` comments,
 * checks each one on its own against the schema of the release it names,
 * and re-renders it into the main repo: one issue per fingerprint, label
 * `auto-report`, counts in one "Seen on (unverified counts)" comment. Nothing
 * is copied as text. A malformed report is labelled `rejected`; one past a
 * daily cap is queued for the next run. A run fails (GitHub emails the
 * schedule owner) when a cap is hit or the newest release's canary is missing.
 *
 *   node promote.cjs   (Node 24: the schema .ts is imported with type stripping)
 *   env: GITHUB_TOKEN (this repo), MAIN_ISSUES_TOKEN (main repo), GITHUB_REPOSITORY
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const MAIN_REPO = 'agentvivekkumar/dontbemichael';
const MAX_REPORTS = 50;
const MAX_QUEUE = 200;
/** Queued reports get at most this many of the 50; the rest is for new ones. */
const QUEUE_SLOTS = 25;
/** A queued report that keeps failing for a day of runs is given up on. */
const MAX_TRIES = 24;
/** Seen on edits may run this far past the work budget, then wait. */
const SEEN_BUDGET_MS = 20_000;
/** Pages read past a full page that ends on the cursor's own second. */
const MAX_PAGES = 5;
const SCHEMA_FUNCTIONS = ['parseIssueBody', 'issueTitle', 'issueBody', 'parseSeenOn', 'fingerprintInput'];
const NEW_ISSUES_PER_DAY = 10;
const REOPENS_PER_DAY = 20;
const CANARY_GRACE_MS = 3 * 3600_000;
/** Work stops here and the rest waits for the next run, so state is always
 *  saved inside the job's 2 minute timeout (checkout and setup take the rest). */
const RUN_BUDGET_MS = 60_000;
const PRE_RANK = { alpha: 0, beta: 1, rc: 2 };

/** `0.2.9-alpha.1` < `0.2.9-rc.1` < `0.2.9` < `0.2.10`; null for anything else. */
function semver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(v ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : PRE_RANK[m[4]], m[5] === undefined ? 0 : Number(m[5])];
}
function newer(a, b) {
  const x = semver(a), y = semver(b);
  if (!x) return false;
  if (!y) return true;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function emptyState() {
  return { firstRun: null, lastRun: null, issueCursor: null, commentCursor: null, counted: {}, queued: [], seenDirty: [], day: '', newIssues: 0, reopens: 0, counts: {}, seenComment: {}, mainIssue: {}, privateFor: {}, reopened: {}, linked: {}, canary: {} };
}

function seenOnBody(counts) {
  const rows = Object.entries(counts ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => {
    const [ver, osName] = k.split('|');
    return `| \`${ver}\` | \`${osName}\` | ${n} |`;
  });
  return ['Seen on (unverified counts)', '', '| version | os | count |', '|---|---|---|', ...rows, ''].join('\n');
}

/** The fingerprint must be the hash of the report's own fields: one made up
 *  could merge a junk report into a real one's count. */
function fingerprintHolds(schema, r) {
  const input = r.kind === 'canary' ? `canary ${r.appVersion}` : schema.fingerprintInput(r.kind, r.detail, r.errorName, r.frames);
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12) === r.fingerprint;
}

/**
 * One promotion run. `gh(token, method, path, body)` answers
 * `{ status, json }` (status 0 when the network failed). `schemaFor(version)`
 * gives the schema module of that release, null when that release has none
 * (the report is rejected), and throws when it cannot be fetched right now
 * (the report waits). `save(state)` is called after every report, so a run
 * cut short keeps what it did.
 *
 * New issues and comments are read oldest change first from a cursor per
 * list, so a busy hour is finished by later runs and nothing is skipped.
 */
async function runPromotion({ gh, schemaFor, state: given, now, reportsRepo, reportsToken, mainToken, save }) {
  const state = { ...emptyState(), ...(given ?? {}) };
  const failures = [];
  const at = now();
  const day = new Date(at).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.newIssues = 0; state.reopens = 0; }
  // Releases from before the first run never had a canary to send.
  if (!state.firstRun) state.firstRun = new Date(at).toISOString();
  // A state saved before the cursors existed starts where its last run left off.
  if (given && !('issueCursor' in given) && given.lastRun) { state.issueCursor = given.lastRun; state.commentCursor = given.lastRun; }
  const capHit = new Set();

  const rel = await gh(mainToken, 'GET', `/repos/${MAIN_REPO}/releases?per_page=100`);
  // A wrong or expired MAIN_ISSUES_TOKEN must fail the run, not look like a
  // quiet hour, and must not judge any report against an empty release list.
  if (rel.status !== 200 || !Array.isArray(rel.json)) {
    failures.push(`main repo not reachable with MAIN_ISSUES_TOKEN: ${rel.status}`);
    return { state, failures, releasesSeen: 0 };
  }
  const releases = rel.json.filter((r) => !r.draft);
  const published = new Set(releases.map((r) => String(r.tag_name).replace(/^v/, '')));

  const since = (c) => (c ? `&since=${encodeURIComponent(c)}` : '');
  // A full page that ends on the cursor's own second is read on to the next
  // page: asking again with the same cursor would return the same page.
  async function readList(base, cursor) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await gh(reportsToken, 'GET', `${base}&per_page=${MAX_REPORTS}${since(cursor)}&page=${page}`);
      if (r.status !== 200) { failures.push(`reports repo list: ${r.status}`); break; }
      const list = Array.isArray(r.json) ? r.json : [];
      out.push(...list);
      if (list.length < MAX_REPORTS || !cursor || list[list.length - 1]?.updated_at !== cursor) break;
    }
    return out;
  }
  const fresh = [];
  for (const i of await readList(`/repos/${reportsRepo}/issues?state=all&sort=updated&direction=asc`, state.issueCursor)) {
    fresh.push({ type: 'issue', id: i.id, number: i.number, cursor: 'issueCursor', at: i.updated_at, skip: Boolean(i.pull_request) });
  }
  for (const c of await readList(`/repos/${reportsRepo}/issues/comments?sort=updated&direction=asc`, state.commentCursor)) {
    const number = Number(String(c.issue_url ?? '').split('/').pop());
    // The Action's own "Promoted to" comments are not reports.
    const own = c.user?.type === 'Bot' || String(c.body ?? '').startsWith('Promoted to ');
    fresh.push({ type: 'comment', id: c.id, number, body: c.body, cursor: 'commentCursor', at: c.updated_at, skip: own });
  }
  // Both lists in one time order, so neither can use up the run on its own.
  fresh.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));

  const queue = Array.isArray(state.queued) ? state.queued : [];
  let queueAt = 0;
  // Reports tried and failed this run go to the back; ones not reached keep their place.
  const waiting = [];
  const retry = [];
  const seenKeys = new Set();
  // Fingerprints whose Seen on comment changed: edited once at the end of the run.
  const dirty = new Set(Array.isArray(state.seenDirty) ? state.seenDirty : []);
  const overBudget = () => now() - at > RUN_BUDGET_MS;
  const keyOf = (item) => `${item.type === 'issue' ? 'i' : 'c'}${item.id}`;
  const later = (item, tried = true) => {
    const tries = (item.tries ?? 0) + (tried ? 1 : 0);
    if (tries >= MAX_TRIES) { failures.push(`gave up on ${item.type} ${item.id} after ${tries} runs`); state.counted[keyOf(item)] = 1; return; }
    (tried ? retry : waiting).push({ type: item.type, id: item.id, number: item.number, tries });
  };
  const snapshot = () => ({ ...state, queued: [...queue.slice(queueAt), ...waiting, ...retry], seenDirty: [...dirty] });

  async function handle(item) {
    const key = keyOf(item);
    seenKeys.add(key);

    const parent = await gh(reportsToken, 'GET', `/repos/${reportsRepo}/issues/${item.number}`);
    if (parent.status === 404 || parent.status === 410) { state.counted[key] = 1; return; }
    if (parent.status !== 200) { failures.push(`read report ${item.number}: ${parent.status}`); later(item); return; }
    const p = parent.json ?? {};
    const fpTitle = /\(([0-9a-f]{12})\)$/.exec(p.title ?? '');
    const version = /\| appVersion \| `([^`]*)` \|/.exec(p.body ?? '')?.[1];
    // A release with no schema (one from before reports) rejects; a fetch
    // that fails for now throws and the report waits (caught below).
    const loaded = version && published.has(version) ? await schemaFor(version) : null;
    const schema = loaded && SCHEMA_FUNCTIONS.every((n) => typeof loaded[n] === 'function') ? loaded : null;
    const base = schema ? schema.parseIssueBody(p.body ?? '') : null;
    const okIssue = base && fpTitle && p.title === schema.issueTitle(base) && fingerprintHolds(schema, base);
    let report = okIssue ? base : null;
    if (report && item.type === 'comment') {
      let text = item.body;
      if (text === undefined) {
        const c = await gh(reportsToken, 'GET', `/repos/${reportsRepo}/issues/comments/${item.id}`);
        if (c.status === 404 || c.status === 410) { state.counted[key] = 1; return; }
        if (c.status !== 200) { failures.push(`read comment ${item.id}: ${c.status}`); later(item); return; }
        text = c.json?.body;
      }
      const seen = schema.parseSeenOn(text ?? '');
      report = seen && published.has(seen.appVersion) ? { ...base, ...seen } : null;
    }
    if (!report) {
      if (item.type === 'issue') await gh(reportsToken, 'POST', `/repos/${reportsRepo}/issues/${item.number}/labels`, { labels: ['rejected'] });
      state.counted[key] = 1;
      return;
    }
    if (report.kind === 'canary') {
      state.canary[report.appVersion] = new Date(at).toISOString();
      state.counted[key] = 1;
      return;
    }

    const fp = report.fingerprint;
    let main = state.mainIssue[fp];
    if (main === undefined) {
      // Past the cap nothing new can be filed today: wait without a search.
      if (state.newIssues >= NEW_ISSUES_PER_DAY) { capHit.add('new issues'); later(item, false); return; }
      if (overBudget()) { later(item, false); return; }
      const q = encodeURIComponent(`${fp} in:title repo:${MAIN_REPO} type:issue label:auto-report`);
      const found = await gh(mainToken, 'GET', `/search/issues?q=${q}&per_page=1`);
      // A failed search is not "no issue": filing now could make a duplicate.
      if (found.status !== 200) { failures.push(`search main repo: ${found.status}`); later(item); return; }
      const hit = (found.json?.items ?? []).find((i) => String(i.title).endsWith(`(${fp})`));
      if (hit) main = hit.number;
    }
    if (main === undefined) {
      const made = await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues`, { title: schema.issueTitle(base), body: schema.issueBody(base), labels: ['auto-report'] });
      if (made.status !== 201) { failures.push(`create main issue: ${made.status}`); later(item); return; }
      main = made.json.number;
      state.newIssues++;
      // Saved at once, so a run that ends early never files this fingerprint twice.
      state.mainIssue[fp] = main;
      save?.(snapshot());
      // The back link: which private report this came from (the fields are above).
      await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues/${main}/comments`, { body: `From the automatic reports: ${reportsRepo}#${item.number}.` });
    }
    state.mainIssue[fp] = main;
    // Two offices racing on a new fingerprint each file a private issue: the
    // later one is marked duplicate; its count still adds up below.
    if (item.type === 'issue') {
      const first = (state.privateFor ??= {})[fp];
      if (first === undefined) state.privateFor[fp] = item.number;
      else if (first !== item.number) await gh(reportsToken, 'POST', `/repos/${reportsRepo}/issues/${item.number}/labels`, { labels: ['duplicate'] });
    }

    // Reopen once per version when it shows up again after the fixing release.
    const mi = await gh(mainToken, 'GET', `/repos/${MAIN_REPO}/issues/${main}`);
    if (mi.json?.state === 'closed' && mi.json.closed_at) {
      const closedAt = Date.parse(mi.json.closed_at);
      const fixing = releases.filter((r) => Date.parse(r.published_at) < closedAt)
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
      const done = state.reopened[fp] ?? [];
      if (newer(report.appVersion, fixing?.tag_name) && !done.includes(report.appVersion)) {
        if (state.reopens >= REOPENS_PER_DAY) { capHit.add('reopens'); later(item, false); return; }
        await gh(mainToken, 'PATCH', `/repos/${MAIN_REPO}/issues/${main}`, { state: 'open' });
        await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues/${main}/comments`, { body: `Seen again on \`${report.appVersion}\`.` });
        state.reopened[fp] = [...done, report.appVersion];
        state.reopens++;
      }
    }

    const counts = (state.counts[fp] ??= {});
    const k = `${report.appVersion}|${report.os}`;
    counts[k] = (counts[k] ?? 0) + report.count;
    dirty.add(fp);
    state.counted[key] = 1;
    if (!state.linked[item.number]) {
      await gh(reportsToken, 'POST', `/repos/${reportsRepo}/issues/${item.number}/comments`, { body: `Promoted to ${MAIN_REPO}#${main}.` });
      state.linked[item.number] = 1;
    }
  }

  async function attempt(item) {
    try {
      await handle(item);
    } catch (e) {
      failures.push(`report ${item.type} ${item.id}: ${e && e.message ? e.message : e}`);
      later(item);
    }
  }

  // Queued reports first, at most 25 of them, then what changed since the
  // cursors. Reports already counted cost nothing and use no slot.
  let handled = 0;
  for (; queueAt < queue.length; queueAt++) {
    const item = queue[queueAt];
    if (state.counted[keyOf(item)] || seenKeys.has(keyOf(item))) continue;
    if (handled >= QUEUE_SLOTS || overBudget()) { waiting.push(item); continue; }
    handled++;
    await attempt(item);
    save?.(snapshot());
  }
  for (const item of fresh) {
    if (!item.skip && !state.counted[keyOf(item)] && !seenKeys.has(keyOf(item))) {
      // Unread reports stay behind the cursor for the next run.
      if (handled >= MAX_REPORTS || overBudget()) break;
      handled++;
      await attempt(item);
    }
    if (typeof item.at === 'string') state[item.cursor] = item.at;
    save?.(snapshot());
  }

  for (const fp of [...dirty]) {
    if (now() - at > RUN_BUDGET_MS + SEEN_BUDGET_MS) break;
    const body = seenOnBody(state.counts[fp]);
    let ok;
    if (state.seenComment[fp]) {
      const c = await gh(mainToken, 'PATCH', `/repos/${MAIN_REPO}/issues/comments/${state.seenComment[fp]}`, { body });
      ok = c.status === 200;
      // The comment was deleted: post a new one next run.
      if (c.status === 404) delete state.seenComment[fp];
      if (!ok) failures.push(`seen on ${fp}: ${c.status}`);
    } else {
      const c = await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues/${state.mainIssue[fp]}/comments`, { body });
      ok = c.status === 201;
      if (ok) state.seenComment[fp] = c.json.id;
      else failures.push(`seen on ${fp}: ${c.status}`);
      // The main issue was deleted: the next report of it files a new one.
      if (c.status === 404 || c.status === 410) { delete state.mainIssue[fp]; ok = true; }
    }
    // A write that failed stays for the next run.
    if (ok) dirty.delete(fp);
    save?.(snapshot());
  }

  // A flood (every office holds the key) must not grow the saved state without end.
  const queued = [...waiting, ...retry];
  if (queued.length > MAX_QUEUE) failures.push(`queue full: ${queued.length - MAX_QUEUE} oldest dropped`);
  state.queued = queued.slice(-MAX_QUEUE);
  state.seenDirty = [...dirty];
  state.lastRun = new Date(at).toISOString();
  for (const c of capHit) failures.push(`daily cap reached: ${c}`);

  // The newest release's canary must have arrived within 3 hours.
  const newest = releases.slice().sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
  if (newest && Date.parse(newest.published_at) > Date.parse(state.firstRun)) {
    const ver = String(newest.tag_name).replace(/^v/, '');
    if (at - Date.parse(newest.published_at) > CANARY_GRACE_MS && !state.canary[ver]) failures.push(`no canary for ${ver}`);
  }
  return { state, failures, releasesSeen: releases.length };
}

async function main() {
  const reportsRepo = process.env.GITHUB_REPOSITORY;
  const reportsToken = process.env.GITHUB_TOKEN;
  const mainToken = process.env.MAIN_ISSUES_TOKEN;
  if (!reportsRepo || !reportsToken || !mainToken) throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN and MAIN_ISSUES_TOKEN are required');
  // A network error is a status of 0, never a throw that loses the run's state.
  const gh = async (token, method, p, body) => {
    let res;
    try {
      res = await fetch(`https://api.github.com${p}`, {
        method,
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'dontbemichael-reports' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      return { status: 0, json: null };
    }
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  };
  // Each release's own schema, fetched once by tag and imported as TypeScript.
  const cache = new Map();
  // A release with no schema file (404) or one that does not import has none
  // for good (null); a network error or a server error throws, to try again.
  const schemaFor = async (version) => {
    if (cache.has(version)) return cache.get(version);
    let mod = null;
    const res = await fetch(`https://raw.githubusercontent.com/${MAIN_REPO}/v${version}/src/shared/failureReport.ts`, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'schema-')), 'failureReport.ts');
      fs.writeFileSync(file, await res.text());
      try { mod = await import(file); } catch { mod = null; }
    } else if (res.status !== 404) {
      throw new Error(`schema for ${version}: ${res.status}`);
    }
    cache.set(version, mod);
    return mod;
  };
  const stateFile = path.join(process.cwd(), 'state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  const save = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 2) + '\n');
  const out = await runPromotion({ gh, schemaFor, state, now: () => Date.now(), reportsRepo, reportsToken, mainToken, save });
  save(out.state);
  const summary = [`Last report check: ${out.state.lastRun}`, `Main repo releases seen: ${out.releasesSeen}`, `Queued: ${out.state.queued.length}`, ...out.failures.map((f) => `FAILED: ${f}`)].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  console.log(summary);
  if (out.failures.length) process.exitCode = 1;
}

module.exports = { runPromotion, newer, seenOnBody, emptyState, fingerprintHolds };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
