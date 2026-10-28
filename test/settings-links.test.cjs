'use strict';

/**
 * Settings places in agent text become buttons (docs/designs/settings-links-in-replies.md;
 * owner, 2026-10-26: a new owner asked Michael to check their email, was told to go to
 * Settings, Connections and so on, and had no patience to follow the steps). Michael
 * also offers Connect your email, then follows up once a member can read the mailbox.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parsePlace, placeHref, placeWords, placeLinkRule, PLACE_SECTIONS } = loadTs('src/shared/settingsPlaces.ts');
const { spotPlaces, remarkSettingsLinks } = loadTs('src/renderer/src/markdown/remarkSettingsLinks.ts');
const { placeUrlTransform } = loadTs('src/renderer/src/markdown/placeUrl.ts');
const { createMailboxNotes, newlyHeld, mailboxAddedNote, grantNote, GRANT_NOTE_FALLBACK_MS } = loadTs('src/main/mailboxNotes.ts');
const { unheldMailboxesLine } = loadTs('src/shared/agentAccess.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('a dbm: link names only our own places; anything else is words', () => {
  // Value: protects=only real, visible places become buttons; fails_when=an unknown or hidden place parses or a member id carries a path; why_new=new link scheme; seam=none; no_claim=none beyond protects
  assert.deepEqual(parsePlace('dbm:settings/connections/mailboxes'), { kind: 'settings', section: 'Connections', group: 'mailboxes' });
  assert.deepEqual(parsePlace('dbm:settings/connections/mailboxes/add'), { kind: 'settings', section: 'Connections', group: 'mailboxes', add: true });
  assert.deepEqual(parsePlace('DBM:settings/agents'), { kind: 'settings', section: 'Agents' });
  assert.deepEqual(parsePlace('dbm:member/nick/access/email'), { kind: 'member', agentId: 'nick', card: 'email' });
  for (const bad of ['dbm:settings/voice', 'dbm:settings/connections/slack', 'dbm:settings/agents/mailboxes', 'dbm:settings/connections/claude-connectors/add',
    'dbm:settings/nope', 'dbm:member/../x/access/email', 'dbm:member/nick/access', 'dbm:elsewhere', 'https://example.com', '', null])
    assert.equal(parsePlace(bad), null, String(bad));
  for (const href of ['dbm:settings/research-privacy', 'dbm:settings/connections/claude-connectors', 'dbm:settings/connections/mailboxes/add', 'dbm:member/oscar/access/email'])
    assert.equal(placeHref(parsePlace(href)), href, 'round trip');
  assert.equal(placeWords({ kind: 'settings', section: 'Connections', group: 'mailboxes' }), 'Settings, Connections, Mailboxes');
  assert.ok(!Object.values(PLACE_SECTIONS).includes('Voice'), 'Voice is hidden in this build');
});

test('the link filter lets dbm: through and still drops every other unsafe scheme', () => {
  // Value: protects=the one new scheme does not open the door to others; fails_when=the default rules are bypassed; why_new=MarkdownPreview had only the default; seam=none; no_claim=none beyond protects
  assert.equal(placeUrlTransform('dbm:settings/agents'), 'dbm:settings/agents');
  assert.equal(placeUrlTransform('https://example.com/a'), 'https://example.com/a');
  assert.equal(placeUrlTransform('mailto:a@b.co'), 'mailto:a@b.co');
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x'])
    assert.equal(placeUrlTransform(bad), '', bad);
  const md = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(md, /urlTransform=\{placeUrlTransform\}/, 'used for documents and agent text alike');
  // The dbm: check comes before the web and named link branches.
  const a = md.slice(md.indexOf('a: ({ href, children, node }) => {'));
  assert.ok(a.indexOf('parsePlace(h)') < a.indexOf('isExternal(h)'));
});

test('the words Settings, <our section>[, <group>] become the same link; other apps\' paths stay words', async () => {
  // Value: protects=old replies and app cards get buttons without misfiring on HubSpot or hidden sections; fails_when=the guard, longest match or stop rule regresses; why_new=new spotter; seam=none; no_claim=none beyond protects
  const spot = (t) => spotPlaces(t).map((f) => [t.slice(f.start, f.end), placeHref(f.place)]);
  assert.deepEqual(spot('Open Settings, Connections, Mailboxes and choose Fix.'), [['Settings, Connections, Mailboxes', 'dbm:settings/connections/mailboxes']]);
  assert.deepEqual(spot('turn it on in Settings, Connections, Claude connectors, and give it'), [['Settings, Connections, Claude connectors', 'dbm:settings/connections/claude-connectors']]);
  assert.deepEqual(spot('go to Settings > Agents to change it'), [['Settings > Agents', 'dbm:settings/agents']]);
  assert.deepEqual(spot('Settings → Research & privacy'), [['Settings → Research & privacy', 'dbm:settings/research-privacy']]);
  assert.deepEqual(spot('Settings, Connections, Slack'), [['Settings, Connections', 'dbm:settings/connections']], 'stops at the first word not in the table');
  for (const words of ['HubSpot → Settings → Integrations → Private Apps', 'Gmail > Settings > General', 'Settings → Voice', 'Settings, Connectionsss', 'the settings, connections'])
    assert.deepEqual(spot(words), [], words);

  const { unified } = require('unified');
  const remarkParse = require('remark-parse').default;
  const tree = unified().use(remarkParse).use(remarkSettingsLinks).runSync(unified().use(remarkParse).parse(
    'Go to Settings, Connections, Mailboxes. Not `Settings, Agents` in code, nor [Settings, Agents](https://x.example).'));
  const links = [];
  const walk = (n) => { if (n.type === 'link') links.push([n.url, n.children.map((c) => c.value).join('')]); (n.children ?? []).forEach(walk); };
  walk(tree);
  assert.deepEqual(links, [['dbm:settings/connections/mailboxes', 'Settings, Connections, Mailboxes'], ['https://x.example', 'Settings, Agents']], 'code and existing links untouched');
});

test('Michael hears about a new mailbox and a new reader, once each, after the reader can work', () => {
  // Value: protects=the waiting request gets done without the owner asking again, never before the member has mail tools, even across a quit; fails_when=a Sending change notifies, the note fires before the restart, or is lost; why_new=new notes; seam=deps injected (disk, hive, clock); no_claim=Michael's actual follow up (rules as text, live by hand)
  let disk = [];
  let clock = 1_000_000;
  const told = [];
  const running = new Set(['nick']);
  const questions = [{ id: 'q1', text: 'check my emails' }];
  const notes = createMailboxNotes({
    readPending: () => disk, writePending: (l) => { disk = l; }, tell: (s, b) => { told.push({ s, b }); return true; },
    openQuestions: () => questions, isRunning: (id) => running.has(id), nameOf: (id) => id[0].toUpperCase() + id.slice(1),
    now: () => clock, warn: () => {}
  });
  notes.mailboxAdded('office@example.com');
  assert.equal(told.length, 1);
  assert.match(told[0].s, /A mailbox was added: office@example\.com/);
  assert.match(told[0].b, /id q1: check my emails/);
  assert.match(told[0].b, /dbm:member\/<their id>\/access\/email/);

  notes.granted('oscar', 'office@example.com'); // not running: at once
  assert.equal(told.length, 2);
  assert.match(told[1].s, /Oscar can read office@example\.com/);
  assert.match(told[1].b, /has started with it/);

  notes.granted('nick', 'office@example.com'); // running: waits for the restart, on disk
  assert.equal(told.length, 2);
  assert.deepEqual(disk.map((g) => g.agentId), ['nick']);
  notes.sessionStarted('oscar');
  assert.equal(told.length, 2, 'another member starting sends nothing');
  notes.sessionStarted('nick');
  assert.equal(told.length, 3);
  assert.match(told[2].b, /has started with it/);
  assert.deepEqual(disk, []);

  notes.granted('nick', 'sales@example.com');
  clock += GRANT_NOTE_FALLBACK_MS - 1;
  notes.sweep();
  assert.equal(told.length, 3, 'not yet');
  clock += 1;
  notes.sweep();
  assert.equal(told.length, 4, 'the fallback sends it anyway');
  assert.match(told[3].b, /not active with it yet/);
  assert.deepEqual(disk, []);

  // A running member that already has mail tools (a swap) reads it at once: no restart comes (review, 2026-10-27).
  notes.granted('nick', 'billing@example.com', false);
  assert.equal(told.length, 5);
  assert.match(told[4].b, /has started with it/);
  assert.deepEqual(disk, []);

  // Michael not reachable yet (the office not up at start): the note stays for the next sweep (review, 2026-10-27).
  let up = false;
  let held = [{ agentId: 'nick', address: 'late@example.com', at: 0 }];
  const sent = [];
  const later = createMailboxNotes({ readPending: () => held, writePending: (l) => { held = l; }, tell: (s) => { if (!up) return false; sent.push(s); return true; },
    openQuestions: () => [], isRunning: () => true, nameOf: (id) => id, now: () => GRANT_NOTE_FALLBACK_MS, warn: () => {} });
  later.sweep();
  assert.equal(held.length, 1, 'kept when Michael did not get it');
  up = true;
  later.sweep();
  assert.deepEqual(sent, ['nick can read late@example.com']);
  assert.deepEqual(held, []);
  // A file that can't be read is never written over: the new note goes now instead.
  let wrote = false;
  const told2 = [];
  createMailboxNotes({ readPending: () => { throw new SyntaxError('bad json'); }, writePending: () => { wrote = true; }, tell: (s) => { told2.push(s); return true; },
    openQuestions: () => [], isRunning: () => true, nameOf: (id) => id, now: () => 0, warn: () => {} }).granted('nick', 'y@example.com');
  assert.equal(wrote, false);
  assert.equal(told2.length, 1);

  // A failed disk write still tells Michael rather than never.
  const now = [];
  createMailboxNotes({ readPending: () => [], writePending: () => { throw new Error('EACCES'); }, tell: (s) => { now.push(s); return true; },
    openQuestions: () => [], isRunning: () => true, nameOf: (id) => id, now: () => 0, warn: () => {} }).granted('nick', 'x@example.com');
  assert.equal(now.length, 1);

  // Nothing waited on email: the note says to stay silent.
  assert.match(mailboxAddedNote('a@b.co', []).body, /say nothing/);
  assert.match(grantNote('Nick', 'a@b.co', true, []).body, /say nothing/);
  assert.deepEqual(newlyHeld(['mb1'], ['mb1']), [], 'a Sending change alone');
  assert.deepEqual(newlyHeld(['mb1'], ['mb2']), ['mb2'], 'a swap counts');
  assert.deepEqual(newlyHeld(undefined, ['mb1']), ['mb1']);
});

test('the roster names mailboxes nobody reads yet', () => {
  const cfg = {
    mailboxes: [{ id: 'mb1', address: 'office@example.com' }, { id: 'mb2', address: 'sales@example.com' }],
    agentCapabilities: { nick: { email: { enabled: true, mailboxes: ['mb1'] } }, oscar: { email: { enabled: false, mailboxes: ['mb2'] } } }
  };
  assert.match(unheldMailboxesLine(cfg), /^Mailboxes nobody reads yet: sales@example\.com\. Only the owner gives one/);
  assert.equal(unheldMailboxesLine({ ...cfg, mailboxes: [cfg.mailboxes[0]] }), null);
  assert.equal(unheldMailboxesLine({}), null);
  // An archived or deleted reader keeps its settings but reads nothing (review, 2026-10-27).
  assert.match(unheldMailboxesLine(cfg, (id) => id !== 'nick'), /^Mailboxes nobody reads yet: office@example\.com, sales@example\.com\./);
  assert.match(read('src/main/hooks.ts'), /const unheld = unheldMailboxesLine\(cfg, this\.memberPresent\);/);
  assert.match(read('src/main/hooks.ts'), /const unheld = unheldMailboxesLine\(cfg, this\.memberPresent\);\n\s+if \(r && unheld\) \{ r\.full = `\$\{r\.full\}\\n\$\{unheld\}`; r\.layoutKey = `\$\{r\.layoutKey\}\|\$\{unheld\}`; \}/);
});

test('Michael\'s rules: links for places, a query with Connect your email, follow ups, silence', () => {
  // Value: protects=the behavior change the owner approved reaches Michael; fails_when=the rule text drifts or the template is not filled in; why_new=behavior change; seam=none; no_claim=model compliance (hand check)
  const rule = placeLinkRule();
  assert.match(rule, /\[Settings, Connections, Mailboxes\]\(dbm:settings\/connections\/mailboxes\)/);
  assert.match(rule, /Mailboxes \(mailboxes\)/);
  assert.ok(!/Voice/.test(rule));
  const hive = read('src/main/hive.ts');
  assert.equal((hive.match(/' \+ PLACE_LINK_RULE \+ '/g) ?? []).length, 2, 'Ask me and the dock rules both carry it');
  assert.doesNotMatch(hive, /\$\{PLACE_LINK_RULE\}/, 'never left as literal text in a quoted string');
  assert.match(hive, /needs email and no team member can read email \(no mailbox and no mail connector such as Gmail on the roster\)/);
  assert.match(hive, /answer with "act": "query" saying so plainly and end with \[Connect your email\]\(dbm:settings\/connections\/mailboxes\/add\)/);
  assert.match(hive, /say nothing when none waited on email/);
  const main = read('src/main/index.ts');
  assert.match(main, /Open \[Settings, Connections, Mailboxes\]\(dbm:settings\/connections\/mailboxes\) and choose Fix/);
  assert.match(main, /\[Settings, Connections, Claude connectors\]\(dbm:settings\/connections\/claude-connectors\)/);
});

test('wiring: notes on new mailboxes and new readers, delivery on session start, private file reset and copied', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /if \(res\.ok && typeof fixId !== 'string'\) mailboxNotes\.mailboxAdded\(res\.record\.address\);/);
  assert.match(main, /const before = readableMailboxes\(agentId\);[\s\S]{0,200}setAgentCapabilities[\s\S]{0,300}newlyHeld\(before, readableMailboxes\(agentId\)\)/);
  assert.match(main, /hookServer\.onSessionStart = \(agentId\) => mailboxNotes\.sessionStarted\(agentId\);/);
  assert.match(main, /setInterval\(\(\) => mailboxNotes\.sweep\(\), 60_000\)\.unref\(\);/);
  // A compaction or a clear is the same process: the mail tools came with no new start (review, 2026-10-27).
  assert.match(read('src/main/hooks.ts'), /if \(event === 'SessionStart' && agentId && p\.source !== 'compact' && p\.source !== 'clear'\) \{\s+try \{ this\.onSessionStart\?\.\(agentId\); \}/);
  assert.match(main, /if \(address\) mailboxNotes\.granted\(agentId, address, res\.restartNeeded\);/);
  assert.match(read('src/main/factoryReset.ts'), /'mailbox-grant-notes\.json'/);
  assert.match(read('src/main/homeFolder.ts'), /'mailbox-grant-notes\.json', 'organized\.jsonl'/);
});

test('wiring: a button opens Settings at the group or a member\'s Access tab at Email', () => {
  // Value: protects=one click lands on the right place, unfolded and highlighted; fails_when=the payload, seq, anchors or focus requests are dropped; why_new=new deep link fields; seam=none (source checks); no_claim=the scroll itself (hand check)
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /setSettingsPlace\(\(p\) => \(\{ section: d\?\.section, group: d\?\.group, add: d\?\.add, seq: \(p\?\.seq \?\? 0\) \+ 1 \}\)\);/);
  assert.match(app, /place=\{settingsPlace\}/);
  const modal = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(modal, /\}, \[place\?\.seq\]\);/, 'a new request moves an open Settings');
  assert.match(modal, /<div data-settings-group="claude-connectors"/);
  assert.match(modal, /<div data-settings-group="mailboxes"[^>]*>\s+<MailboxesSettings focus=\{groupFocus\?\.group === 'mailboxes' \? groupFocus : undefined\} \/>/);
  // The owner's own section switch ends the place: coming back never reopens Add a mailbox or highlights again (review, 2026-10-27).
  assert.match(modal, /onClick=\{\(\) => \{ setActiveSection\(section\); setGroupFocus\(null\); \}\}/);
  assert.match(modal, /classList\.add\('cth-place-highlight'\)/);
  const mail = read('src/renderer/src/components/MailboxesSettings.tsx');
  assert.match(mail, /setOpen\(true\);\s+if \(focus\.add\) setDialog\(\{\}\);/);
  assert.match(read('src/renderer/src/store/store.ts'), /ccTabRequest: \{ tab: 'capabilities', seq \},\s+emailRequest:/);
  const caps = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.match(caps, /setCollapsed\(\(c\) => \(\{ \.\.\.c, email: false \}\)\);/);
  assert.match(caps, /<div ref=\{emailRef\} data-email-group/);
  assert.match(read('src/renderer/src/markdown/PlaceChip.tsx'), /useStore\.getState\(\)\.openAgentEmail\(place\.agentId\)/);
  assert.match(read('src/renderer/src/components/FileChip.tsx'), /fileChip=\{paths\.length \? fileChip : undefined\} placeLinks \/>/, 'agent text spots words; documents do not');
  for (const loc of ['en', 'ar', 'zh-CN']) assert.ok(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).markdown.openPlace.includes('{{place}}'), loc);
});
