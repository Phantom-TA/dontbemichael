'use strict';

/**
 * Setup goes from the company details straight to the team (owner,
 * 2026-10-30): the Meet your office step, with its Suggest my team button,
 * left owners unsure what they were looking at. What it said lives behind
 * the (i) on the team step's intro.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wizard = fs.readFileSync(path.join(root, 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');

test('setup has no Meet step, and the team step carries what it said behind an info icon', () => {
  // Value: protects=owner 2026-10-30 (no intro screen before the team); fails_when=the Meet step or its Suggest my team button comes back, details leads anywhere but the team, the back button skips the team, or the team intro loses its (i) in any language; why_new=Meet step removed; seam=source pins (the wizard has no render harness); no_claim=layout
  const order = [...wizard.match(/const ORDERED_STEPS = \[([^\]]+)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 3), ['business', 'details', 'team']);
  assert.doesNotMatch(wizard, /'welcome'/, 'no step, preview or button names it');
  assert.doesNotMatch(wizard, /suggestCta/);
  assert.match(wizard, /: s === 'details' \? 'team'/);
  assert.match(wizard, /: s === 'team' \? 'details'/);
  assert.match(wizard, /<InfoTip text=\{t\('onboarding\.team\.introTip', \{ godName \}\)\} \/>/);
  for (const locale of ['en', 'zh-CN', 'ar']) {
    const o = JSON.parse(fs.readFileSync(path.join(root, 'src/renderer/src/i18n/locales', `${locale}.json`), 'utf8')).onboarding;
    assert.match(o.team.introTip, /\{\{godName\}\}/, `${locale}: the team step's (i)`);
    assert.equal(o.welcome, undefined, `${locale}: the Meet step's copy is gone`);
    assert.equal(o.stepTitle.welcome, undefined, `${locale}: and its title`);
  }
});
