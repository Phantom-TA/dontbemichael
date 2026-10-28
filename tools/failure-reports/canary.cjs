'use strict';
/**
 * The release canary (docs/designs/auto-report-failures.md, Section 8): after
 * a release is published, file one `canary` report with the release's key.
 * The promotion Action never promotes it; it only checks it arrived, and
 * fails its run (an email to the schedule owner) when it did not within 3
 * hours, so a revoked key or a broken Action is caught at every release.
 *
 *   TAG=v0.2.9 FAILURE_REPORT_KEY=... node tools/failure-reports/canary.cjs
 *   (Node 24: the schema .ts is imported with type stripping)
 */
const crypto = require('node:crypto');
const path = require('node:path');

function buildCanary(schema, tag) {
  const appVersion = String(tag).replace(/^v/, '');
  const report = {
    kind: 'canary', detail: 'release', errorName: 'Error', frames: [],
    fingerprint: crypto.createHash('sha256').update(`canary ${appVersion}`).digest('hex').slice(0, 12),
    appVersion, os: 'linux', osVersion: '0', arch: 'x64', engine: 'none', engineVersion: 'unknown', count: 1
  };
  const bad = schema.validateReport(report);
  if (bad) throw new Error(`canary report invalid: ${bad}`);
  return { title: schema.issueTitle(report), body: schema.issueBody(report), labels: ['auto'] };
}

async function main() {
  const key = process.env.FAILURE_REPORT_KEY;
  const tag = process.env.TAG;
  if (!key) { console.log('No FAILURE_REPORT_KEY: no canary filed.'); return; }
  if (!tag) throw new Error('TAG is required');
  const schema = await import(path.resolve(__dirname, '../../src/shared/failureReport.ts'));
  const issue = buildCanary(schema, tag);
  const res = await fetch(`https://api.github.com/repos/${schema.REPORTS_REPO}/issues`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'dontbemichael' },
    body: JSON.stringify(issue)
  });
  if (res.status !== 201) throw new Error(`canary not filed: ${res.status}`);
  console.log(`Canary filed for ${tag}.`);
}

module.exports = { buildCanary };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
