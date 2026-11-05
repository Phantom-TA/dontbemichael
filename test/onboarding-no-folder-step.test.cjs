'use strict';

/**
 * Setup does not ask for the office folder (owner, 2026-10-29): the default
 * folder confused new owners, and Settings changes it later. The folder step
 * shows only when the suggested folder can't be used.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wizard = fs.readFileSync(path.join(root, 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/renderer/src/components/SettingsModal.tsx'), 'utf8');

test('setup goes from the team straight to the next step, and asks for a folder only when it must', () => {
  // Value: protects=owner 2026-10-29 (no folder question at setup); fails_when=the folder step is back in the walked steps, the team step leads to it, leaving the team step skips the office already there check, or Settings loses the way to change the folder; why_new=folder step removed from the flow; seam=source pins (the wizard has no render harness); no_claim=layout
  const order = [...wizard.match(/const ORDERED_STEPS = \[([^\]]+)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(!order.includes('home'), 'the folder step is not one of the walked steps');
  assert.match(wizard, /: s === 'team' \? 'orchestrator'/);
  assert.match(wizard, /: s === 'orchestrator' \? 'team'/);
  // The team step's Next checks the suggested folder, and lands on the folder step only when it can't be used.
  const check = wizard.slice(wizard.indexOf("if (step === 'team' || step === 'home') {"));
  assert.ok(check.length > 0);
  assert.match(check, /if \(!where\) \{[\s\S]*?setStep\('home'\);/, 'no folder to suggest: ask');
  assert.match(check, /setError\(t\('onboarding\.resume\.folderInUse'\)\);\s*setStep\('home'\);/, 'a folder holding another office: ask');
  assert.match(check, /setStep\('resume'\);/, 'an office that can be continued: offer it');
  assert.match(settings, /\{t\('settings\.general\.homeFolder'\)\}[\s\S]*?onClick=\{pickNewHome\}/, 'Settings changes the folder later');
});
