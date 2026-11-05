/**
 * The countable half of the standing approval check (issue #490).
 *
 * The fit check is a quick model reading the approval and the email
 * (mailProposals.ts standingFitPrompt). Left alone, it rests on that model's
 * confidence: an invented price or a date nobody asked for goes out when the
 * model overlooks it. This pulls the closed classes out of the email and checks
 * them against the words the email may draw on, the approved kind and, for a
 * reply, the message it answers:
 *  - when the approved kind is not about money, money (an amount with a
 *    currency, or a percentage) the email names and those words do not is
 *    refused without asking the model, because the check already counts money
 *    as outside an approval unless it plainly covers it. A kind about money
 *    ("refunds up to $50", "invoice reminders") plainly covers some amounts the
 *    count cannot see, so its money is left to the model, as before;
 *  - dates and times the email names and those words do not are handed to the
 *    model as a closed list, since a ship day can be exactly what an order
 *    status reply is for, and only judgement can tell.
 *
 * Plain TypeScript with no imports, so the tests can run it.
 */

export type FactKind = 'amount' | 'percent' | 'date' | 'time' | 'day';

export interface Fact {
  kind: FactKind;
  /** As the email wrote it, for the reason. */
  text: string;
  /** Normalised forms; the fact is founded when any one is in the sources. */
  keys: string[];
}

/** What the email may draw on: the approved kind and the message it answers. */
export interface FactSources {
  kind: string;
  answers?: { subject: string; text: string };
}

const NUM = String.raw`\d{1,3}(?:[,\u00a0\u202f]\d{2,3})+(?:\.\d+)?|\d+(?:[.,]\d+)?`;
const CURRENCY_MARK = String.raw`(?:US|A|C|NZ|S|HK)?\$|€|£|¥|₹|₩|₦|₱`;
const CURRENCY_CODE = String.raw`USD|EUR|GBP|INR|AUD|CAD|NZD|SGD|HKD|AED|JPY|CHF|ZAR|Rs\.?`;
const CURRENCY_WORD = String.raw`dollars?|euros?|pounds?|rupees?|bucks`;

const AMOUNT_BEFORE = new RegExp(String.raw`(?:${CURRENCY_MARK}|\b(?:${CURRENCY_CODE}))\s?(${NUM})`, 'gi');
const AMOUNT_AFTER = new RegExp(String.raw`(?<![\d.,])(${NUM})\s?(?:€|£|₹|\b(?:${CURRENCY_CODE}|${CURRENCY_WORD})\b)`, 'gi');
const PERCENT = new RegExp(String.raw`(?<![\d.,])(${NUM})\s?(?:%|\bper\s?cent\b)`, 'gi');
const ANY_NUMBER = new RegExp(String.raw`(?<![\d.,])(?:${NUM})(?![\d])`, 'g');
/** Words that make a kind about money: its amounts are the model's to judge. */
const MONEY_WORD = /\b(?:prices?|pricing|refund(?:s|ed)?|invoic(?:e|es|ed|ing)|payments?|discounts?|credits?|quotes?|bill(?:s|ed|ing)?)\b/i;
/** Words that make a 100% money ("100% off", "a 100% refund"). */
const MONEY_NEAR = /\b(?:off|discount|refund|back|cashback)\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = String.raw`jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?`;
const ORD = String.raw`(?:st|nd|rd|th)?`;
const DAY_MONTH = new RegExp(String.raw`\b(\d{1,2})${ORD}\s+(?:of\s+)?(${MONTH})\b`, 'gi');
const MONTH_DAY = new RegExp(String.raw`\b(${MONTH})\.?\s+(\d{1,2})${ORD}\b`, 'gi');
const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
const TIME_12 = /\b(\d{1,2})(?::([0-5]\d))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])/gi;
const TIME_24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:a\.?m|p\.?m))/gi;
const NOON = /\b(noon|midday|midnight)\b/gi;
const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi;
// "today" is left out on purpose: in a reply it is mostly a greeting ("how can
// I help today"), and a same day promise names a time, which is caught.
const RELATIVE = /\b(tomorrow|tonight|(?:next|this)\s+(?:week|weekend|month|year)|end\s+of\s+(?:the\s+)?(?:day|week|month))\b/gi;

