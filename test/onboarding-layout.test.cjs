'use strict';

/**
 * The onboarding card is centered whenever the studio isn't showing
 * (docs/designs/onboarding-centered.md, owner 2026-10-07).
 *
 * It used to sit at the start edge on Business, Details and Resume, where the
 * studio never shows, under a centered step indicator. One flag, hasStudio,
 * now drives the grid, the studio and the glow; these checks keep the three
 * from drifting apart and keep the motion behind reduced motion.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wizard = fs.readFileSync(path.join(root, 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/src/design/global.css'), 'utf8');

test('the studio shows only from the Team step on, and only with a team', () => {
  const m = wizard.match(/const hasStudio = \(([^)]+)\) && teamAgents\.length > 0;/);
  assert.ok(m, 'hasStudio is defined from the step list and the team');
  const steps = [...m[1].matchAll(/step === '([a-z]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(steps, ['home', 'orchestrator', 'permissions', 'ready', 'team']);
  for (const centered of ['business', 'details', 'resume']) assert.ok(!steps.includes(centered), `${centered} is centered`);
});

test('without the studio the side tracks are equal, so the card is centered', () => {
  const m = wizard.match(/gridTemplateColumns: hasStudio \? '([^']+)' : '([^']+)'/);
  assert.ok(m, 'the body grid columns follow hasStudio');
  const [, withStudio, alone] = m;
  const tracks = (s) => s.split(/\s+(?=minmax)/);
  const [aStart, aCard, aEnd] = tracks(alone);
  assert.equal(aStart, aEnd, 'equal start and end tracks center the card');
  assert.match(aCard, /560px/);
  const [sStart, sCard] = tracks(withStudio);
  assert.match(sStart, /0fr/, 'the start track closes when the studio shows');
  assert.equal(sCard, aCard, 'the card track keeps its width, so only the side tracks animate');
  assert.match(wizard, /columnGap: 0/, 'no gap is left behind by a closed start track');
});

test('the studio and the glow read the same flag', () => {
  assert.match(wizard, /\{hasStudio && \(\s*<div className="cth-onboarding-studio cth-onb-studio-in"/);
  assert.match(wizard, /className=\{`cth-onb-glow\$\{hasStudio \? ' is-studio' : ''\}`\} aria-hidden/);
  assert.doesNotMatch(wizard, /radial-gradient\(900px 600px at 72%/, 'the glow no longer sits fixed at 72% in the page background');
});

test('the glow is centered alone and over the studio after, mirrored in right to left', () => {
  assert.match(css, /@property --cth-onb-glow-x \{[^}]*initial-value: 50%/);
  assert.match(css, /\.cth-onb-glow\.is-studio \{ --cth-onb-glow-x: 72%; \}/);
  assert.match(css, /\[dir="rtl"\] \.cth-onb-glow\.is-studio \{ --cth-onb-glow-x: 28%; \}/);
});

test('the slide, the glow and the fade stop under reduced motion', () => {
  assert.match(css, /\.cth-onb-body \{ transition: grid-template-columns var\(--cth-dur-slow\)/);
  const block = css.slice(css.indexOf('.cth-onb-body {'));
  const reduced = block.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
  assert.ok(reduced, 'a reduced motion block follows the onboarding rules');
  assert.match(reduced[1], /\.cth-onb-body, \.cth-onb-glow \{ transition: none; \}/);
  assert.match(reduced[1], /\.cth-onb-studio-in \{ animation: none; \}/);
  assert.doesNotMatch(css.match(/@keyframes cth-onb-studio-in \{[^\n]*/)[0], /transform/, 'opacity only, so fixed dialogs keep the window as their box');
});
