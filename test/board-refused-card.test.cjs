'use strict';

/**
 * A card the app could not put on the board, because tasks.json could not be
 * read at that moment, is not lost without a word. The First task handler and
 * the mailbox card live in the app's main file, which a test cannot load, so
 * these pin the source.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

test('a First task that cannot go on the board is reported as not done, and the owner is told', () => {
  // Value: protects=the words the owner typed; fails_when=the handler answers ok, as it does when there is nothing to send, so the caller drops them; why_new=review of a strict board read; seam=source pin for the handler
  const handler = main.slice(main.indexOf("ipcMain.handle('hive:firstTask'"), main.indexOf("ipcMain.handle('hive:addTask'"));
  const retry = handler.slice(handler.indexOf('first.card.id = `${first.card.id}-'));
  assert.match(retry, /if \(!hive\.addTask\(first\.card\)\) \{\n\s+ownerToast\(michaelName\(\), /);
  assert.match(retry, /return \{ ok: false, error: 'the board cannot be read' \};/);
  assert.doesNotMatch(retry.slice(0, retry.indexOf('hive.send(')), /sent: false/, 'not the answer for nothing to send');
});

test('a mailbox card that cannot go on the board is tried again until it does', () => {
  // Value: protects=the owner hears a mailbox stopped working; fails_when=the card is made only on the status change, so a bad moment hides it until the status changes again; why_new=review of a strict board read; seam=source pin for markMailboxStatus
  assert.match(main, /if \(!raiseMailboxCard\(id, rec\.address, reason\)\) owedMailboxCards\.add\(id\);/);
  assert.match(main, /return hive\.addTask\(card\) \|\| hive\.patchTask\(cardId, \{ status: 'blocked', humanQA: card\.humanQA \}\);/);
  assert.match(main, /if \(rec\?\.status !== 'needs-attention' \|\| raiseMailboxCard\(id, rec\.address, rec\.statusReason\)\) owedMailboxCards\.delete\(id\);/, 'a fixed or removed mailbox is dropped, a raised card is done');
  assert.match(main, /owedMailboxCards\.delete\(id\);\n\s+if \(rec\.status === 'needs-attention'\) closeMailboxCard/, 'connected again owes nothing');
  assert.match(main, /setInterval\(retryMailboxCards, 60_000\)\.unref\(\);/);
});
