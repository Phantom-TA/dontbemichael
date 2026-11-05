'use strict';

// A team folder named on a card opens from the card: the app spots "the Sales
// folder" in the words, so a card written before this works too, and no path
// from agent text is ever used (owner, eng review D1 and D2, 2026-10-31).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { folderParts, folderTeam, remarkFolderChips } = loadTs('src/renderer/src/markdown/remarkFolderChips.ts');

const ROOT = path.resolve(__dirname, '..');
const TEAM = [
  { id: 'dwight', name: 'Dwight', folder: 'Sales' },
  { id: 'meredith-1', name: 'Meredith', folder: 'Supply Chain' },
  { id: 'pam', name: 'Pam', folder: 'Admin' },
  { id: 'erin-1', name: 'Erin', folder: 'Admin_Erin' }
];

const chips = (text, team = TEAM) => folderParts(text, team).filter((p) => 'words' in p);

test('a team folder named on a card becomes a chip, in the words the card used', () => {
  // Value: protects=the owner opens the folder a card names; fails_when=the phrase is not matched; why_new=no folder chip existed; seam=none; no_claim=a real Finder window
  const text = "Please save Ellah's attachment into the Sales folder so Dwight can review it before the call.";
  assert.deepEqual(folderParts(text, TEAM), [
    { text: "Please save Ellah's attachment into the " },
    { words: 'Sales folder', agentId: 'dwight' },
    { text: ' so Dwight can review it before the call.' }
  ]);
  for (const [said, id] of [
    ['put it in the sales FOLDER.', 'dwight'],
    ["Drop it in Dwight's folder", 'dwight'],
    ['Drop it in Dwight\u2019s folder', 'dwight'],
    ['into the Supply Chain folder', 'meredith-1'],
    ['into the Supply  Chain   folder', 'meredith-1'],
    ['(Sales folder)', 'dwight']
  ]) assert.equal(chips(said)[0]?.agentId, id, said);
});

test('words that only contain a name are not a match', () => {
  // Value: protects=one folder name is not mistaken for another; fails_when=matching stops being whole words; why_new=office folders share prefixes; seam=none; no_claim=none beyond protects
  assert.equal(chips('Use the Admin_Erin folder')[0].agentId, 'erin-1');
  assert.equal(chips('Use the Admin folder')[0].agentId, 'pam');
  assert.deepEqual(chips('the Presales folder'), []);
  assert.deepEqual(chips('the Sales-team folder'), []);
  assert.deepEqual(chips('the Sales folders'), []);
  assert.deepEqual(chips('the Sales report'), []);
  assert.deepEqual(chips('the Finance folder'), [], 'not a team folder');
});

test('a sentence about a mailbox stays words, unless it is about an attachment', () => {
  // Value: protects=a mail label is never linked to a folder on disk; fails_when=the sentence guard goes or swallows attachments; why_new=mail tools call labels folders; seam=none; no_claim=a mail label named with no mail word
  for (const said of [
    'I archived three into the Sales folder.',
    'It is in the Sales folder in your inbox.',
    'Look in the Sales folder in Gmail',
    'The Sales folder label in the mailbox.'
  ]) assert.deepEqual(chips(said), [], said);
  assert.equal(chips("Save the attachment from Ellah's email into the Sales folder.").length, 1);
  assert.equal(chips('It is in your inbox. Please use the Sales folder.').length, 1, 'only its own sentence counts');
});

test('a name with pattern characters is compared as written', () => {
  // Value: protects=an owner's folder name cannot break matching; fails_when=names are used as a pattern; why_new=folder names are free text; seam=none; no_claim=none beyond protects
  const team = [{ id: 'a', name: 'A.J.', folder: 'R&D (new)' }];
  assert.equal(chips('the R&D (new) folder', team)[0].agentId, 'a');
  assert.equal(chips("A.J.'s folder", team)[0].agentId, 'a');
  assert.deepEqual(chips("AxJx's folder", team), []);
});

test('no team or no folder leaves the text as it is', () => {
  // Value: protects=a card with nothing to link draws as before; fails_when=empty names match; why_new=new pass runs on every card; seam=none; no_claim=none beyond protects
  assert.deepEqual(folderParts('the Sales folder', []), [{ text: 'the Sales folder' }]);
  assert.deepEqual(folderParts('', TEAM), [{ text: '' }]);
  assert.deepEqual(chips(' folder', [{ id: 'a', name: '', folder: '' }]), []);
});

test('the team comes from where each member works, without Research', () => {
  // Value: protects=later hires are named and Research is not; fails_when=the list reads only the setup team or keeps Research; why_new=D2; seam=none; no_claim=none beyond protects
  assert.deepEqual(folderTeam([
    { id: 'dwight', name: 'Dwight', cwd: '/Users/o/Dropbox/office/Sales/' },
    { id: 'erin-1', name: ' Erin ', cwd: 'C:\\office\\Admin_Erin' },
    { id: 'research', name: 'Pete', cwd: '/Users/o/research-desk' },
    { id: 'x' }
  ]), [
    { id: 'dwight', name: 'Dwight', folder: 'Sales' },
    { id: 'erin-1', name: 'Erin', folder: 'Admin_Erin' },
    { id: 'x', name: '', folder: '' }
  ]);
});

test('the pass changes text only: code and links keep their words', () => {
  // Value: protects=a button never lands in a link or in code; fails_when=the walk enters them; why_new=new pass; seam=none; no_claim=remark's own parsing
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [
    { type: 'text', value: 'Use the Sales folder or ' },
    { type: 'inlineCode', value: 'the Sales folder' },
    { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: 'the Sales folder' }] },
    { type: 'strong', children: [{ type: 'text', value: 'the Sales folder' }] }
  ] }, { type: 'code', value: 'the Sales folder' }] };
  remarkFolderChips({ team: TEAM })(tree);
  const para = tree.children[0].children;
  const chip = para.find((n) => n.data?.hName === 'cth-folder');
  assert.deepEqual(chip, { type: 'inlineCode', value: 'Sales folder', data: { hName: 'cth-folder', hProperties: { dataAgent: 'dwight' } } });
  assert.deepEqual(para.find((n) => n.type === 'link').children, [{ type: 'text', value: 'the Sales folder' }]);
  assert.equal(para.find((n) => n.type === 'strong').children[1].data.hName, 'cth-folder', 'bold text is still text');
  assert.equal(tree.children[1].value, 'the Sales folder');
});

test('the chip carries a member id and opens through the owner\'s Open folder, never a path', () => {
  // Value: protects=agent text cannot choose a path to open, owner D12; fails_when=the chip takes a path or a link form an agent can write; why_new=the chip is a new way to reach shell.openPath; seam=source; no_claim=main's own rules, covered with the Profile tab
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const chip = read('src/renderer/src/markdown/FolderChip.tsx');
  assert.match(chip, /window\.cth\.openAgentFolder\(agentId\)/);
  assert.doesNotMatch(chip, /revealPath|openExternal|openAskFile/);
  const preview = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(preview, /'cth-folder': /);
  assert.doesNotMatch(read('src/shared/settingsPlaces.ts'), /folder/i, 'no dbm: form for agent text to write');
  assert.match(read('src/renderer/src/components/FileChip.tsx'), /placeLinks folderTeam=\{team\}/);
  // Before the soft breaks, or their split text would hide words across a line.
  assert.match(preview, /\[\.\.\.basePlugins\.slice\(0, -1\), folders, last\]/);
});
