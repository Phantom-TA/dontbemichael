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

const MAIN_REPO = 'agentvivekkumar/dontbemichael';
const MAX_REPORTS = 50;
const NEW_ISSUES_PER_DAY = 10;
const REOPENS_PER_DAY = 20;
const CANARY_GRACE_MS = 3 * 3600_000;

/** `0.2.9-rc.1` < `0.2.9` < `0.2.10`; null for anything else. */
function semver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])] : null;
}
function newer(a, b) {
  const x = semver(a), y = semver(b);
  if (!x) return false;
  if (!y) return true;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function emptyState() {
  return { firstRun: null, lastRun: null, counted: {}, queued: [], day: '', newIssues: 0, reopens: 0, counts: {}, seenComment: {}, mainIssue: {}, privateFor: {}, reopened: {}, linked: {}, canary: {} };
}

function seenOnBody(fp, counts) {
  const rows = Object.entries(counts ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => {
    const [ver, osName] = k.split('|');
    return `| \`${ver}\` | \`${osName}\` | ${n} |`;
  });
  return ['Seen on (unverified counts)', '', '| version | os | count |', '|---|---|---|', ...rows, ''].join('\n');
}

/**
 * One promotion run. `gh(token, method, path, body)` answers
 * `{ status, json }`; `schemaFor(version)` gives the schema module of that
 * release, or null when it cannot be fetched.
 */
async function runPromotion({ gh, schemaFor, state: given, now, reportsRepo, reportsToken, mainToken }) {
  const state = { ...emptyState(), ...(given ?? {}) };
  const failures = [];
  const at = now();
  const day = new Date(at).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.newIssues = 0; state.reopens = 0; }
  // Releases from before the first run never had a canary to send.
  if (!state.firstRun) state.firstRun = new Date(at).toISOString();
  const capHit = new Set();

  const rel = await gh(mainToken, 'GET', `/repos/${MAIN_REPO}/releases?per_page=100`);
  const releases = rel.status === 200 && Array.isArray(rel.json) ? rel.json.filter((r) => !r.draft) : [];
  // A wrong or expired MAIN_ISSUES_TOKEN must fail the run, not look like a quiet hour.
  if (rel.status !== 200) failures.push(`main repo not reachable with MAIN_ISSUES_TOKEN: ${rel.status}`);
  const published = new Set(releases.map((r) => String(r.tag_name).replace(/^v/, '')));

  // Queued first, then what changed since the last run, at most 50 in all.
  const items = [...state.queued];
  const since = state.lastRun ? `&since=${encodeURIComponent(state.lastRun)}` : '';
  const issues = await gh(reportsToken, 'GET', `/repos/${reportsRepo}/issues?state=all&per_page=${MAX_REPORTS}${since}`);
  for (const i of Array.isArray(issues.json) ? issues.json : []) if (!i.pull_request) items.push({ type: 'issue', id: i.id, number: i.number });
  const comments = await gh(reportsToken, 'GET', `/repos/${reportsRepo}/issues/comments?per_page=${MAX_REPORTS}${since}`);
  for (const c of Array.isArray(comments.json) ? comments.json : []) {
    const number = Number(String(c.issue_url ?? '').split('/').pop());
    items.push({ type: 'comment', id: c.id, number, body: c.body });
  }
  const queued = [];
  const seenKeys = new Set();
  // Fingerprints whose Seen on comment changed: edited once at the end of the run.
  const dirty = new Set();
  let handled = 0;

  for (const item of items) {
    const key = `${item.type === 'issue' ? 'i' : 'c'}${item.id}`;
    if (state.counted[key] || seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (handled++ >= MAX_REPORTS) { queued.push(item); continue; }

    const parent = await gh(reportsToken, 'GET', `/repos/${reportsRepo}/issues/${item.number}`);
    const p = parent.json ?? {};
    const fpTitle = /\(([0-9a-f]{12})\)$/.exec(p.title ?? '');
    const version = /\| appVersion \| `([^`]*)` \|/.exec(p.body ?? '')?.[1];
    const schema = version && published.has(version) ? await schemaFor(version) : null;
    const base = schema ? schema.parseIssueBody(p.body ?? '') : null;
    const okIssue = base && fpTitle && p.title === schema.issueTitle(base);
    let report = okIssue ? base : null;
    if (report && item.type === 'comment') {
      const seen = schema.parseSeenOn(item.body ?? '');
      report = seen && published.has(seen.appVersion) ? { ...base, ...seen } : null;
    }
    if (!report) {
      if (item.type === 'issue') await gh(reportsToken, 'POST', `/repos/${reportsRepo}/issues/${item.number}/labels`, { labels: ['rejected'] });
      state.counted[key] = 1;
      continue;
    }
    if (report.kind === 'canary') {
      state.canary[report.appVersion] = new Date(at).toISOString();
      state.counted[key] = 1;
      continue;
    }

    const fp = report.fingerprint;
    let main = state.mainIssue[fp];
    if (main === undefined) {
      const q = encodeURIComponent(`${fp} in:title repo:${MAIN_REPO} type:issue label:auto-report`);
      const found = await gh(mainToken, 'GET', `/search/issues?q=${q}&per_page=1`);
      const hit = (found.json?.items ?? []).find((i) => String(i.title).endsWith(`(${fp})`));
      if (hit) main = hit.number;
    }
    if (main === undefined) {
      if (state.newIssues >= NEW_ISSUES_PER_DAY) { capHit.add('new issues'); queued.push(item); continue; }
      const made = await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues`, { title: schema.issueTitle(base), body: schema.issueBody(base), labels: ['auto-report'] });
      if (made.status !== 201) { failures.push(`create main issue: ${made.status}`); queued.push(item); continue; }
      main = made.json.number;
      state.newIssues++;
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
        if (state.reopens >= REOPENS_PER_DAY) { capHit.add('reopens'); queued.push(item); continue; }
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
    if (!state.linked[item.number]) {
      await gh(reportsToken, 'POST', `/repos/${reportsRepo}/issues/${item.number}/comments`, { body: `Promoted to ${MAIN_REPO}#${main}.` });
      state.linked[item.number] = 1;
    }
    state.counted[key] = 1;
  }

  for (const fp of dirty) {
    const body = seenOnBody(fp, state.counts[fp]);
    if (state.seenComment[fp]) {
      await gh(mainToken, 'PATCH', `/repos/${MAIN_REPO}/issues/comments/${state.seenComment[fp]}`, { body });
    } else {
      const c = await gh(mainToken, 'POST', `/repos/${MAIN_REPO}/issues/${state.mainIssue[fp]}/comments`, { body });
      if (c.status === 201) state.seenComment[fp] = c.json.id;
    }
  }

  state.queued = queued;
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
  const gh = async (token, method, p, body) => {
    const res = await fetch(`https://api.github.com${p}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'dontbemichael-reports' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  };
  // Each release's own schema, fetched once by tag and imported as TypeScript.
  const cache = new Map();
  const schemaFor = async (version) => {
    if (cache.has(version)) return cache.get(version);
    let mod = null;
    const res = await fetch(`https://raw.githubusercontent.com/${MAIN_REPO}/v${version}/src/shared/failureReport.ts`);
    if (res.ok) {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'schema-')), 'failureReport.ts');
      fs.writeFileSync(file, await res.text());
      try { mod = await import(file); } catch { mod = null; }
    }
    cache.set(version, mod);
    return mod;
  };
  const stateFile = path.join(process.cwd(), 'state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  const out = await runPromotion({ gh, schemaFor, state, now: () => Date.now(), reportsRepo, reportsToken, mainToken });
  fs.writeFileSync(stateFile, JSON.stringify(out.state, null, 2) + '\n');
  const summary = [`Last report check: ${out.state.lastRun}`, `Main repo releases seen: ${out.releasesSeen}`, `Queued: ${out.state.queued.length}`, ...out.failures.map((f) => `FAILED: ${f}`)].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  console.log(summary);
  if (out.failures.length) process.exitCode = 1;
}

module.exports = { runPromotion, newer, seenOnBody, emptyState };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