/** `1,200.00` → `1200`; `12,50` → `12.5`; `1,35,000` → `135000`. */
function numberKey(raw: string): string {
  let s = raw.replace(/[\u00a0\u202f]/g, '');
  if (!s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : raw;
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const validDay = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

function clock(h: number, m: number, mer?: string): string | null {
  if (mer) {
    if (h < 1 || h > 12) return null;
    const pm = mer.toLowerCase().startsWith('p');
    h = (h % 12) + (pm ? 12 : 0);
  }
  return h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}

function* matches(re: RegExp, text: string): Generator<RegExpExecArray> {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) yield m;
}

/** Every amount, percentage, date, time and named day in `text`, grouped by
 *  kind, each once ("$45 USD" is one amount, "Friday" twice is one day). */
export function extractFacts(text: string): Fact[] {
  const facts: Fact[] = [];
  const listed = new Set<string>();
  const add = (kind: FactKind, raw: string, keys: string[]) => {
    const id = `${kind}|${keys.join('|')}`;
    if (listed.has(id)) return;
    listed.add(id);
    facts.push({ kind, text: raw.trim(), keys });
  };

  for (const m of matches(AMOUNT_BEFORE, text)) add('amount', m[0], [`n:${numberKey(m[1])}`]);
  for (const m of matches(AMOUNT_AFTER, text)) add('amount', m[0], [`n:${numberKey(m[1])}`]);
  for (const m of matches(PERCENT, text)) {
    // "We are 100% on it" is a figure of speech: a lone 100% is money only
    // with an "off", a "discount" or a "refund" beside it.
    const near = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
    if (numberKey(m[1]) === '100' && !MONEY_NEAR.test(near)) continue;
    add('percent', m[0], [`n:${numberKey(m[1])}`]);
  }

  for (const m of matches(DAY_MONTH, text)) {
    const mo = monthIndex(m[2]); const d = Number(m[1]);
    if (validDay(mo, d)) add('date', m[0], [`d:${pad(mo)}-${pad(d)}`]);
  }
  for (const m of matches(MONTH_DAY, text)) {
    const mo = monthIndex(m[1]); const d = Number(m[2]);
    if (validDay(mo, d)) add('date', m[0], [`d:${pad(mo)}-${pad(d)}`]);
  }
  for (const m of matches(ISO_DATE, text)) {
    const mo = Number(m[2]); const d = Number(m[3]);
    if (validDay(mo, d)) add('date', m[0], [`d:${pad(mo)}-${pad(d)}`]);
  }
  for (const m of matches(NUMERIC_DATE, text)) {
    const a = Number(m[1]); const b = Number(m[2]);
    // "24/7" is a phrase, never a date.
    if (a === 24 && b === 7 && !m[3]) continue;
    // Day first or month first: either reading founds it.
    const keys = [validDay(a, b) ? `d:${pad(a)}-${pad(b)}` : '', validDay(b, a) ? `d:${pad(b)}-${pad(a)}` : ''].filter(Boolean);
    if (keys.length) add('date', m[0], keys);
  }

  for (const m of matches(TIME_12, text)) {
    const k = clock(Number(m[1]), Number(m[2] ?? 0), m[3]);
    if (k) add('time', m[0], [`t:${k}`]);
  }
  for (const m of matches(TIME_24, text)) {
    const k = clock(Number(m[1]), Number(m[2]));
    if (k) add('time', m[0], [`t:${k}`]);
  }
  for (const m of matches(NOON, text)) add('time', m[0], [`t:${m[1].toLowerCase() === 'midnight' ? '00:00' : '12:00'}`]);

  for (const m of matches(WEEKDAY, text)) add('day', m[0], [`w:${m[1].toLowerCase()}`]);
  for (const m of matches(RELATIVE, text)) add('day', m[0], [`r:${m[1].toLowerCase().replace(/\s+/g, ' ')}`]);
  return facts;
}

/** The keys a source text founds: its facts, and every number in it, so an
 *  amount the customer wrote without a currency ("is 45 right?") still counts. */
function sourceKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const f of extractFacts(text)) for (const k of f.keys) keys.add(k);
  for (const m of matches(ANY_NUMBER, text)) keys.add(`n:${numberKey(m[0])}`);
  return keys;
}

/** The email's own words: quoted lines of the message it answers and the
 *  "On … wrote:" line above them are the other side's, not the email's. */
function ownWords(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept = lines.filter((line, i) => {
    if (/^\s*>/.test(line)) return false;
    const next = lines.slice(i + 1).find((l) => l.trim());
    return !(/\bwrote:\s*$/i.test(line) && next !== undefined && /^\s*>/.test(next));
  });
  return kept.join('\n');
}

/** The facts the email names that neither the kind nor the message it answers
 *  does, in the order `extractFacts` finds them. */
export function unfoundedFacts(sources: FactSources, email: { subject: string; body: string }): Fact[] {
  const founded = sourceKeys([sources.kind, sources.answers?.subject ?? '', sources.answers?.text ?? ''].join('\n'));
  return extractFacts(`${email.subject}\n${ownWords(email.body)}`).filter((f) => !f.keys.some((k) => founded.has(k)));
}

const isMoney = (f: Fact) => f.kind === 'amount' || f.kind === 'percent';
/** How many facts a reason or the prompt quotes. */
const QUOTED = 5;
const quote = (facts: Fact[]) => facts.slice(0, QUOTED).map((f) => `"${f.text.replace(/\s+/g, ' ').slice(0, 40)}"`).join(', ');

/** Whether the approved kind is about money: it names an amount, a
 *  percentage or a money word. */
export function kindIsAboutMoney(kind: string): boolean {
  return MONEY_WORD.test(kind) || extractFacts(kind).some(isMoney);
}

/** Why a standing send names money it may not, or null. Counted, so the model
 *  is never asked: the email goes to the owner instead (fail closed). Null for
 *  a kind about money, whose amounts the model judges as before. */
export function unfoundedMoneyReason(sources: FactSources, email: { subject: string; body: string }): string | null {
  if (kindIsAboutMoney(sources.kind)) return null;
  const money = unfoundedFacts(sources, email).filter(isMoney);
  if (!money.length) return null;
  const where = sources.answers ? 'the approval or the message it answers' : 'the approval';
  return `It names money that is not in ${where}: ${quote(money)}.`;
}

/** The dates and times for the model to judge, or an empty list. */
export function unfoundedWhen(sources: FactSources, email: { subject: string; body: string }): Fact[] {
  return unfoundedFacts(sources, email).filter((f) => !isMoney(f));
}

/** The prompt line that hands the model those dates and times, or null when
 *  there are none (the prompt then stays exactly as it was). */
export function unfoundedWhenLine(facts: Fact[], replying: boolean): string | null {
  if (!facts.length) return null;
  const where = replying ? 'neither the approval nor the message it answers names' : 'the approval does not name';
  return `The email names these dates or times that ${where}: ${quote(facts)}. Answer NO when any of them is a date or time the business commits to that the approval does not plainly cover.`;
}
