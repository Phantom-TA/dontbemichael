'use strict';

/**
 * "Explain how they split it" (overlap split plan, CEO and eng reviews
 * 2026-10-24): when the overlap check stops a job change, the owner says how
 * the two members split the work; the rewrite returns handoffs, main writes
 * them as "Not for X; that goes to Name." lines before the check runs again,
 * the check's change mode reads them, and the member keeps a handoff list
 * that Undo, delete and the teammate's read-only line follow.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const ptyPath = require.resolve('node-pty');
require.cache[ptyPath] = { id: ptyPath, filename: ptyPath, loaded: true, exports: { spawn() { throw new Error('no real pty in tests'); } } };
const HM = loadTs('src/main/hiddenModel.ts');
const W = loadTs('src/main/workStyleConvert.ts');
const T = loadTs('src/shared/workStyleText.ts');
const J = loadTs('src/shared/jobChange.ts');
const H = loadTs('src/shared/hireTemplates.ts');
const C = loadTs('src/main/hireCheck.ts');
const run = HM.runHiddenModel;
test.after(() => { HM.runHiddenModel = run; });

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ctx = { name: 'Kelly', title: 'Customer Support', business: { name: 'Sunrise Bakery' }, manager: 'Michael' };
const deps = { engine: 'claude', command: 'claude', cwd: os.tmpdir() };
const opening = T.instructionsOpening(ctx.business);
const NICK = 'Not for technical questions; that goes to Nick.';
const okReply = (o = {}) => JSON.stringify({
  kind: 'ok',
  instructions: `${opening}\n\n### The job\nAnswer customers and run client projects.`,
  plain: 'The job: Answers customers and runs client projects.',
  handles: 'Answers customers and runs client projects after a sale. Send here for customer questions and project status.',
  summary: ['Kelly will now run client projects.'],
  oneTimeTask: null,
  ...o
});
function stub(reply) {
  const calls = [];
  HM.runHiddenModel = async (prompt, opts) => { calls.push({ prompt, opts }); return reply; };
  return calls;
}
const nick = { id: 'nick', name: 'Nick', title: 'IT Engineer' };

test('a scope is cleaned for a role line, or refused when it would read as another binding', () => {
  // Value: protects=a model scope can't break splitBindings or add a dash; fails_when=a scope with "Only " or "that goes to" or a trailing period reaches the line; why_new=spec review 2 scope cleaning; seam=none
  assert.equal(J.cleanHandoffScope(' Technical questions. '), 'Technical questions');
  assert.equal(J.cleanHandoffScope('Not for technical questions'), 'technical questions');
  assert.equal(J.cleanHandoffScope('bugs — outages'), 'bugs, outages');
  assert.equal(J.cleanHandoffScope('follow-up questions'), 'follow-up questions', 'a hyphen inside a word stays');
  assert.equal(J.cleanHandoffScope('refunds; returns'), '');
  assert.equal(J.cleanHandoffScope('bugs that goes to Nick'), '');
  assert.equal(J.cleanHandoffScope('bugs and Only outages'), '');
  assert.equal(J.cleanHandoffScope('questions only about billing'), 'questions only about billing');
  assert.equal(J.cleanHandoffScope(7), '');
  assert.ok(J.cleanHandoffScope('word '.repeat(60)).length <= J.HANDOFF_SCOPE_MAX);
});

test('the rewrite prompt carries the split, the teammates and the live handoffs only when they apply', () => {
  // Value: protects=the model sees the split and the ids it may name, and a pack replay or a plain change sees none of it; fails_when=the split blocks show without teammates, or the home rule shows without askHome; why_new=T2; seam=none
  const base = { ctx, instructions: `${opening}\n\nAnswer customers.`, handles: 'Answers customers.', changes: ['Kelly also runs client projects.'] };
  const plain = T.toRevisePrompt(base);
  assert.doesNotMatch(plain, /"handoffs"|"drops"|TEAMMATES|Shape 3/);
  assert.match(plain, /in one of two shapes/);
  const split = T.toRevisePrompt({ ...base, explanation: 'Nick answers technical questions; Kelly passes them on.', teammates: [nick] });
  assert.match(split, /"handoffs": \[\{"to": "\.\.\.", "scope": "\.\.\."\}\]/);
  assert.match(split, /--- HOW THE OWNER SAYS THE WORK SPLITS \(apply it with the changes\) ---\nNick answers technical questions; Kelly passes them on\./);
  assert.match(split, /id "nick": Nick, IT Engineer/);
  assert.doesNotMatch(T.toRevisePrompt({ ...base, explanation: 'x' }), /TEAMMATES/, 'no teammates, no split');
  const sent = T.toRevisePrompt({ ...base, handoffList: [{ toId: 'nick', scope: 'technical questions', toTitle: 'IT Engineer' }] });
  assert.match(sent, /"drops": \[1\]/);
  assert.match(sent, /--- WORK KELLY SENDS TO TEAMMATES NOW ---\n1\. technical questions, to the IT Engineer/);
  const home = T.toRevisePrompt({ ...base, askHome: true });
  assert.match(home, /in one of three shapes/);
  assert.match(home, /Shape 3, where tracked numbers live: \{"kind": "home", "question": "Where should Kelly keep \.\.\.\?"\}/);
  assert.doesNotMatch(T.toRevisePrompt({ ...base, askHome: true, lead: true }), /Shape 3/, 'Michael is never asked');
  const two = T.toRevisePrompt({ ...base, answers: [{ question: 'Keep approvals?', answer: 'Yes' }, { question: 'Where should Kelly keep project hours?', answer: "A sheet in Kelly's folder" }] });
  assert.match(two, /THE OWNER ANSWERED YOUR QUESTIONS; APPLY THE ANSWERS AND DO NOT ASK AGAIN ---\nQuestion: Keep approvals\?\nAnswer: Yes\nQuestion: Where should Kelly keep project hours\?\nAnswer: A sheet in Kelly's folder/);
  assert.match(T.toRevisePrompt({ ...base, answer: { question: 'Q?', answer: 'A' } }), /YOUR QUESTION; APPLY THE ANSWER/, 'the one answer form still works');
});

test('a parse keeps handoffs only to named teammates, drops by number, and a home question only when asked', () => {
  // Value: protects=validation of every model field (spec review 2, eng); fails_when=a handoff names someone the check never named, a drop index is out of range, or home is read on a replay; why_new=T2; seam=none
  const opts = { teammates: [nick, { id: 'erin', name: 'Erin' }], handoffList: [{ toId: 'erin', scope: 'refunds' }] };
  const ok = T.parseRevise(okReply({
    handoffs: [{ to: 'nick', scope: 'technical questions.' }, { to: 'nick', scope: 'Technical questions' }, { to: 'oscar', scope: 'invoices' }, { to: 'nick', scope: 'x; y' }, 'junk'],
    drops: [1, 5, 'two', 1.5]
  }), ctx, false, opts);
  assert.deepEqual(ok.handoffs, [{ toId: 'nick', scope: 'technical questions' }]);
  assert.deepEqual(ok.drops, [{ toId: 'erin', scope: 'refunds' }]);
  const none = T.parseRevise(okReply({ handoffs: [{ to: 'nick', scope: 'bugs' }] }), ctx, false, {});
  assert.equal(none.handoffs, undefined, 'a replay names no teammates, so nothing is kept');
  assert.equal(T.parseRevise(okReply({ handoffs: [{ to: 'nick', scope: 'bugs' }] }), ctx, true, opts).handoffs, undefined, 'Michael hands nothing on');
  const home = JSON.stringify({ kind: 'home', question: 'Where should Kelly keep project hours and milestones?' });
  assert.deepEqual(T.parseRevise(home, ctx, false, { askHome: true }), { kind: 'home', question: 'Where should Kelly keep project hours and milestones?' });
  assert.equal(T.parseRevise(home, ctx, false, {}), null, 'not asked for: unreadable');
});

test('main writes handoff lines into the role line before the check, and takes back only the dropped ones', async () => {
  // Value: protects=eng SC1: the check and the preview see the lines; fails_when=lines are added only at Apply, a drop removes a hire binding, or a null handles loses the lines; why_new=T2; seam=stubbed hidden model; no_claim=the real model's handoffs (eval)
  const req = (o = {}) => W.readReviseRequest({
    to: 'revise', ctx, current: { instructions: `${opening}\n\nAnswer customers.`, handles: 'Answers customers. Only the support inbox. Not for refunds; that goes to Erin.' },
    changes: ['Kelly also runs client projects.'], explanation: 'Nick answers technical questions; Kelly passes them on.', teammates: [nick], ...o
  });
  stub({ ok: true, text: okReply({ handoffs: [{ to: 'nick', scope: 'technical questions' }] }) });
  const added = await W.reviseWorkStyle(req(), deps);
  assert.equal(added.handles, `Answers customers and runs client projects after a sale. Send here for customer questions and project status. Only the support inbox. Not for refunds; that goes to Erin. ${NICK}`);
  assert.deepEqual(added.handoffs, [{ toId: 'nick', scope: 'technical questions' }]);

  stub({ ok: true, text: okReply({ handles: null, handoffs: [{ to: 'nick', scope: 'technical questions' }] }) });
  const kept = await W.reviseWorkStyle(req(), deps);
  assert.equal(kept.handles, `Answers customers. Only the support inbox. Not for refunds; that goes to Erin. ${NICK}`, 'no new duties: the current line carries the handoff');

  const withNick = { handles: `Answers customers. Only the support inbox. Not for refunds; that goes to Erin. ${NICK}` };
  const list = [{ toId: 'nick', scope: 'technical questions', line: NICK, toTitle: 'IT Engineer' }];
  stub({ ok: true, text: okReply({ handles: null, drops: [1] }) });
  const dropped = await W.reviseWorkStyle(req({ current: { instructions: 'x', ...withNick }, explanation: undefined, teammates: undefined, handoffList: list }), deps);
  assert.equal(dropped.handles, 'Answers customers. Only the support inbox. Not for refunds; that goes to Erin.', 'the hire binding stays');
  assert.deepEqual(dropped.drops, [{ toId: 'nick', scope: 'technical questions' }]);

  stub({ ok: true, text: okReply({ handles: null }) });
  assert.equal((await W.reviseWorkStyle(req({ explanation: undefined, teammates: undefined }), deps)).handles, null, 'no handoffs, no duties: unchanged as before');

  const forged = W.readReviseRequest({ to: 'revise', ctx, current: { instructions: 'x', handles: 'y' }, changes: ['z'], handoffList: [{ toId: 'erin', scope: 'refunds', line: 'Answers customers.' }] });
  assert.equal(forged.handoffList, undefined, 'only a real "Not for ...; that goes to ..." sentence can be dropped');
  assert.equal(W.readReviseRequest({ to: 'revise', ctx, current: { instructions: 'x', handles: 'y' }, changes: ['z'], askHome: 'yes' }).askHome, undefined);
});

test('the check in change mode reads handoffs; the hire wizard\'s check is unchanged', () => {
  // Value: protects=A1 (a handoff is distinct) and the deferred wizard's prompt; fails_when=change mode drops the handoff sentence or the lines first, or hire mode changes; why_new=T3; seam=none; no_claim=the model's verdict (eval)
  const kelly = { name: 'Kelly', title: 'Customer Support', routing: `Answers customers and runs projects. ${NICK}`, workStyle: 'Send technical questions to the IT Engineer.' };
  const team = [{ name: 'Nick', title: 'IT Engineer', routing: 'Answers technical questions for customers. Send here for technical questions.', workStyle: 'x' }];
  const hire = H.distinctPrompt(kelly, team);
  assert.equal(H.distinctPrompt(kelly, team, 'hire'), hire);
  assert.match(hire, /^You check whether a new team member's job overlaps anyone already/);
  assert.match(hire, /"suggestion": "one short way to make the new job particular, or empty"/);
  assert.doesNotMatch(hire, /that goes to Name/);
  const change = H.distinctPrompt(kelly, team, 'change');
  assert.match(change, /A line "Not for X; that goes to Name\." means the member sends X on to Name and does not do it: that part is not an overlap with Name\./);
  assert.match(change, /The changed job, Kelly:\ntitle "Customer Support"; what to send: "Not for technical questions; that goes to Nick\. Answers customers and runs projects\."/, 'handoff lines first, so the clip keeps them');
  assert.match(change, /"suggestion": "one short sentence on how the work could split between Kelly and them/);
  assert.equal(C.readDistinctMode('change'), 'change');
  assert.equal(C.readDistinctMode('anything'), 'hire');
});

test('the rules leave out the lines between the two, and still compare the rest', () => {
  // Value: protects=a handoff never reads as an overlap, and one can't pass a whole job; fails_when=the strip is gone or strips more than the "goes to" lines; why_new=A1 rules exemption; seam=none
  const nickLine = { name: 'Nick', title: 'IT', routing: 'Answers technical questions and fixes bugs. Send here for technical questions.', workStyle: '' };
  // The handoff names Nick's own work, so its words alone read as a copy.
  const handoff = { name: 'Kelly', title: 'Support', routing: 'Runs projects. Not for answers to technical questions, bugs and fixes; that goes to Nick.', workStyle: '' };
  assert.ok(H.lineSimilarity(handoff.routing.replace('Nick', ' '), nickLine.routing) >= H.SIMILAR_LINES, 'without the strip this is an overlap');
  assert.deepEqual(H.overlapsByRules(handoff, [nickLine]), []);
  const back = { ...nickLine, routing: `${nickLine.routing.replace('Answers technical questions and fixes bugs.', 'Runs the servers.')} Not for answers to technical questions, bugs and fixes; that goes to Kelly.` };
  assert.deepEqual(H.overlapsByRules({ ...handoff, routing: 'Answers technical questions, bugs and fixes.' }, [back]), [], 'the teammate\'s line to the member is left out too');
  const copy = { name: 'Kelly', title: 'Support', routing: `Answers technical questions and fixes bugs. Send here for technical questions. ${NICK}`, workStyle: '' };
  assert.deepEqual(H.overlapsByRules(copy, [nickLine]), ['Nick'], 'the rest of the line still counts');
});

test('Apply records the handoffs and Undo takes back exactly what the change did (CRITICAL)', () => {
  // Value: protects=eng SC2 with the 2026-10-23 binding rules; fails_when=Undo keeps an added handoff, restores one to someone who left, drops a later hire binding, or a job with no handoffs gains a key; why_new=T1; seam=none
  const now = '2026-10-24T10:00:00Z';
  const job = { goal: 'old', description: 'Customer Support: Answers customers. Not for refunds; that goes to Erin.', handoffs: [{ toId: 'erin', scope: 'refunds', at: 't0' }] };
  const patch = J.applyJob(job, { instructions: 'new', plain: 'p', handles: `Runs projects. Not for refunds; that goes to Erin. ${NICK}`, handoffs: [{ toId: 'nick', scope: 'technical questions' }] }, { title: 'Customer Support', change: 'c', now });
  assert.deepEqual(patch.handoffs, [{ toId: 'erin', scope: 'refunds', at: 't0' }, { toId: 'nick', scope: 'technical questions', at: now }]);
  assert.deepEqual(patch.jobPrevious.handoffs, job.handoffs);
  const after = { ...job, ...patch, description: `${patch.description} Not for invoices; that goes to Oscar.` };
  const names = { nick: 'Nick', erin: 'Erin', oscar: 'Oscar' };
  const undone = J.undoJob(after, (id) => names[id]);
  assert.equal(undone.description, 'Customer Support: Answers customers. Not for refunds; that goes to Erin. Not for invoices; that goes to Oscar.', 'the added handoff goes, a later hire binding stays');
  assert.deepEqual(undone.handoffs, job.handoffs);

  const dropped = J.applyJob(job, { instructions: 'new', plain: 'p', handles: 'Answers customers.', drops: [{ toId: 'erin', scope: 'refunds' }] }, { title: 'Customer Support', change: 'c', now });
  assert.equal(dropped.handoffs, undefined);
  const back = J.undoJob({ ...job, ...dropped }, (id) => names[id]);
  assert.equal(back.description, 'Customer Support: Answers customers. Not for refunds; that goes to Erin.', 'a taken back handoff returns');
  const gone = J.undoJob({ ...job, ...dropped }, () => undefined);
  assert.equal(gone.description, 'Customer Support: Answers customers.', 'a released line stays released');

  const plain = J.applyJob({ description: 'S: x' }, { instructions: 'i', plain: 'p', handles: null }, { title: 'S', now });
  assert.equal('handoffs' in plain, false, 'a member who hands nothing on carries no list');
  assert.equal('handoffs' in plain.jobPrevious, false);
  assert.equal('handoffs' in J.undoJob({ description: 'S: x', jobPrevious: { description: 'S: y' } }), false);
});

test('a handoff is live while its teammate is here and its line is in the role line', () => {
  // Value: protects=eng D3: leave, return and rename need no flag; fails_when=liveHandoffs trusts the list alone, or a rename loses the entry; why_new=D3; seam=none
  const kelly = { id: 'kelly', name: 'Kelly', description: `Customer Support: Runs projects. ${NICK}`, handoffs: [{ toId: 'nick', scope: 'technical questions', at: 't' }] };
  const nickA = { id: 'nick', name: 'Nick', description: 'IT Engineer: Answers technical questions.' };
  assert.equal(J.liveHandoffs(kelly, [nickA])[0].line, NICK);
  assert.deepEqual(J.handoffsTo('nick', [kelly, nickA]).map((s) => [s.from.id, s.scopes]), [['kelly', ['technical questions']]]);
  // Nick leaves: the release takes the line out.
  const released = H.releaseBindings('Nick', [kelly])[0];
  assert.deepEqual(J.liveHandoffs({ ...kelly, description: released.description }, [nickA]), []);
  // He comes back: the line returns, and so does the handoff.
  const restored = H.restoredRoles([{ id: 'kelly', line: NICK }], [{ ...kelly, description: released.description }])[0];
  assert.equal(J.liveHandoffs({ ...kelly, description: restored.description }, [nickA]).length, 1);
  // Renamed to Nicholas: the line is renamed, the entry is by id.
  const renamed = H.renamePatches([kelly], 'Nick', 'Nicholas')[0];
  assert.equal(J.liveHandoffs({ ...kelly, description: renamed.description }, [{ ...nickA, name: 'Nicholas' }]).length, 1);
  assert.deepEqual(J.liveHandoffs(kelly, []), [], 'not on the team: not live');
  assert.equal(J.handoffsWithout(kelly.handoffs, 'nick'), undefined);
});

test('the tracking question lists the folder, tools on A to Z, then tools off, four before Show all', () => {
  // Value: protects=design D5 order and fold, every connector listed (never filter); fails_when=off tools come first, a tool is hidden for good, or a short list folds; why_new=T4; seam=none
  const tool = (label, off) => ({ label, tool: label, ...(off ? { off: true } : {}) });
  const choices = [tool('Notion', true), tool('HubSpot'), { label: "A sheet in Kelly's folder" }, tool('Asana'), tool('QuickBooks', true), tool('Google Drive'), tool('Slack')];
  const folded = J.homeRows(choices, false);
  assert.deepEqual(folded.map((r) => r.choice.label), ["A sheet in Kelly's folder", 'Asana', 'Google Drive', 'HubSpot', 'Slack']);
  assert.equal(folded[1].toolsStart, true);
  assert.deepEqual([folded.hidden, folded.tools], [2, 6]);
  assert.deepEqual(J.homeRows(choices, true).slice(-2).map((r) => r.choice.label), ['Notion', 'QuickBooks']);
  assert.equal(J.homeRows(choices.slice(0, 5), false).hidden, 0, 'four tools: no fold');
});

test('the card: an overlap never blocks a change; the preview names it with two optional fixes', () => {
  // Value: protects=the owner's 2026-10-24 rethink (overlap as a note, Apply on), design D3 to D8 and eng re-run D1; fails_when=an overlap gets its own blocking state again, Apply is disabled by it, Back from the box loses the preview, off rows take focus, or a note turns into an alert; why_new=owner's Kelly change stopped four times; seam=source pin
  const src = read('src/renderer/src/components/JobChangeReview.tsx');
  assert.doesNotMatch(src, /at: 'overlap'/, 'no blocking overlap state');
  assert.match(src, /setState\(\{ at: 'ok', ok: res, from, \.\.\.\(overlap \? \{ overlap \} : \{\}\) \}\);/, 'an overlap rides on the preview');
  const preview = src.slice(src.indexOf('function Preview('), src.indexOf('function Note('));
  assert.match(preview, /<PixelButton variant="primary" size="sm" onClick=\{onApply\} disabled=\{applying\}>\{applyLabel\}<\/PixelButton>/, 'Apply stays on with an overlap');
  assert.match(preview, /\{overlap && \(\n\s+<Note>/);
  assert.match(preview, /<button type="button" onClick=\{overlap\.onExplain\} disabled=\{applying\}/);
  assert.match(preview, /<button type="button" onClick=\{overlap\.onLeave\} disabled=\{applying\}/);
  assert.match(src, /const more = \[\.\.\.extras, t\('jobChange\.leaveWithChange', \{ names, count \}\)\];/, 'Leave it with Kelly adds a change and runs again');
  assert.match(src, /setState\(\{ at: 'explain', back: \{ ok, from, overlap \} \}\);/);
  const explain = src.slice(src.indexOf("} else if (state.at === 'explain') {"), src.indexOf("} else if (state.at === 'error') {"));
  assert.match(explain, /<div style=\{panelStyle\}>\n\s+\{head\(title\)\}\n\s+\{back\.overlap\.why && <span style=\{noteStyle\}>\{back\.overlap\.why\}<\/span>\}/, 'the reason stays in view');
  assert.doesNotMatch(explain, /role="alert"/);
  assert.match(explain, /onClick=\{\(\) => setState\(\{ at: 'ok', \.\.\.back \}\)\}/, 'Back returns to the same preview');
  assert.match(explain, /disabled=\{!explainText\.trim\(\)\}/);
  assert.match(src, /<span style=\{fieldLabel\}>\{t\('jobChange\.goesToGroup'\)\}<\/span>/);
  assert.match(src, /<span aria-hidden="true" style=\{\{ \.\.\.handoffMark, background: 'var\(--cth-green-soft\)'/);
  assert.match(src, /\{noSplit && <Note>\{noSplit\}<\/Note>\}/);
  const note = src.slice(src.indexOf('function Note('), src.indexOf('function Home('));
  assert.doesNotMatch(note, /role=/, 'informs, never interrupts (design D6)');
  assert.match(src, /role="radio" aria-checked=\{on\} aria-disabled=\{off \|\| undefined\}/);
  assert.match(src, /tabIndex=\{off \? -1 :/);
  assert.match(src, /const live = rows\.map\(\(r, i\) => \(r\.choice\.off \? -1 : i\)\)\.filter\(\(i\) => i >= 0\);/, 'arrows move only between pickable rows');
  assert.match(src, /if \(res\.kind === 'home'\) \{ setState\(p\.homeChoices \? \{ at: 'home', question: res\.question \} : \{ at: 'error' \}\); return; \}/);
});

test('only overlaps the change adds count, and every verdict is logged', () => {
  // Value: protects=teamwork a job already had is never charged to an edit, and a check that stops or passes a job can be read back; fails_when=the before check is dropped, names are compared case sensitively, or main stops logging; why_new=owner's Kelly change (no verdict was on record); seam=none and source pins
  assert.deepEqual(J.addedOverlaps(['Nick', 'Dwight'], ['nick']), ['Dwight']);
  assert.deepEqual(J.addedOverlaps(['Nick'], []), ['Nick']);
  assert.deepEqual(J.addedOverlaps([], ['Nick']), []);
  assert.equal(C.readCheckPhase('before'), 'before');
  assert.equal(C.readCheckPhase('after'), 'after');
  assert.equal(C.readCheckPhase('x'), 'hire');
  const modal = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(modal, /window\.cth\.hireCheckDistinct\(\{ name: cur\.name, title, routing: was, workStyle: cur\.goal \}, team, undefined, 'change', 'before'\)/);
  assert.match(modal, /window\.cth\.hireCheckDistinct\(\{ name: cur\.name, title, routing: ok\.handles, workStyle: ok\.instructions \}, team, undefined, 'change', 'after'\)/);
  assert.match(modal, /if \(beforeCheck\.current\?\.of !== of\) \{/, 'the job before is checked once per job');
  assert.match(modal, /const added = addedOverlaps\(v\.overlapsWith, before\);\n\s+if \(!added\.length\) return null;/);
  const main = read('src/main/index.ts');
  assert.match(main, /kind: 'distinct-check', mode, phase: readCheckPhase\(p\.phase\), member: job\.name,\n\s+distinct: verdict\.distinct, overlapsWith: verdict\.overlapsWith, source: verdict\.source,/);
  assert.doesNotMatch(read('src/renderer/src/components/AddAgentModal.tsx'), /'change'/, 'hiring keeps today\'s check');
});

test('Edit agent sends the split, checks in change mode, asks where numbers live, and shows who sends work here', () => {
  // Value: protects=the wiring between the card, main and the store; fails_when=the check runs in hire mode, the handoff list or askHome is not sent, Undo forgets the team, or the line moves to the Profile tab; why_new=T4, T5; seam=source pin
  const src = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(src, /askHome: !lead/);
  assert.match(src, /\.\.\.\(handoffList\.length \? \{ handoffList \} : \{\}\)/);
  assert.match(src, /return \{ label: c\.key, tool: c\.key, off: !on, noAccess: on && !connectorGranted\(cfg, agent\.id, c\.key, readsBooks\) \};/, 'off means off in Settings; on but not given is flagged');
  assert.match(src, /const sendersKey = useStore\(\(s\) => \(lead \? '' : JSON\.stringify\(handoffsTo\(agent\.id, s\.agents\)/, 'only the senders, never the whole floor (ship review)');
  assert.match(src, /t\('editAgent\.getsFrom', \{ name: from\.name \}\)/);
  assert.doesNotMatch(read('src/renderer/src/components/ProfileTab.tsx'), /handoff|getsFrom/, 'no routing on the Profile tab (owner, 2026-09-25; eng D2)');
});

test('the new strings exist in every language, with no dashes', () => {
  // Value: protects=three locales and the no-dash rule; fails_when=a key is missing or a dash slips in; why_new=new strings; seam=none
  const keys = ['explain', 'explainTitle', 'explainPlaceholder', 'back', 'goesToGroup', 'goesTo', 'noLongerGoesTo', 'noAccess', 'openAccess', 'homeFolder', 'homeTools', 'homeOff', 'homeOffLabel'];
  for (const lang of ['en', 'ar', 'zh-CN']) {
    const l = JSON.parse(read(`src/renderer/src/i18n/locales/${lang}.json`));
    for (const k of keys) {
      assert.ok(l.jobChange[k], `${lang} jobChange.${k}`);
      assert.doesNotMatch(l.jobChange[k], /[‒-―]| - /, `${lang} jobChange.${k}`);
    }
    assert.ok(Object.keys(l.jobChange).some((k) => k.startsWith('noSplit_')), `${lang} noSplit`);
    assert.ok(Object.keys(l.jobChange).some((k) => k.startsWith('homeShowAll_')), `${lang} homeShowAll`);
    assert.ok(l.editAgent.getsFrom && l.editAgent.getsFromInfo, `${lang} getsFrom`);
  }
});

test('a revise request keeps the owner\'s newest answers', () => {
  // Value: protects=the rewrite sees the owner's latest answer; fails_when=the first four of five answers are kept, so the newest is lost and the same question comes back; why_new=red team on the ship review; seam=none; no_claim=none beyond protects
  const answers = [1, 2, 3, 4, 5].map((n) => ({ question: `Q${n}?`, answer: `A${n}` }));
  const r = W.readReviseRequest({ to: 'revise', ctx, current: { instructions: 'x', handles: 'y' }, changes: ['z'], answers });
  assert.deepEqual(r.answers.map((a) => a.answer), ['A2', 'A3', 'A4', 'A5']);
});
