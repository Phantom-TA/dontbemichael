'use strict';

/**
 * The conversation opens on the owner's latest question
 * (docs/designs/dock-latest-exchange.md; owner, 2026-10-31: old text above the
 * question "takes time to figure out where is his question").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { NO_FOLD, nextFold, foldedItems } = loadTs('src/renderer/src/shell/dockFold.ts');

const q = (id, status = 'answered', unread = false) => ({ kind: 'owner', id, status, unread, at: '2026-10-31T10:00:00Z', text: id });
const r = (id, replyTo) => ({ kind: 'michael', id, replyTo, at: '2026-10-31T10:00:00Z', text: id });
const ids = (items, fold) => foldedItems(items, fold.shown).map((it) => it.id);

test('it opens on the latest question and its replies, not the old ones', () => {
  // Value: protects=D1 and D2; fails_when=old answers show above the question; why_new=the 30 day rule is gone; seam=none
  const items = [q('a'), r('ra', 'a'), q('b'), r('rb', 'b'), q('c'), r('rc', 'c')];
  assert.deepEqual(ids(items, nextFold(NO_FOLD, items, 1)), ['c', 'rc']);
});

test('open work and unread replies are never folded', () => {
  // Value: protects=the rule's second and third lines; fails_when=work in flight or a new reply hides; why_new=new rule; seam=none
  const items = [q('open', 'has-it'), q('old'), r('r1', 'old'), q('unread', 'answered', true), r('r2', 'unread'), q('last')];
  assert.deepEqual(ids(items, nextFold(NO_FOLD, items, 1)), ['open', 'unread', 'r2', 'last']);
});

test('nothing folds while the owner reads it', () => {
  // Value: protects=a reply marked read, or a question answered, stays on screen; fails_when=the row vanishes mid read; why_new=ownerRead runs as soon as the dock opens; seam=none
  const before = [q('a', 'answered', true), r('ra', 'a'), q('b', 'has-it')];
  const opened = nextFold(NO_FOLD, before, 1);
  const after = [q('a'), r('ra', 'a'), q('b'), r('rb', 'b')];
  const read = nextFold(opened, after, 1);
  assert.deepEqual(ids(after, read), ['a', 'ra', 'b', 'rb']);
  assert.deepEqual(ids(after, nextFold(read, after, 2)), ['b', 'rb'], 'the next opening folds them');
});

test('a reply that lands during an opening joins the view', () => {
  // Value: protects=new replies reach the owner; fails_when=a reply to an older question stays hidden; why_new=the fold only grows; seam=none
  const before = [q('a'), q('b')];
  const opened = nextFold(NO_FOLD, before, 1);
  const after = [q('a', 'answered', true), r('ra', 'a'), q('b')];
  assert.deepEqual(ids(after, nextFold(opened, after, 1)), ['a', 'ra', 'b']);
});

test('a send starts over, even when its question lands a poll later', () => {
  // Value: protects=the new question shows alone; fails_when=the last question stays above it; why_new=setDock runs before the refresh; seam=none
  const before = [q('a'), r('ra', 'a')];
  const opened = nextFold(NO_FOLD, before, 1);
  const sending = nextFold(opened, before, 2, 'new');
  assert.equal(sending.waitingFor, 'new');
  const after = [...before, q('new', 'sent')];
  const landed = nextFold(sending, after, 2, 'new');
  assert.equal(landed.waitingFor, undefined);
  assert.deepEqual(ids(after, landed), ['new']);
});

test('two questions in a row both show, the first is still open', () => {
  // Value: protects=a message does not vanish on the next send; fails_when=the first is folded; why_new=new rule; seam=none
  const items = [q('a'), q('first', 'sent'), q('second', 'sent')];
  assert.deepEqual(ids(items, nextFold(NO_FOLD, items, 1)), ['first', 'second']);
});

test('an unchanged snapshot keeps the same fold, and an empty one has nothing to fold', () => {
  // Value: protects=the memo in MichaelDock; fails_when=every poll rebuilds the list; why_new=new; seam=none
  const items = [q('a')];
  const fold = nextFold(NO_FOLD, items, 1);
  assert.equal(nextFold(fold, [...items], 1), fold);
  assert.deepEqual(ids([], nextFold(NO_FOLD, [], 1)), []);
});
