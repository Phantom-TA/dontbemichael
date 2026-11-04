'use strict';

/**
 * House rules (owner, 2026-09-25): no agent, Michael included, makes up
 * information. They ride the system prompt every agent gets, identical for all.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager, HOUSE_RULES, CHANGES_COME_BACK_HOUSE_RULE, michaelInstructions } = loadTs('src/main/hive.ts');

const promptOf = (inj) => inj.args[inj.args.indexOf('--append-system-prompt') + 1];

test('Michael and every team member get the same house rules', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-rules-'));
  const hive = new HiveManager(() => home);
  const god = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  const oscar = promptOf(await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home, role: 'Finance' }));
  assert.ok(god.includes(HOUSE_RULES), 'Michael');
  assert.ok(oscar.includes(HOUSE_RULES), 'a team member');
});

test('the rules cover sources, not knowing, estimates, honest reports and real people', () => {
  assert.match(HOUSE_RULES, /State only facts you can trace to a source/);
  assert.match(HOUSE_RULES, /When you don't know or can't find something, say so/);
  assert.match(HOUSE_RULES, /Mark estimates and assumptions/);
  assert.match(HOUSE_RULES, /Call work finished only when it is/);
  assert.match(HOUSE_RULES, /Make up an example only when the owner asks for a sample/);
});

// 2026-10-02: Pam's work style said delete handled mail; her mail tools cannot,
// so she read a cold pitch, left it unread and said nothing about it.
test('every agent reports what its tools cannot do instead of skipping it, and the mail tools say their limits', () => {
  // Value: protects=an instruction the tools cannot carry out reaches Michael or the owner instead of vanishing; fails_when=rule 6 is dropped or the mail tools stop naming what they cannot do; why_new=no rule covered a missing tool; seam=none
  assert.match(HOUSE_RULES, /6\. When your instructions or a request ask for something your tools cannot do/);
  assert.match(HOUSE_RULES, /A team member tells Michael; Michael tells the owner on the Ask me board\./);
  assert.match(HOUSE_RULES, /Do not work around a missing or refused tool\./);
  const mail = fs.readFileSync(path.resolve(__dirname, '..', 'resources/md-mail-mcp.cjs'), 'utf8');
  assert.match(mail, /They never delete mail: if you are asked to delete, report it \(house rule 6\)\./);
});

// 2026-10-11: an IT report for the owner opened with a Sources list of tool
// names, mail folders, a settings file and UTC; the owner could not use it.
test('anything the owner reads, files included, is in plain business words', () => {
  // Value: protects=owner reports and files carry no tool, folder or method talk; fails_when=rule 7 is dropped or rule 1 asks for file names again; why_new=no rule covered files the owner opens; seam=none
  assert.match(HOUSE_RULES, /7\. Write anything the owner reads, reports and files included, in plain business words/);
  assert.match(HOUSE_RULES, /Leave out tool names, folder and file names, settings files, message ids, time zones and how you went about the work/);
  assert.match(HOUSE_RULES, /name the source in words the owner knows/);
  assert.doesNotMatch(HOUSE_RULES, /\(a file name, a link/);
});

test('written calmly: no dashes, no shouting, no dates that would break the prompt cache', () => {
  assert.doesNotMatch(HOUSE_RULES, /[–—]/);
  assert.doesNotMatch(HOUSE_RULES.replace(/^HOUSE RULES\./, ''), /\b(MUST|NEVER|ALWAYS|CRITICAL)\b/);
  assert.doesNotMatch(HOUSE_RULES, /\b20\d\d\b/);
});

// 2026-10-11: Michael parked a card in Waiting as "Waiting on Dwight, sends
// Mon 12 Oct 13:00 to 15:00 UTC": Dwight's own step at a set time.
test('a card never waits on its own person; its own step at a set time is todo', () => {
  // Value: protects=the board says who else holds a card, and parked own work sits in To do with the time; fails_when=rule 8 or the board wording drops it; why_new=waiting had no word for the card's own person; seam=none
  assert.match(HOUSE_RULES, /8\. On the task board, "waiting" names who else a card waits on, never the card's own person\./);
  assert.match(HOUSE_RULES, /the card is "todo", with "nextAt" set to that time as an ISO date and time with its offset; the app shows it in the owner's local time\./);
  assert.match(HOUSE_RULES, /Cards carry no running "notes": what you did is already kept in your own conversation and the office log, and what you keep for good goes in your memory\./);
  // 2026-10-11: Erin read rule 8 as covering her scheduled inbox checks and
  // reopened her done card; routines live in Schedules and done stays done.
  assert.match(HOUSE_RULES, /When a card's one off next step is its own person's at a set time/);
  assert.match(HOUSE_RULES, /A routine that repeats on a schedule needs no card to track it: its runs live in Schedules\. What a run produces for the owner still goes on Ask me as a report card\. A done card stays done: only the owner reopens one, to correct a card marked done by mistake\./);
  assert.equal((fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8').match(/scheduled routines get no card/g) || []).length, 3, 'Michael\'s two board texts and the protocol');
  const hive = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.equal((hive.match(/never the card\\'s own person/g) || []).length, 4, 'rule 8, Michael\'s two board texts and the protocol');
});

// 2026-10-11: Nick resumed his conversation with rule 7 in his instructions,
// was asked to extend his earlier report, and copied its Sources list anyway.
test('a resumed agent is told the house rules that changed, once; a fresh one is not', async (t) => {
  // Value: protects=a new or reworded rule reaches agents that resume an old conversation; fails_when=the note never sends, repeats every start, or goes to a fresh conversation; why_new=rules only rode the start instructions; seam=none
  const N = loadTs('src/shared/houseRulesNotice.ts');
  assert.match(HOUSE_RULES, /When you extend or update an earlier file, rewrite its parts that break this rule\./);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-rules-notice-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'nick', name: 'Nick', provider: 'claude', cwd: home, role: 'IT' });
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home, role: 'Finance' });
  const inbox = (id) => fs.readdirSync(path.join(hive.root(), 'agents', id, 'inbox')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(hive.root(), 'agents', id, 'inbox', f), 'utf8')))
    .filter((m) => m.subject === N.HOUSE_RULES_CHANGED_SUBJECT);
  // Every office's rules, rule 9 (owner, ship 2 D16) and rule 10 (CEO review D1 A, 2026-11-04) included.
  const all = N.houseRuleLines(hive.houseRules());
  assert.equal(all.length, 10);

  assert.deepEqual(hive.tellHouseRules('oscar', false), [], 'a fresh conversation reads them in its instructions');
  assert.equal(inbox('oscar').length, 0);
  assert.deepEqual(hive.tellHouseRules('nick', true), all, 'a resumed one with no record hears every rule once');
  assert.equal(inbox('nick').length, 1);
  assert.match(inbox('nick')[0].body, /including a file you extend or update/);
  assert.doesNotMatch(inbox('nick')[0].body, /[–—]/);
  assert.deepEqual(hive.tellHouseRules('nick', true), [], 'not again while nothing changed');
  assert.equal(inbox('nick').length, 1);

  // A rule reworded since Nick last started: only that one is told.
  const seenFile = path.join(home, 'private', 'house-rules-seen.json');
  const seen = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
  // Value (extension): protects=the record is the rule's own wording, so any rewording counts; fails_when=a short key collides or is kept; why_new=review D10; seam=none
  assert.deepEqual(seen.nick, all, 'each rule is remembered by its wording');
  seen.nick = seen.nick.filter((k) => k !== all[6]);
  fs.writeFileSync(seenFile, JSON.stringify(seen));
  assert.deepEqual(hive.tellHouseRules('nick', true), [all[6]]);
  assert.equal(inbox('nick').length, 2);
  assert.deepEqual(hive.tellHouseRules('oscar', true), [], 'oscar was recorded at his fresh start');
  // Value (extension): protects=a note that never reached the inbox is sent again at the next start; fails_when=the rules are recorded as seen before delivery; why_new=review D9; seam=a missing inbox folder makes delivery fail
  const now = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
  now.nick = now.nick.filter((k) => k !== all[2]);
  fs.writeFileSync(seenFile, JSON.stringify(now));
  const nickInbox = path.join(hive.root(), 'agents', 'nick', 'inbox');
  fs.renameSync(nickInbox, `${nickInbox}.away`);
  assert.deepEqual(hive.tellHouseRules('nick', true), [], 'nothing was delivered');
  fs.renameSync(`${nickInbox}.away`, nickInbox);
  assert.deepEqual(hive.tellHouseRules('nick', true), [all[2]], 'told at the next start');
  // Value (extension): protects=every hive agent start runs the check with its real resume flag, and the prep assistant is left out; fails_when=the spawn hook is dropped, passes a fixed flag, or the assistant gets the note; why_new=tellHouseRules was only called directly; seam=source pin for the spawn hook
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8'),
    /if \(res\.ok && opts\.hive\?\.id && hive\.enabled\(\)\) \{\n\s*try \{ hive\.tellHouseRules\(opts\.hive\.id, didResume\); \}/);
  await hive.ensureAgent({ id: 'prep', name: 'Prep', provider: 'claude', cwd: home, isAssistant: true });
  assert.deepEqual(hive.tellHouseRules('prep', true), [], 'the prep assistant writes prompts, not owner work');
  assert.deepEqual(hive.tellHouseRules('nobody', true), [], 'an unknown id is skipped');
});

// 2026-10-11 (card-lifecycle.md section 10): a card is one activity's needs.
// Ship review D8: team members write a filing once; Michael alone writes the board.
test('team members file once in the triage folder, Michael alone writes the board, bundles and re-asks, and done stays done', () => {
  // Value: protects=the owner's card model and the single writer reach every agent; fails_when=a prompt drops the triage folder, write once, the numbered bundle, the split by who answers, the partial re-ask, the done rule, or still lets a team member write tasks.json; why_new=owner decisions 2026-10-11 and review D8; seam=prompt text
  const hive = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.match(hive, /file it for \$\{michael\} as one new file in the triage folder \(\$\{join\(p\.hiveRoot, 'triage'\)\}\), named by the time you file it and your id/, 'team member files');
  assert.match(hive, /Put all the questions one activity raised for the owner in one ask, one question to a line with any choices you would offer, and merge the ones that ask the same thing\./);
  assert.match(hive, /file a second one naming them in "waitingOn"\./, 'split by who answers');
  assert.match(hive, /Write each filing once and never change it\./);
  assert.match(hive, /You never write tasks\.json, your own cards included: when your work moves, such as finished, waiting on someone, or due again at a set time, tell \$\{michael\} and he moves its card\./);
  assert.match(hive, /'## Triage',\n\s*'You alone write the task board \(tasks\.json\)\./, 'Michael triages and is the only writer');
  assert.match(hive, /Each turn you see the filings waiting, oldest first; at the start of a session, list the folder yourself too: work them in that order, one at a time, against the board as it stands\./);
  assert.match(hive, /Then move the file to triage\/\.done\./);
  assert.match(hive, /You alone write tasks\.json and board\.md/);
  assert.match(hive, /Only Michael writes \\`tasks\.json\\` and \\`board\.md\\`/, 'the protocol');
  assert.doesNotMatch(hive, /Keep your own card's status current/);
  assert.doesNotMatch(hive, /file a card yourself in tasks\.json/);
  assert.match(hive, /the questions one activity raised go in that ask\\'s "parts", answered together/);
  assert.match(hive, /Questions from a different activity get a card of their own, never a parked note\./);
  // The owner never has to answer every question (ask-me-options.md, eng review D1).
  assert.match(hive, /when the answer leaves any unanswered, send those questions to the team member who raised them with the answers; they settle what they can and file back only what they still need, and you ask the owner again only then\./);
  // No instruction is left telling anyone to write an ask as a list (owner, 2026-10-15).
  assert.doesNotMatch(hive, /numbered list|numbered options|"1\." number|bullet or/);
  assert.match(hive, /Only the owner takes a card out of Done, to correct one marked done by mistake/);
  assert.doesNotMatch(hive, /never add a different question to a card that already has one open/);
});

// Owner, 2026-11-04 (docs/designs/ask-me-changes-come-back.md): Dwight's card
// offered "Send with my changes", copied from Michael's own example, and Dwight
// may send without asking, so the changed email would have gone out unseen.
test('a change the owner asks for comes back before it goes, for Michael and every member', async () => {
  // Value: protects=the owner sees a changed email, post or quote before it leaves; fails_when=rule 10 is missing from a prompt or a resumed member is never told; why_new=CEO review D1 A; seam=none
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-rules-back-'));
  const hive = new HiveManager(() => home);
  const god = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  const dwight = promptOf(await hive.ensureAgent({ id: 'dwight', name: 'Dwight', provider: 'claude', cwd: home, role: 'Sales' }));
  for (const [who, p] of [['Michael', god], ['a team member', dwight]]) assert.ok(p.includes(CHANGES_COME_BACK_HOUSE_RULE), who);
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /^10\. /);
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /the owner sees the changed version before it goes/);
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /on Send on approval, your new proposal is that look/, 'the app email card is the look, not a second card (D2 A)');
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /A yes covers only the version the owner saw/);
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /names a new time/);
  assert.match(CHANGES_COME_BACK_HOUSE_RULE, /only when the owner says so in their own words/);
  assert.doesNotMatch(CHANGES_COME_BACK_HOUSE_RULE, /[\u2013\u2014]| - /);
  assert.doesNotMatch(CHANGES_COME_BACK_HOUSE_RULE, /\b(MUST|NEVER|ALWAYS|CRITICAL)\b/);
});

test("Michael's change option says the new version comes back, never that it goes out", () => {
  // Value: protects=Michael copies his example label onto live cards; fails_when=the example says it sends with the changes; why_new=the live card copied the old example word for word; seam=none
  const paths = { inbox: 'i', inboxDone: 'd', outbox: 'o', protocol: 'p', hiveRoot: 'h' };
  const text = michaelInstructions('Michael', { name: 'Northwind Cafe', city: 'Austin' }, paths);
  assert.match(text, /\{"label": "Change it, show me again", "note": "What should change\?"\}/);
  assert.doesNotMatch(text, /Send with my changes/);
  assert.match(text, /never that it goes out with the changes \(house rule 10\)/);
  assert.match(text, /route any answer asking for changes the same way, on older cards too/);
});
