'use strict';

/**
 * Eval: does the run comparison prompt find the real difference between two
 * runs, and stay quiet when there is none (eng review D7)? Run against the
 * real model the feature asks for (RUN_COMPARE_MODEL) with `claude -p`, no
 * tools, outside this shell's Claude Code session. Off by default, since it
 * makes three model calls; run it with:
 *
 *   RUN_COMPARE_EVAL=1 node --test test/run-compare-eval.test.cjs
 *
 * The pairs:
 *  1. a missed step: the bad run never opened the second inbox;
 *  2. a wrong recipient: the bad run wrote to the accountant who forwarded
 *     the invoice, not the customer;
 *  3. a quiet day: the bad run found no overdue invoices, so there is nothing
 *     to change in the job.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const R = loadTs('src/shared/runCompare.ts');
const MODEL = 'claude-sonnet-5'; // RUN_COMPARE_MODEL in src/main/runCompare.ts
const skip = process.env.RUN_COMPARE_EVAL === '1' ? false : 'set RUN_COMPARE_EVAL=1 to run against the model';

const WORK_STYLE = [
  'The owner set this work style for your role at a small bakery supply business.',
  '### The job',
  'Chase overdue customer invoices: find invoices past their due date and send each customer a polite reminder with the amount and due date.',
  '### How to work',
  '1. Check the billing inbox for invoices and payment replies.',
  '2. Look up the customer in the customer list before writing.',
  '3. Keep reminders short and friendly.'
].join('\n');

function ask(input) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  const r = spawnSync('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config'], { input: R.comparePrompt(input), env, encoding: 'utf8', timeout: 180_000 });
  assert.equal(r.status, 0, r.stderr);
  const text = r.stdout;
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const parsed = R.parseCompare(json);
  assert.ok(parsed, text);
  return parsed;
}

const base = { name: 'Pam', job: 'Invoice chase', focus: 'overdue invoices', workStyle: WORK_STYLE, changedBetween: [] };

test('1. a missed step: the change names the step the bad run skipped', { skip, timeout: 240_000 }, () => {
  const r = ask({
    ...base,
    note: 'it missed two overdue invoices',
    good: { when: '2026-10-20T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 1 message: Invoice 1042, Corner Cafe, $310, due Oct 10',
      'TOOL mail_search: {"box":"billing-archive","q":"invoice overdue"}',
      'RESULT: 2 messages: Invoice 1038, Rye House, $120, due Oct 5 / Invoice 1040, Lark Deli, $95, due Oct 8',
      'SAID: Three overdue invoices, across the billing inbox and the billing archive. Sending three reminders.',
      'TOOL mail_send: {"to":"accounts@cornercafe.example","subject":"Reminder: invoice 1042"}',
      'TOOL mail_send: {"to":"pay@ryehouse.example","subject":"Reminder: invoice 1038"}',
      'TOOL mail_send: {"to":"office@larkdeli.example","subject":"Reminder: invoice 1040"}'
    ].join('\n') },
    bad: { when: '2026-10-27T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 1 message: Invoice 1051, Corner Cafe, $280, due Oct 20',
      'SAID: One overdue invoice. Sending one reminder.',
      'TOOL mail_send: {"to":"accounts@cornercafe.example","subject":"Reminder: invoice 1051"}'
    ].join('\n') }
  });
  assert.ok(r.change, `expected a change; why: ${r.why}`);
  assert.match(r.change, /archive/i, r.change);
});

test('2. a wrong recipient: the change says who reminders go to', { skip, timeout: 240_000 }, () => {
  const r = ask({
    ...base,
    note: 'the reminder went to our accountant, not the customer',
    good: { when: '2026-10-20T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 1 message from sam@ourbooks.example (our accountant): Fwd: Invoice 1042, Corner Cafe, $310, due Oct 10',
      'TOOL customers_lookup: {"name":"Corner Cafe"}',
      'RESULT: Corner Cafe, billing contact accounts@cornercafe.example',
      'TOOL mail_send: {"to":"accounts@cornercafe.example","subject":"Reminder: invoice 1042"}'
    ].join('\n') },
    bad: { when: '2026-10-27T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 1 message from sam@ourbooks.example (our accountant): Fwd: Invoice 1051, Rye House, $120, due Oct 18',
      'SAID: Replying to the invoice email with a reminder.',
      'TOOL mail_send: {"to":"sam@ourbooks.example","subject":"Reminder: invoice 1051"}'
    ].join('\n') }
  });
  assert.ok(r.change, `expected a change; why: ${r.why}`);
  assert.match(r.change, /customer|billing contact|look/i, r.change);
});

test('3. a quiet day: no change when the bad run simply had nothing to do', { skip, timeout: 240_000 }, () => {
  const r = ask({
    ...base,
    note: 'it did not send anything',
    good: { when: '2026-10-20T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 1 message: Invoice 1042, Corner Cafe, $310, due Oct 10',
      'TOOL customers_lookup: {"name":"Corner Cafe"}',
      'RESULT: Corner Cafe, billing contact accounts@cornercafe.example',
      'TOOL mail_send: {"to":"accounts@cornercafe.example","subject":"Reminder: invoice 1042"}'
    ].join('\n') },
    bad: { when: '2026-10-27T09:00', text: [
      'MESSAGE: Run your job "Invoice chase".',
      'TOOL mail_search: {"box":"billing","q":"invoice overdue"}',
      'RESULT: 0 messages',
      'TOOL invoices_list: {"status":"overdue"}',
      'RESULT: no overdue invoices',
      'SAID: No invoices are overdue today, so there is nothing to send.'
    ].join('\n') }
  });
  assert.equal(r.change, '', `expected no change, got: ${r.change}`);
});
