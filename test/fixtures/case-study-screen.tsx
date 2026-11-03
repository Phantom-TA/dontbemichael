import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CaseStudyScreen } from '../../src/renderer/src/components/pulse/CaseStudyScreen';
import '../../src/renderer/src/i18n';
import '../../src/renderer/src/design/tokens.css';
import '../../src/renderer/src/design/global.css';

// The real case study screen under StrictMode, as the app renders it, with
// only the main-process boundary replaced. Nothing is read from an office.
const H = 3_600_000;
const facts = {
  lang: 'en', paper: 'letter', showName: true, businessName: 'Harbor Bakery', businessType: 'Bakery', city: 'Austin',
  members: [{ id: 'pam', name: 'Pam', role: 'Front desk', jobs: [], figure: { kind: 'email', count: 640 }, isMichael: false }],
  figures: { email: 1284, sent: 0, task: 96, check: 0, routed: 0, ranMs: 40 * H, awayMs: 20 * H, spendUsd: 12 },
  days: [{ day: '2026-10-04', ms: 9 * H, awayMs: 6 * H }], range: { from: '2026-10-04', to: '2026-11-02', days: 30 }, appVersion: '0.3.5'
};
const input = { lang: 'en', period: 'last-30', showName: true };
const draft = { subtitle: 'A bakery and its AI office team', about: 'Bakes bread for cafes', why: 'It frees the owner', headlines: { email: { before: 'The AI office at Harbor Bakery handled', after: 'emails' } }, team: { pam: 'Sorts the inbox' } };
const ready = { state: 'ready', input, draft, logo: { ok: false, reason: 'no-site' }, hasWork: true };
const calls: string[] = [];
const slow = <T,>(v: T, name = ''): Promise<T> => { calls.push(name); return new Promise((r) => setTimeout(() => { calls.push(name + ':done'); r(v); }, 30)); };
(window as unknown as { cth: unknown }).cth = {
  caseStudyOpen: () => slow({ facts, fonts: [], senders: [{ id: 'ceo', address: 'ceo@x.example', canSend: true }], hasWork: true, to: 'hello@dontbemichael.com' }, 'open'),
  caseStudyPrepare: () => slow(ready, 'prepare'),
  caseStudyStatus: () => slow(ready),
  caseStudyDraft: () => slow({ ok: true, draft }),
  caseStudyLogo: () => slow({ ok: false, reason: 'no-site' }),
  onCaseStudyReady: () => () => {},
  onCaseStudyShow: () => () => {}
};
(window as unknown as { screenTest: unknown }).screenTest = {
  /** Types into a panel field the way React sees a keystroke. */
  type: (label: string, text: string) => {
    const field = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))?.querySelector('textarea, input') as HTMLTextAreaElement | null;
    if (!field) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  state: () => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
    return {
      loading: document.body.innerText.includes("Reading your office's figures"),
      frame: !!frame,
      headline: frame?.contentDocument?.querySelector('.headline')?.textContent ?? null,
      mailbox: document.body.innerText.includes('ceo@x.example'),
      editableOnPage: !!frame?.contentDocument?.querySelector('[contenteditable], [data-part]'),
      about: frame?.contentDocument?.querySelector('.cols .p')?.textContent ?? null,
      calls
    };
  }
};
createRoot(document.getElementById('root')!).render(<StrictMode><CaseStudyScreen onClose={() => {}} /></StrictMode>);
