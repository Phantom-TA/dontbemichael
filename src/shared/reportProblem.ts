import { REPO_URL } from './updateState';

/**
 * The "Report a problem" link: a new bug report on GitHub with the app version
 * and the OS filled in (docs/designs/windows-11-installer.md, E4). The keys are
 * the bug report form's field ids (.github/ISSUE_TEMPLATE/bug_report.yml), and
 * `os` must be one of that form's dropdown options, which the OS labeler reads.
 * Nothing else goes in the URL: no paths, names or logs. The one addition is
 * this office's recent automatic report fingerprints, in the Logs field, so a
 * person's report can be matched to the automatic issue
 * (docs/designs/auto-report-failures.md, E7): 12 hex characters each, at most 5.
 */
export function reportProblemUrl(p: { appVersion: string; platform: string; arch: string; osVersion?: string; fingerprints?: readonly string[] }): string {
  const os = p.platform === 'darwin' ? (p.arch === 'arm64' ? 'macOS (Apple Silicon)' : 'macOS (Intel)')
    : p.platform === 'win32' ? 'Windows'
    : p.platform === 'linux' ? 'Linux'
    : '';
  const q = new URLSearchParams({ template: 'bug_report.yml', 'app-version': p.appVersion });
  if (os) q.set('os', os);
  if (p.osVersion) q.set('os-version', p.osVersion.slice(0, 40));
  const fps = (p.fingerprints ?? []).filter((f) => /^[0-9a-f]{12}$/.test(f)).slice(0, 5);
  if (fps.length) q.set('logs', `Recent automatic reports: ${fps.join(', ')}`);
  return `${REPO_URL}/issues/new?${q.toString()}`;
}
