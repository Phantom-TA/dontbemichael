'use strict';

/**
 * The company profile (owner, 2026-09-25): key facts with short, definite
 * answers, asked in setup (essentials required on step 1, details optional on
 * step 2), editable in Settings, and delivered to every agent, Michael
 * included. No open text: longer material goes in company knowledge.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const cp = loadTs('src/shared/companyProfile.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const full = {
  ceo: 'Ana Rivera',
  address: { street: '1 Main St', city: 'Mountain View', region: 'CA', postalCode: '94043', country: 'United States' },
  website: 'sunrisebakery.example',
  legalName: 'Sunrise Bakery LLC', entityType: 'llc',
  phone: '+1 650 555 0100', email: 'hello@sunrisebakery.example', social: ['linkedin.com/company/sunrisebakery'],
  hours: 'Mon to Fri, 9am to 5pm', timeZone: 'America/Los_Angeles', serviceArea: 'national',
  languages: 'English', currency: 'usd', fiscalYearStartMonth: 1
};

test('junk is dropped, choices are checked, and whitespace is not an answer', () => {
  const p = cp.cleanCompanyProfile({ ...full, entityType: 'empire', serviceArea: 'moon', fiscalYearStartMonth: 13, ceo: '   ', social: ['', 'a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(p.entityType, undefined);
  assert.equal(p.serviceArea, undefined);
  assert.equal(p.fiscalYearStartMonth, undefined);
  assert.equal(p.ceo, undefined);
  assert.deepEqual(p.social, ['a', 'b', 'c', 'd', 'e'], 'blank lines dropped, at most 5');
  assert.equal(cp.cleanCompanyProfile({ currency: 'usd' }).currency, 'USD');
  assert.deepEqual(cp.cleanCompanyProfile(null), {});
});

test('setup needs the CEO and the headquarters street, city and country; the industry only for "something else"', () => {
  assert.deepEqual(cp.missingProfileFields({}, false), ['ceo', 'street', 'city', 'country']);
  assert.deepEqual(cp.missingProfileFields({}, true), ['ceo', 'street', 'city', 'country', 'industry']);
  assert.deepEqual(cp.missingProfileFields(cp.cleanCompanyProfile(full), false), []);
  assert.equal(cp.cityLine(full.address), 'Mountain View, CA', 'the city line older code reads');
});

test('agents get the filled in facts, one per line, and a pointer to company knowledge', () => {
  const text = cp.companyProfileContext({ name: 'Sunrise Bakery', industry: 'SaaS & Consulting' }, cp.cleanCompanyProfile(full));
  assert.match(text, /^COMPANY PROFILE\. Facts the owner entered about this business; use them as they are\./);
  for (const line of [
    'Business name: Sunrise Bakery', 'Legal name: Sunrise Bakery LLC', 'Business type: LLC', 'Industry: SaaS & Consulting',
    'CEO: Ana Rivera', 'Headquarters: 1 Main St, Mountain View, CA 94043, United States', 'Website: sunrisebakery.example',
    'Time zone: America/Los_Angeles', 'Serves: the whole country', 'Currency: USD', 'Financial year starts: January'
  ]) assert.ok(text.includes(line), line);
  assert.match(text, /is in the company knowledge store\.$/);
  assert.doesNotMatch(text, /[–—]/);
  const bare = cp.companyProfileContext({ name: 'Sunrise Bakery' }, {});
  assert.doesNotMatch(bare, /CEO|Website/, 'blank fields are left out');
  assert.equal(cp.companyProfileContext({}, {}), null, 'nothing to say: nothing sent');
});

test('the profile reaches every agent through the hook, once per session and again on change', () => {
  const hooks = read('src/main/hooks.ts');
  assert.match(hooks, /this\.deliveredProfileByAgent\.set\(agentId, \{ sessionId, text \}\);/);
  assert.match(hooks, /if \(fresh \|\| delivered\.text !== text\) \{/);
  assert.match(read('src/main/index.ts'), /return companyProfileContext\(\{ name: cfg\.businessName, industry \}, cleanCompanyProfile\(cfg\.companyProfile\)\);/);
});

test('setup asks for it in two steps, and Settings has a page with a pointer to Memory & Knowledge', () => {
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(wizard, /parts=\{\['essentials'\]\}/);
  assert.match(wizard, /parts=\{\['details', 'hint'\]\}/);
  assert.match(wizard, /return s === 'business' \? 'details'\n    : s === 'details' \? 'team'/);
  assert.match(wizard, /companyProfile: cleanCompanyProfile\(profile\),/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /const NAV_SECTIONS: Section\[\] = \['General', 'Company profile',/);
  assert.match(settings, /onOpenKnowledge=\{\(\) => setActiveSection\('Memory & Knowledge'\)\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.match(en.companyProfile.knowledgeBody, /Product and price lists, your ideal customers, how you sell/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    assert.deepEqual(Object.keys(d.companyProfile).sort(), Object.keys(en.companyProfile).sort(), loc);
    assert.doesNotMatch(JSON.stringify(d.companyProfile), /[–—]/, loc);
  }
});

test('the office record keeps the profile, so setting up again doesn\'t ask twice', () => {
  const rec = loadTs('src/shared/officeRecord.ts');
  const r = rec.officeRecordFromConfig({ onboardingComplete: true, harnessHome: '/h', businessName: 'X', companyProfile: full, businessTeam: [] });
  assert.equal(r.companyProfile.ceo, 'Ana Rivera');
  assert.ok(rec.OFFICE_FIELDS.includes('companyProfile'));
  assert.equal(rec.parseOfficeRecord({ version: 1, team: [], companyProfile: { ceo: 'A' } }).companyProfile.ceo, 'A');
});
