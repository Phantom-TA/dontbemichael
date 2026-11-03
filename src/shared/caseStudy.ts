/**
 * The case study (docs/designs/case-study.md): one outcome first page an owner
 * can send us, built only from the office's own facts and Pulse figures.
 *
 *   main gathers CaseStudyFacts ─► draftPrompt(facts) ─► runHiddenModel ─► parseDraft(reply)
 *                    │                                                        │
 *                    └──────────────► pageHtml(facts, edits) ◄────────────────┘
 *                                        │                │
 *                          screen preview (iframe)    PDF window (main)
 *
 * One renderer for the preview and the PDF (eng red flag 6), and one facts
 * type for both the page and the prompt (red flag 8): the customers answer,
 * mail and memory are never in CaseStudyFacts, so neither can reach them.
 * Every number on the page is a Pulse figure (D4): the headline's number is
 * filled from the facts, never from text (D16), and drafted parts with a
 * number in them are refused (eng pass).
 */
import { cutText } from './cutText';

/** Where case studies go (D9). Main fixes the recipient; nothing else can set it. */
export const CASE_STUDY_TO = 'hello@dontbemichael.com';

export type CaseLang = 'en' | 'ar' | 'zh-CN';
export type Paper = 'letter' | 'a4';

/** The figures a headline or the band can be built from. */
export type HeadlineFigure = 'email' | 'task' | 'away' | 'sent' | 'check';
export const HEADLINE_FIGURES: readonly HeadlineFigure[] = ['email', 'task', 'away', 'sent', 'check'];

/** What a team row's number counts. */
export type MemberFigureKind = 'email' | 'sent' | 'task' | 'check' | 'routed';

export interface CaseMember {
  id: string;
  name: string;
  /** The role title ("Front desk"). */
  role: string;
  /** The stored role description, a team line's starting point (D13). */
  roleDescription?: string;
  /** Names of the member's scheduled jobs, for the draft only. */
  jobs: string[];
  figure: { kind: MemberFigureKind; count: number } | null;
  isMichael: boolean;
}

export interface CaseFigures {
  email: number;
  sent: number;
  task: number;
  check: number;
  routed: number;
  ranMs: number;
  awayMs: number;
  /** What the team cost in the period, as Pulse shows it (D14). */
  spendUsd: number;
}

export interface HeroPalette { hero: string; tint: string; line: string; away: string; /** The headline's number (D23). */ highlight: string }

export interface CaseStudyFacts {
  lang: CaseLang;
  paper: Paper;
  /** D8: off hides the name, logo and website and shows the type and city. */
  showName: boolean;
  businessName?: string;
  website?: string;
  businessType?: string;
  city?: string;
  industry?: string;
  serviceArea?: string;
  hours?: string;
  languages?: string;
  /** The foundations offer answer (never the customers answer). */
  offer?: string;
  /** Signs the quote only; never in the prompt. */
  ceoName?: string;
  members: CaseMember[];
  figures: CaseFigures;
  /** Hours each local day of the period, from Pulse's running records (D18). */
  days: Array<{ day: string; ms: number; awayMs: number }>;
  range: { from: string; to: string; days: number };
  appVersion: string;
  /** A PNG data URL of the kept logo, and its colors (D17). */
  logo?: string;
  palette?: HeroPalette | null;
}

export interface CaseStudyEdits {
  headline: { figure: HeadlineFigure; before: string; after: string } | null;
  subtitle: string;
  about: string;
  quote: string;
  team: Record<string, string>;
  why: string;
}

/** What the draft gave back; a part it couldn't give is left out. */
export interface CaseDraft {
  subtitle?: string;
  about?: string;
  why?: string;
  headlines: Partial<Record<HeadlineFigure, { before: string; after: string }>>;
  team: Record<string, string>;
}

// ---------------------------------------------------------------- the screen's calls

export type CasePeriod = 'last-30' | 'this-month';
/** The page's language from the app's (i18n) language code. */
export function caseLangOf(code: string): CaseLang {
  return code.startsWith('zh') ? 'zh-CN' : code.startsWith('ar') ? 'ar' : 'en';
}
export interface CaseInput { lang: CaseLang; period: CasePeriod; showName: boolean }
export interface CaseSender { id: string; address: string; canSend: boolean; reason?: string }
/** A bundled face as bytes: the PDF window loads it as @font-face; the screen's
 *  preview adds it with FontFace, which the renderer's font-src 'self' allows. */
export interface CaseFont { family: string; weight: string; base64: string }
export interface CaseOpen { facts: CaseStudyFacts; fonts: CaseFont[]; senders: CaseSender[]; hasWork: boolean; to: string }

/** @font-face rules for the PDF window. */
export function fontFaceCss(fonts: CaseFont[]): string {
  return fonts.map((f) => `@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${f.base64}) format('woff2');font-weight:${f.weight};font-style:normal}`).join('\n');
}
export type CaseLogo = { ok: true; logo: string; palette: HeroPalette } | { ok: false; reason: string };
export type CaseDraftResult = { ok: true; draft: CaseDraft } | { ok: false; reason: 'no-work' | 'failed' };
export type CaseSendOutcome =
  | { ok: true }
  | { ok: false; kind: 'failed'; reason: string }
  | { ok: false; kind: 'maybe-sent' }
  | { ok: false; kind: 'overflow' | 'headline-number' | 'no-work' | 'no-permission' | 'no-mailbox' };
/** The case study being prepared in main (owner, 2026-11-03: the owner never
 *  waits on an empty frame). `ready` carries what the screen opens with. */
export type CasePrep =
  | { state: 'idle' }
  | { state: 'preparing'; input: CaseInput }
  | { state: 'ready'; input: CaseInput; draft: CaseDraft | null; logo: CaseLogo | null; hasWork: boolean };
export type CaseSaveResult = { ok: true; path: string } | { ok: false; kind: 'overflow' | 'headline-number' | 'no-work' | 'failed' | 'cancelled' };

/** Team rows on the page before "and N more" (D13). */
export const TEAM_ROWS = 8;

/** Length caps per language (eng pass): Chinese and Arabic set wider per
 *  character, so the worst case (8 rows, every part full) still fits a page. */
export const CAPS: Record<CaseLang, { subtitle: number; about: number; quote: number; teamLine: number; why: number; headlineWords: number }> = {
  en: { subtitle: 100, about: 190, quote: 120, teamLine: 50, why: 160, headlineWords: 60 },
  ar: { subtitle: 90, about: 170, quote: 108, teamLine: 45, why: 145, headlineWords: 54 },
  'zh-CN': { subtitle: 50, about: 95, quote: 60, teamLine: 25, why: 80, headlineWords: 30 }
};

// ---------------------------------------------------------------- numbers (D4)

const DIGITS = /[0-9٠-٩۰-۹０-９]/;
const EN_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|quarters?|double|twice|triple|percent)\b/i;
const AR_WORDS = /(واحد|اثنان|اثنين|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع|عشر|مئة|مائة|مئات|ألف|آلاف|مليون|نصف|ربع|ضعف|دزينة|بالمئة|بالمائة)/;
// A Chinese numeral is common inside ordinary words (一起, 一直), so only a
// numeral before a counting word, or a large unit, counts as a number.
const ZH_WORDS = /([零一二两三四五六七八九十百千万亿]+[个名位家次小时天周年月倍成%％])|[百千万亿]|倍|一半|半数/;

/** A digit in any script, or a number word in the page's language. Quantity
 *  words count ("dozens", "half"): they are claims too (eng pass, EP-O5). */
export function hasNumber(text: string, lang: CaseLang): boolean {
  if (DIGITS.test(text)) return true;
  if (lang === 'ar') return AR_WORDS.test(text);
  if (lang === 'zh-CN') return ZH_WORDS.test(text);
  return EN_WORDS.test(text);
}

const groupFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
/** Numbers stay Latin digits in every language, as in the app. */
export function fmtCount(n: number): string { return groupFmt.format(Math.round(n)); }
export function fmtUsd(n: number): string {
  const v = Math.max(0, n);
  return '$' + (v >= 10 ? groupFmt.format(Math.round(v)) : v.toFixed(2));
}
export const hoursOf = (ms: number): number => Math.round(ms / 3_600_000);

// ---------------------------------------------------------------- figures

/** The value a headline or band figure shows. */
export function figureValue(f: CaseFigures, k: HeadlineFigure): number {
  if (k === 'away') return hoursOf(f.awayMs);
  return f[k];
}

/** Any counted work in the period (D19). */
export function hasWork(f: CaseFigures): boolean {
  return f.email + f.sent + f.task + f.check > 0;
}

/** Up to three headline choices, one per nonzero figure (D16). */
export function headlineChoices(f: CaseFigures): HeadlineFigure[] {
  return HEADLINE_FIGURES.filter((k) => figureValue(f, k) > 0).slice(0, 3);
}

/** The band's numbers: the three strongest nonzero figures, then spend, always (D14). */
export function bandFigures(f: CaseFigures): HeadlineFigure[] {
  return HEADLINE_FIGURES.filter((k) => figureValue(f, k) > 0).slice(0, 3);
}

/** A team row's number (eng pass): the member's largest kind; Michael's is
 *  requests routed; none when the member did nothing countable. */
export function memberFigure(counts: { email: number; sent: number; task: number; check: number }, routed: number | null): CaseMember['figure'] {
  if (routed !== null) return routed > 0 ? { kind: 'routed', count: routed } : null;
  const kinds: Array<'email' | 'sent' | 'task' | 'check'> = ['email', 'sent', 'task', 'check'];
  const best = kinds.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  return counts[best] > 0 ? { kind: best, count: counts[best] } : null;
}

// ---------------------------------------------------------------- colour (D17)

type RGB = [number, number, number];
const hex = (c: RGB): string => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbOf(h: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lin(v: number): number { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
/** WCAG relative luminance. */
export function luminance(h: string): number { const [r, g, b] = rgbOf(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Our ink: the hero when a logo has no usable colour (D17). */
export const INK_PALETTE: HeroPalette = { hero: '#1E1B2E', tint: '#F0EFF5', line: '#DAD7EA', away: '#6C5CE7', highlight: '#C9C1FF' };

/**
 * The logo's main colour from RGBA pixels (main samples the logo at 32 px):
 * transparent, near white, near black and grey pixels are skipped, the most
 * common hue wins, and it must cover a twentieth of the solid pixels, so a
 * thin antialiased edge never decides. Null when no colour qualifies.
 */
export function logoColour(rgba: Uint8Array | number[]): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let solid = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    solid++;
    const c: RGB = [rgba[i], rgba[i + 1], rgba[i + 2]];
    const { h, s, l } = hsl(c);
    if (l > 0.92 || l < 0.08 || s < 0.15) continue;
    const k = Math.floor(h / 15) % 24;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
    buckets.set(k, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || !solid || best.n < solid / 20) return null;
  return hex([best.r / best.n, best.g / best.n, best.b / best.n]);
}

/** The hero and its shades: darkened until white text passes 4.5:1 (D17),
 *  the tint and line light enough for ink-2 labels at 4.5:1, and the
 *  headline number's light tint of the hero's hue, at 3:1 on it (large
 *  bold text, D23). */
export function heroPalette(colour: string | null): HeroPalette {
  if (!colour) return INK_PALETTE;
  let c = rgbOf(colour);
  for (let i = 0; i < 60 && contrast(hex(c), '#FFFFFF') < 4.5; i++) c = mix(c, [0, 0, 0], 0.06);
  const white: RGB = [255, 255, 255];
  // The number's tint: the logo's own hue, light and kept saturated so it
  // still reads as the brand, lifted until it reads at 3:1 on the hero, the
  // WCAG bar for large bold text such as the headline; a light logo colour
  // needs the hero a little darker still (D23).
  const { h: hue, s: sat } = hsl(c);
  const tintFor = (h: RGB): RGB | null => {
    for (let l = 0.66; l <= 0.94; l += 0.02) {
      const cand = fromHsl(hue, Math.max(0.55, sat), l);
      if (contrast(hex(cand), hex(h)) >= 3) return cand;
    }
    return null;
  };
  let hl = tintFor(c);
  for (let i = 0; i < 40 && hl === null; i++) { c = mix(c, [0, 0, 0], 0.06); hl = tintFor(c); }
  return { hero: hex(c), tint: hex(mix(c, white, 0.9)), line: hex(mix(c, white, 0.78)), away: hex(mix(c, white, 0.35)), highlight: hex(hl ?? mix(c, white, 0.9)) };
}

// ---------------------------------------------------------------- page words

interface Words {
  caseStudy: string; theBusiness: string; theTeam: string; away: string; worked: string; why: string;
  awayLegend: string; aroundLegend: string; ofHours: (a: string, b: string) => string;
  source: (from: string, to: string) => string; made: string; version: string; more: (n: number) => string;
  band: Record<HeadlineFigure, string>; spend: (days: number) => string;
  member: Record<MemberFigureKind, string>;
  typeIn: (type: string, city: string) => string; aBusiness: string; theOwner: string; ownerOf: (b: string) => string;
  headline: Record<HeadlineFigure, (who: string, days: number) => { before: string; after: string }>;
  stripLabel: (a: string, b: string, from: string, to: string) => string;
  locked: string;
}

const WORDS: Record<CaseLang, Words> = {
  en: {
    caseStudy: 'Case study', theBusiness: 'The business', theTeam: 'The team', away: 'While the owner was away', worked: 'Hours the office worked',
    why: 'Why a small business should do this', awayLegend: 'while the owner was away', aroundLegend: 'with the owner around',
    ofHours: (a, b) => `<b>${a}</b> of <b>${b}</b> hours`,
    source: (f, t) => `Counted by the app, ${f} to ${t}. Spend is everything the team cost in that period.`,
    made: "Made with Don't Be Michael", version: 'version', more: (n) => `and ${n} more`,
    band: { email: 'emails organized', task: 'tasks finished', away: 'hours of work while the owner was away', sent: 'emails sent', check: 'scheduled checks' },
    spend: (d) => `for the whole team, all ${d} days`,
    member: { email: 'emails', sent: 'sent', task: 'tasks', check: 'checks', routed: 'routed' },
    typeIn: (t, c) => (t && c ? `${t} in ${c}` : t || c), aBusiness: 'A small business', theOwner: 'The owner', ownerOf: (b) => `The owner, ${b}`,
    headline: {
      email: (w, d) => ({ before: `The AI office at ${w} handled`, after: `emails in ${d} days` }),
      task: (w, d) => ({ before: `The AI office at ${w} finished`, after: `tasks in ${d} days` }),
      away: (w) => ({ before: `The AI office at ${w} worked`, after: 'hours while the owner was away' }),
      sent: (w, d) => ({ before: `The AI office at ${w} sent`, after: `emails in ${d} days` }),
      check: (w, d) => ({ before: `The AI office at ${w} ran`, after: `scheduled checks in ${d} days` })
    },
    stripLabel: (a, b, f, t) => `Hours the office worked each day, ${f} to ${t}; ${a} of ${b} hours while the owner was away`,
    locked: "from Pulse, can't be edited"
  },
  ar: {
    caseStudy: 'دراسة حالة', theBusiness: 'النشاط التجاري', theTeam: 'الفريق', away: 'أثناء غياب المالك', worked: 'ساعات عمل المكتب',
    why: 'لماذا يناسب هذا الأعمال الصغيرة', awayLegend: 'أثناء غياب المالك', aroundLegend: 'بحضور المالك',
    ofHours: (a, b) => `<b>${a}</b> من <b>${b}</b> ساعة`,
    source: (f, t) => `أحصاها التطبيق من ${f} إلى ${t}. الإنفاق هو كل ما كلّفه الفريق في تلك الفترة.`,
    made: 'صُنع باستخدام Don\'t Be Michael', version: 'الإصدار', more: (n) => `و${n} آخرون`,
    band: { email: 'رسالة منظّمة', task: 'مهمة منجزة', away: 'ساعة عمل أثناء غياب المالك', sent: 'رسالة مرسلة', check: 'فحص مجدول' },
    spend: (d) => `للفريق كله، طوال ${d} يومًا`,
    member: { email: 'رسالة', sent: 'مرسلة', task: 'مهمة', check: 'فحص', routed: 'طلب موجّه' },
    typeIn: (t, c) => (t && c ? `${t} في ${c}` : t || c), aBusiness: 'نشاط تجاري صغير', theOwner: 'المالك', ownerOf: (b) => `المالك، ${b}`,
    headline: {
      email: (w, d) => ({ before: `تولّى المكتب الذكي لدى ${w}`, after: `رسالة خلال ${d} يومًا` }),
      task: (w, d) => ({ before: `أنجز المكتب الذكي لدى ${w}`, after: `مهمة خلال ${d} يومًا` }),
      away: (w) => ({ before: `عمل المكتب الذكي لدى ${w}`, after: 'ساعة أثناء غياب المالك' }),
      sent: (w, d) => ({ before: `أرسل المكتب الذكي لدى ${w}`, after: `رسالة خلال ${d} يومًا` }),
      check: (w, d) => ({ before: `أجرى المكتب الذكي لدى ${w}`, after: `فحصًا مجدولًا خلال ${d} يومًا` })
    },
    stripLabel: (a, b, f, t) => `ساعات عمل المكتب كل يوم من ${f} إلى ${t}؛ ${a} من ${b} ساعة أثناء غياب المالك`,
    locked: 'من Pulse، لا يمكن تعديله'
  },
  'zh-CN': {
    caseStudy: '客户案例', theBusiness: '关于这家企业', theTeam: '团队', away: '老板不在时', worked: '办公室工作时长',
    why: '为什么小企业应该这样做', awayLegend: '老板不在时', aroundLegend: '老板在场时',
    ofHours: (a, b) => `<b>${b}</b> 小时中有 <b>${a}</b> 小时`,
    source: (f, t) => `由应用统计，${f} 至 ${t}。花费为团队在此期间的全部成本。`,
    made: '使用 Don\'t Be Michael 制作', version: '版本', more: (n) => `另有 ${n} 位`,
    band: { email: '封邮件已整理', task: '项任务已完成', away: '小时在老板不在时工作', sent: '封邮件已发送', check: '次定时检查' },
    spend: (d) => `整个团队，${d} 天合计`,
    member: { email: '封邮件', sent: '封已发', task: '项任务', check: '次检查', routed: '项已分派' },
    typeIn: (t, c) => (t && c ? `${c}的${t}` : t || c), aBusiness: '一家小企业', theOwner: '老板', ownerOf: (b) => `${b} 老板`,
    headline: {
      email: (w, d) => ({ before: `${w}的 AI 办公室在 ${d} 天内处理了`, after: '封邮件' }),
      task: (w, d) => ({ before: `${w}的 AI 办公室在 ${d} 天内完成了`, after: '项任务' }),
      away: (w) => ({ before: `老板不在时，${w}的 AI 办公室工作了`, after: '小时' }),
      sent: (w, d) => ({ before: `${w}的 AI 办公室在 ${d} 天内发送了`, after: '封邮件' }),
      check: (w, d) => ({ before: `${w}的 AI 办公室在 ${d} 天内运行了`, after: '次定时检查' })
    },
    stripLabel: (a, b, f, t) => `${f} 至 ${t} 每天的办公室工作时长；${b} 小时中有 ${a} 小时在老板不在时`,
    locked: '来自 Pulse，不可编辑'
  }
};

/** Who the page is about: the name, or the type and city with D8 off. */
export function subjectOf(facts: Pick<CaseStudyFacts, 'lang' | 'showName' | 'businessName' | 'businessType' | 'city'>): string {
  const w = WORDS[facts.lang];
  if (facts.showName && facts.businessName?.trim()) return facts.businessName.trim();
  return w.typeIn(facts.businessType?.trim() ?? '', facts.city?.trim() ?? '') || w.aBusiness;
}

/** The built in headline words for a figure, used when the draft gives none
 *  or gives one that breaks the one number rule. */
export function builtInHeadline(facts: CaseStudyFacts, k: HeadlineFigure): { before: string; after: string } {
  // Inside a sentence an English type reads "a bakery in Austin".
  const named = facts.showName && !!facts.businessName?.trim();
  const who = facts.lang === 'en' && !named ? lowerFirst(subjectOf(facts), true) : subjectOf(facts);
  return WORDS[facts.lang].headline[k](who, facts.range.days);
}

function lowerFirst(s: string, article: boolean): string {
  const t = s.charAt(0).toLowerCase() + s.slice(1);
  return article && !/^(a|an|the) /i.test(t) ? `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}` : t;
}

/** The quote's signature (D6, D8). */
export function quoteSignature(facts: CaseStudyFacts): string {
  const w = WORDS[facts.lang];
  if (!facts.showName || !facts.businessName?.trim()) return w.theOwner;
  return facts.ceoName?.trim() ? `${facts.ceoName.trim()}, ${facts.businessName.trim()}` : w.ownerOf(facts.businessName.trim());
}

/** With D8 off, text that still names the business or its website (a warning, not a block). */
export function namesBusiness(text: string, facts: Pick<CaseStudyFacts, 'businessName' | 'website'>): boolean {
  const t = text.toLowerCase();
  const name = facts.businessName?.trim().toLowerCase();
  const host = (facts.website ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return !!((name && name.length > 2 && t.includes(name)) || (host && host.length > 3 && t.includes(host)));
}

// ---------------------------------------------------------------- the draft (D5, D13, D16)

const LANG_NAME: Record<CaseLang, string> = { en: 'English', ar: 'Arabic', 'zh-CN': 'Simplified Chinese' };

/** The draft prompt, from CaseStudyFacts only. The name and website are in it
 *  only with D8 on; the CEO's name never is. */
export function draftPrompt(facts: CaseStudyFacts): string {
  const c = CAPS[facts.lang];
  const lines: string[] = [];
  const add = (label: string, v: string | undefined) => { if (v && v.trim()) lines.push(`${label}: ${v.trim()}`); };
  if (facts.showName) { add('Business name', facts.businessName); add('Website', facts.website); }
  add('Business type', facts.businessType);
  add('City', facts.city);
  add('Industry', facts.industry);
  add('Service area', facts.serviceArea);
  add('Hours', facts.hours);
  add('Languages served', facts.languages);
  add('What the business offers', facts.offer);
  const team = facts.members.slice(0, TEAM_ROWS).map((m) => {
    const bits = [`id ${m.id}`, `role ${m.role || 'team member'}`];
    if (m.roleDescription) bits.push(`description: ${m.roleDescription}`);
    if (m.jobs.length) bits.push(`scheduled jobs: ${m.jobs.slice(0, 5).join('; ')}`);
    if (m.isMichael) bits.push('runs the office and routes the work');
    return `- ${bits.join(', ')}`;
  });
  const figs = headlineChoices(facts.figures);
  return [
    'You write short parts of a one page case study about a small business that uses an AI office team. A person will read and edit every word before anything is sent.',
    `Write in ${LANG_NAME[facts.lang]}.`,
    'Rules:',
    '- Use only the facts below. Name no customer, no supplier and no person.',
    '- Write no numbers at all: no digits, no number words, no amounts such as "dozens" or "half". The app adds the measured numbers itself.',
    '- Plain, concrete words. No hype, no exclamation marks.',
    '',
    'Facts:',
    ...lines,
    'Team:',
    ...team,
    '',
    'Reply with one JSON object and nothing else:',
    `{"subtitle": "one line about the business and its AI team, at most ${c.subtitle} characters",`,
    ` "about": "what the business does and what office work it had, at most ${c.about} characters",`,
    ` "why": "why a small business like this should have an AI office team, at most ${c.why} characters",`,
    ` "headlines": {${figs.map((k) => `"${k}": "headline words with {n} where the measured ${k === 'away' ? 'hours while the owner was away' : `count of ${k === 'email' ? 'emails organized' : k === 'task' ? 'tasks finished' : k === 'sent' ? 'emails sent' : 'scheduled checks'}`} goes"`).join(', ')}},`,
    ` "team": {"<id>": "what that member does for this business, at most ${c.teamLine} characters"}}`,
    'Each headline holds {n} exactly once and names the business as it appears in the facts (or its type and city when no name is given).'
  ].join('\n');
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A drafted part: one line, capped, and refused when it holds a number (D4). */
function part(v: unknown, max: number, lang: CaseLang): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = oneLine(v);
  if (!t || hasNumber(t, lang)) return undefined;
  return cutText(t, max);
}

/**
 * The model's reply as draft parts. Each part is checked on its own, so one
 * bad part leaves the others; a headline must hold `{n}` exactly once and no
 * other number (eng pass). Unparsable replies give an empty draft.
 */
export function parseDraft(reply: string, facts: CaseStudyFacts): CaseDraft {
  const out: CaseDraft = { headlines: {}, team: {} };
  const a = reply.indexOf('{'), b = reply.lastIndexOf('}');
  if (a < 0 || b <= a) return out;
  let j: Record<string, unknown>;
  try { j = JSON.parse(reply.slice(a, b + 1)) as Record<string, unknown>; } catch { return out; }
  if (!j || typeof j !== 'object') return out;
  const c = CAPS[facts.lang];
  const subtitle = part(j.subtitle, c.subtitle, facts.lang); if (subtitle) out.subtitle = subtitle;
  const about = part(j.about, c.about, facts.lang); if (about) out.about = about;
  const why = part(j.why, c.why, facts.lang); if (why) out.why = why;
  const hl = j.headlines && typeof j.headlines === 'object' ? j.headlines as Record<string, unknown> : {};
  for (const k of headlineChoices(facts.figures)) {
    const v = hl[k];
    if (typeof v !== 'string') continue;
    const pieces = oneLine(v).split('{n}');
    if (pieces.length !== 2) continue;
    const [before, after] = pieces.map((p) => p.trim());
    if (hasNumber(before, facts.lang) || hasNumber(after, facts.lang) || (before + after).length > c.headlineWords || !(before || after)) continue;
    out.headlines[k] = { before, after };
  }
  const team = j.team && typeof j.team === 'object' ? j.team as Record<string, unknown> : {};
  for (const m of facts.members.slice(0, TEAM_ROWS)) {
    const line = part(team[m.id], c.teamLine, facts.lang);
    if (line) out.team[m.id] = line;
  }
  return out;
}

/** Parts the draft left out, so main can redraft once (eng pass). */
export function missingParts(d: CaseDraft, facts: CaseStudyFacts): string[] {
  const miss: string[] = [];
  if (!d.subtitle) miss.push('subtitle');
  if (!d.about) miss.push('about');
  if (!d.why) miss.push('why');
  for (const k of headlineChoices(facts.figures)) if (!d.headlines[k]) miss.push(`headline:${k}`);
  for (const m of facts.members.slice(0, TEAM_ROWS)) if (!d.team[m.id]) miss.push(`team:${m.id}`);
  return miss;
}

/** A second draft fills what the first left out; nothing the first gave is replaced. */
export function mergeDrafts(first: CaseDraft, second: CaseDraft): CaseDraft {
  return {
    subtitle: first.subtitle ?? second.subtitle,
    about: first.about ?? second.about,
    why: first.why ?? second.why,
    headlines: { ...second.headlines, ...first.headlines },
    team: { ...second.team, ...first.team }
  };
}

/** The edits a fresh screen starts from: the draft, built in headline words
 *  where it gave none, and a member's stored role description where it gave
 *  no team line (design review, Pass 2). */
export function startingEdits(facts: CaseStudyFacts, draft: CaseDraft, figure?: HeadlineFigure): CaseStudyEdits {
  const choices = headlineChoices(facts.figures);
  const k = figure && choices.includes(figure) ? figure : choices[0];
  const team: Record<string, string> = {};
  for (const m of facts.members.slice(0, TEAM_ROWS)) {
    const t = draft.team[m.id] ?? (m.roleDescription ? cutText(oneLine(m.roleDescription), CAPS[facts.lang].teamLine) : '');
    team[m.id] = t;
  }
  return {
    headline: k ? { figure: k, ...(draft.headlines[k] ?? builtInHeadline(facts, k)) } : null,
    subtitle: draft.subtitle ?? '',
    about: draft.about ?? '',
    quote: '',
    team,
    why: draft.why ?? ''
  };
}

/** Clean edits from the screen: every part a string within its cap, the
 *  headline's figure one the period has, and no typed number in the headline's
 *  words (D20). Returns the reason when the headline breaks that rule. */
export function cleanEdits(facts: CaseStudyFacts, raw: unknown): { edits: CaseStudyEdits; headlineNumber: boolean } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = CAPS[facts.lang];
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? cutText(v.replace(/\s+/g, ' ').trim(), max) : '');
  const h = r.headline && typeof r.headline === 'object' ? r.headline as Record<string, unknown> : null;
  const choices = headlineChoices(facts.figures);
  const figure = h && typeof h.figure === 'string' && (choices as string[]).includes(h.figure) ? h.figure as HeadlineFigure : null;
  const before = h ? str(h.before, c.headlineWords) : '';
  const after = h ? str(h.after, c.headlineWords) : '';
  const team: Record<string, string> = {};
  const rt = r.team && typeof r.team === 'object' ? r.team as Record<string, unknown> : {};
  for (const m of facts.members.slice(0, TEAM_ROWS)) team[m.id] = str(rt[m.id], c.teamLine);
  return {
    edits: {
      headline: figure ? { figure, before, after } : null,
      subtitle: str(r.subtitle, c.subtitle),
      about: str(r.about, c.about),
      quote: str(r.quote, c.quote),
      team,
      why: str(r.why, c.why)
    },
    headlineNumber: hasNumber(before, facts.lang) || hasNumber(after, facts.lang)
  };
}

// ---------------------------------------------------------------- the page

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The page is laid out in a box 1/1.2 of the paper and zoomed to it, so its
 *  type sits close to the approved mockup's proportions (drawn at 612 by 792
 *  for Letter) while the fullest page still fits (case-study-pdf.electron.test). */
const PAGE_ZOOM = 1.2;
const PAPER: Record<Paper, { w: number; h: number; css: string }> = {
  letter: { w: 680, h: 880, css: 'letter' },
  a4: { w: 661, h: 935, css: 'A4' }
};

/** The long date of a YYYY-MM-DD day, in the page's language. */
export function dayLabel(day: string, lang: CaseLang, year = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat(lang === 'zh-CN' ? 'zh-CN' : lang === 'ar' ? 'ar' : 'en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), numberingSystem: 'latn' }).format(dt);
}

function initials(s: string): string {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || 'M';
}

/** The Struck M mark (branding/logo/mark/struck-m-light.svg), inline. */
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" aria-hidden="true" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="1" y="14" width="1" height="1" fill="#FF6B6B"/><rect x="1" y="15" width="1" height="1" fill="#FF6B6B"/><rect x="2" y="3" width="1" height="1" fill="#1A1320"/><rect x="2" y="4" width="1" height="1" fill="#1A1320"/><rect x="2" y="5" width="1" height="1" fill="#1A1320"/><rect x="2" y="6" width="1" height="1" fill="#1A1320"/><rect x="2" y="7" width="1" height="1" fill="#1A1320"/><rect x="2" y="8" width="1" height="1" fill="#1A1320"/><rect x="2" y="9" width="1" height="1" fill="#1A1320"/><rect x="2" y="10" width="1" height="1" fill="#1A1320"/><rect x="2" y="11" width="1" height="1" fill="#1A1320"/><rect x="2" y="12" width="1" height="1" fill="#1A1320"/><rect x="2" y="13" width="1" height="1" fill="#FF6B6B"/><rect x="2" y="14" width="1" height="1" fill="#FF6B6B"/><rect x="3" y="3" width="1" height="1" fill="#1A1320"/><rect x="3" y="4" width="1" height="1" fill="#1A1320"/><rect x="3" y="5" width="1" height="1" fill="#1A1320"/><rect x="3" y="6" width="1" height="1" fill="#1A1320"/><rect x="3" y="7" width="1" height="1" fill="#1A1320"/><rect x="3" y="8" width="1" height="1" fill="#1A1320"/><rect x="3" y="9" width="1" height="1" fill="#1A1320"/><rect x="3" y="10" width="1" height="1" fill="#1A1320"/><rect x="3" y="11" width="1" height="1" fill="#1A1320"/><rect x="3" y="12" width="1" height="1" fill="#FF6B6B"/><rect x="3" y="13" width="1" height="1" fill="#FF6B6B"/><rect x="4" y="3" width="1" height="1" fill="#1A1320"/><rect x="4" y="4" width="1" height="1" fill="#1A1320"/><rect x="4" y="11" width="1" height="1" fill="#FF6B6B"/><rect x="4" y="12" width="1" height="1" fill="#FF6B6B"/><rect x="5" y="4" width="1" height="1" fill="#1A1320"/><rect x="5" y="5" width="1" height="1" fill="#1A1320"/><rect x="5" y="10" width="1" height="1" fill="#FF6B6B"/><rect x="5" y="11" width="1" height="1" fill="#FF6B6B"/><rect x="6" y="5" width="1" height="1" fill="#1A1320"/><rect x="6" y="6" width="1" height="1" fill="#1A1320"/><rect x="6" y="9" width="1" height="1" fill="#FF6B6B"/><rect x="6" y="10" width="1" height="1" fill="#FF6B6B"/><rect x="7" y="6" width="1" height="1" fill="#1A1320"/><rect x="7" y="7" width="1" height="1" fill="#1A1320"/><rect x="7" y="8" width="1" height="1" fill="#FF6B6B"/><rect x="7" y="9" width="1" height="1" fill="#FF6B6B"/><rect x="8" y="6" width="1" height="1" fill="#1A1320"/><rect x="8" y="7" width="1" height="1" fill="#FF6B6B"/><rect x="8" y="8" width="1" height="1" fill="#FF6B6B"/><rect x="9" y="5" width="1" height="1" fill="#1A1320"/><rect x="9" y="6" width="1" height="1" fill="#FF6B6B"/><rect x="9" y="7" width="1" height="1" fill="#FF6B6B"/><rect x="10" y="4" width="1" height="1" fill="#1A1320"/><rect x="10" y="5" width="1" height="1" fill="#FF6B6B"/><rect x="10" y="6" width="1" height="1" fill="#FF6B6B"/><rect x="11" y="3" width="1" height="1" fill="#1A1320"/><rect x="11" y="4" width="1" height="1" fill="#FF6B6B"/><rect x="11" y="5" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="3" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="4" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="5" width="1" height="1" fill="#1A1320"/><rect x="12" y="6" width="1" height="1" fill="#1A1320"/><rect x="12" y="7" width="1" height="1" fill="#1A1320"/><rect x="12" y="8" width="1" height="1" fill="#1A1320"/><rect x="12" y="9" width="1" height="1" fill="#1A1320"/><rect x="12" y="10" width="1" height="1" fill="#1A1320"/><rect x="12" y="11" width="1" height="1" fill="#1A1320"/><rect x="12" y="12" width="1" height="1" fill="#1A1320"/><rect x="12" y="13" width="1" height="1" fill="#1A1320"/><rect x="13" y="2" width="1" height="1" fill="#FF6B6B"/><rect x="13" y="3" width="1" height="1" fill="#FF6B6B"/><rect x="13" y="4" width="1" height="1" fill="#1A1320"/><rect x="13" y="5" width="1" height="1" fill="#1A1320"/><rect x="13" y="6" width="1" height="1" fill="#1A1320"/><rect x="13" y="7" width="1" height="1" fill="#1A1320"/><rect x="13" y="8" width="1" height="1" fill="#1A1320"/><rect x="13" y="9" width="1" height="1" fill="#1A1320"/><rect x="13" y="10" width="1" height="1" fill="#1A1320"/><rect x="13" y="11" width="1" height="1" fill="#1A1320"/><rect x="13" y="12" width="1" height="1" fill="#1A1320"/><rect x="13" y="13" width="1" height="1" fill="#1A1320"/><rect x="14" y="1" width="1" height="1" fill="#FF6B6B"/><rect x="14" y="2" width="1" height="1" fill="#FF6B6B"/></svg>';

export interface PageOptions {
  /** @font-face rules for Sora and IBM Plex Mono (main reads the bundled files). */
  fontCss: string;
}

/**
 * The page as one HTML document (D15 outcome first). The preview and the PDF
 * both draw this, so they match, and both are read only: the owner changes
 * the words in the screen's panel (D22). The headline's number is always
 * filled from the figures, between its words (D16).
 */
export function pageHtml(facts: CaseStudyFacts, edits: CaseStudyEdits, opts: PageOptions): string {
  const w = WORDS[facts.lang];
  const f = facts.figures;
  const pal = facts.showName && facts.palette ? facts.palette : INK_PALETTE;
  const rtl = facts.lang === 'ar';
  const paper = PAPER[facts.paper];
  const from = dayLabel(facts.range.from, facts.lang);
  const to = dayLabel(facts.range.to, facts.lang, true);

  const head = edits.headline;
  const headline = head
    ? `<h1 class="headline"><span>${esc(head.before)}</span> <span class="lock" aria-label="${esc(`${fmtCount(figureValue(f, head.figure))}, ${w.locked}`)}">${fmtCount(figureValue(f, head.figure))}</span> <span>${esc(head.after)}</span></h1>`
    : '';

  const metaBits = facts.showName
    ? [w.typeIn(facts.businessType ?? '', facts.city ?? ''), facts.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean)
    : [];
  const logo = facts.showName
    ? `<div class="logo">${facts.logo && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(facts.logo) ? `<img src="${facts.logo}" alt="">` : esc(initials(facts.businessName ?? ''))}</div>`
    : '';

  const band = bandFigures(f).map((k) => `<div class="stat"><div class="n">${fmtCount(figureValue(f, k))}</div><div class="l">${esc(w.band[k])}</div></div>`);
  band.push(`<div class="stat"><div class="n">${fmtUsd(f.spendUsd)}</div><div class="l">${esc(w.spend(facts.range.days))}</div></div>`);

  const rows = facts.members.slice(0, TEAM_ROWS).map((m) => `<div class="t-row"><span><b>${esc(m.name)}</b><span class="t-role">${esc(m.role)}</span></span><span>${esc(edits.team[m.id] ?? '')}</span><span class="t-n">${m.figure ? `${fmtCount(m.figure.count)} ${esc(w.member[m.figure.kind])}` : ''}</span></div>`);
  const more = facts.members.length - TEAM_ROWS;
  if (more > 0) rows.push(`<div class="t-more">${esc(w.more(more))}</div>`);

  const awayH = hoursOf(f.awayMs), ranH = hoursOf(f.ranMs);
  const max = Math.max(1, ...facts.days.map((d) => d.ms));
  const bars = facts.days.map((d) => {
    const h = (d.ms / max) * 100;
    const a = d.ms > 0 ? (d.awayMs / d.ms) * 100 : 0;
    return `<div class="bar" style="height:${h.toFixed(1)}%"><div class="run" style="flex:${(100 - a).toFixed(1)}"></div><div class="aw" style="flex:${a.toFixed(1)}"></div></div>`;
  }).join('');
  const strip = ranH > 0 ? `<section class="awaybox">
      <div class="away-head"><div class="h">${esc(awayH > 0 ? w.away : w.worked)}</div>${awayH > 0 ? `<div class="big">${w.ofHours(fmtCount(awayH), fmtCount(ranH))}</div>` : ''}</div>
      <div class="strip" role="img" aria-label="${esc(w.stripLabel(fmtCount(awayH), fmtCount(ranH), from, to))}">${bars}</div>
      <div class="strip-x"><span>${esc(from)}</span><span>${esc(dayLabel(facts.range.to, facts.lang))}</span></div>
      ${awayH > 0 ? `<div class="legend"><span><i class="k-aw"></i>${esc(w.awayLegend)}</span><span><i class="k-run"></i>${esc(w.aroundLegend)}</span></div>` : ''}
    </section>` : '';

  const quote = edits.quote
    ? `<figure class="quote"><blockquote>${esc(edits.quote)}</blockquote><figcaption>${esc(quoteSignature(facts))}</figcaption></figure>`
    : '';

  return `<!doctype html><html lang="${facts.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(w.caseStudy)}</title><style>
${opts.fontCss}
@page{size:${paper.css};margin:0}
:root{--hero:${pal.hero};--tint:${pal.tint};--hline:${pal.line};--aw:${pal.away};--hl:${pal.highlight}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
body{font-family:Sora,"PingFang SC","Noto Sans SC","SF Arabic","Noto Sans Arabic",system-ui,sans-serif;color:#1E1B2E;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mono,.t-n,.big b,.strip-x{font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:0}
.page{width:${paper.w}px;height:${paper.h}px;zoom:${PAGE_ZOOM};overflow:hidden;display:flex;flex-direction:column;background:#fff}
.hero{background:var(--hero);color:#fff;padding:26px 40px 22px}
.hero-top{display:flex;align-items:center;gap:12px}
.logo{width:46px;height:46px;border-radius:11px;background:#fff;display:grid;place-items:center;font-weight:700;font-size:16px;color:var(--hero);flex:none;overflow:hidden}
.logo img{max-width:40px;max-height:40px;object-fit:contain}
.biz{font-weight:600;font-size:14px;line-height:18px}
.biz-meta{font-size:10.5px;line-height:14px;color:rgba(255,255,255,.82)}
.eyebrow{margin-top:18px;font-weight:600;font-size:9px;line-height:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.78)}
.headline{margin-top:5px;font-weight:600;font-size:26px;line-height:32px;letter-spacing:-.03em;max-width:580px}
/* The headline's number: its own font, no box, a light tint of the hero (D23). */
.lock{font-weight:700;color:var(--hl);white-space:nowrap}
.sub{margin-top:8px;font-size:11.5px;line-height:17px;color:rgba(255,255,255,.9);max-width:560px;min-height:17px}
.band{background:var(--tint);display:grid;grid-template-columns:repeat(${band.length},1fr);padding:14px 40px 10px;border-bottom:1px solid var(--hline)}
/* The band's numbers in the page's Sora: a mono comma left a gap ("4, 874"). */
.stat .n{font-weight:600;font-size:26px;line-height:30px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.stat .l{font-size:10px;line-height:13px;color:#4A4660;margin-top:2px}
.stat+.stat{padding-inline-start:14px;border-inline-start:1px solid var(--hline)}
.band-src{grid-column:1/-1;margin-top:8px;font-size:9px;line-height:12px;color:#5E5A76}
.body{padding:14px 40px 10px;display:flex;flex-direction:column;gap:10px;flex:1;min-height:0}
.h{font-weight:600;font-size:9px;line-height:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--hero);margin-bottom:5px}
.cols{display:grid;grid-template-columns:1.25fr 1fr;gap:26px;align-items:start}
.cols.solo{grid-template-columns:1fr}
.p{font-size:11px;line-height:16.5px;min-height:16.5px}
.quote{position:relative;padding-top:14px}
.quote::before{content:"\\201C";position:absolute;inset-inline-start:-4px;top:-14px;font-weight:600;font-size:48px;line-height:1;color:var(--aw)}
.quote blockquote{font-weight:500;font-size:13px;line-height:19px;letter-spacing:-.015em;min-height:19px}
.quote figcaption{margin-top:6px;font-size:10px;line-height:14px;color:#5E5A76}
.t-row{display:grid;grid-template-columns:128px 1fr 74px;gap:8px;align-items:baseline;padding:3px 0;border-bottom:1px solid #F0EFF5;font-size:10.5px;line-height:14.5px}
.t-row>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t-row:last-child{border-bottom:none}
.t-row b{font-weight:600}
.t-role{color:#5E5A76;font-size:9.5px;margin-inline-start:5px}
.t-n{text-align:end;font-weight:500;font-size:10px;color:var(--hero)}
.t-more{font-size:10px;color:#5E5A76;padding-top:3px}
.away-head{display:flex;align-items:baseline;justify-content:space-between}
.away-head .h{margin:0}
.big{font-size:11px;line-height:15px}
.big b{font-weight:500;font-size:13px}
.strip{display:flex;align-items:flex-end;gap:3px;height:28px;margin-top:6px;border-bottom:1px solid #DAD7EA}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;border-radius:2px 2px 0 0;overflow:hidden;min-height:1px}
.bar .run{background:#E4E1EC}
.bar .aw{background:var(--aw)}
.strip-x{display:flex;justify-content:space-between;font-size:8.5px;line-height:11px;color:#5E5A76;margin-top:3px}
.legend{display:flex;gap:12px;font-size:9px;line-height:12px;color:#4A4660;margin-top:4px}
.legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-inline-end:4px;vertical-align:-1px}
.k-aw{background:var(--aw)}.k-run{background:#E4E1EC}
.why{background:var(--tint);border-radius:10px;padding:8px 14px}
.foot{flex:none;padding:9px 40px;display:flex;align-items:center;gap:8px;font-size:9px;line-height:12px;color:#5E5A76;border-top:1px solid #E8E6F2}
.foot .url{margin-inline-start:auto;font-family:"IBM Plex Mono",monospace;font-weight:500;color:#1E1B2E}
</style></head><body><article class="page" aria-label="${esc(w.caseStudy)}">
<header class="hero">
  ${facts.showName ? `<div class="hero-top">${logo}<div><div class="biz">${esc(facts.businessName ?? '')}</div><div class="biz-meta">${esc(metaBits.join(' · '))}</div></div></div>` : `<div class="biz">${esc(subjectOf(facts))}</div>`}
  <div class="eyebrow">${esc(w.caseStudy)}</div>
  ${headline}
  <div class="sub">${esc(edits.subtitle)}</div>
</header>
<section class="band">${band.join('')}<div class="band-src">${esc(w.source(from, to))}</div></section>
<div class="body">
  <div class="cols${quote ? '' : ' solo'}"><section><div class="h">${esc(w.theBusiness)}</div><div class="p">${esc(edits.about)}</div></section>${quote}</div>
  <section><div class="h">${esc(w.theTeam)}</div><div class="team">${rows.join('')}</div></section>
  ${strip}
  <section class="why"><div class="h">${esc(w.why)}</div><div class="p">${esc(edits.why)}</div></section>
</div>
<footer class="foot">${MARK}<span>${esc(w.made)} · ${esc(w.version)} ${esc(facts.appVersion)}</span><span class="url">dontbemichael.com</span></footer>
</article></body></html>`;
}

/** The email that carries the page, in the app's language only (D10, D11). */
export function caseStudyEmail(facts: CaseStudyFacts): { subject: string; body: string } {
  const who = subjectOf(facts);
  if (facts.lang === 'ar') {
    return {
      subject: `دراسة حالة: ${who}`,
      body: `مرفق دراسة حالة ${who} المعدّة باستخدام Don't Be Michael.\n\nيجوز لـ Don't Be Michael نشر هذه الدراسة على موقعه، وسيحذفها إذا طلبت ذلك. يكفي الرد على هذه الرسالة لطلب الحذف.`
    };
  }
  if (facts.lang === 'zh-CN') {
    return {
      subject: `客户案例：${who}`,
      body: `附件是 ${who} 使用 Don't Be Michael 制作的客户案例。\n\nDon't Be Michael 可以在其网站上发布此案例，并会在我要求时将其删除。回复此邮件要求删除即可。`
    };
  }
  return {
    subject: `Case study: ${who}`,
    body: `Attached is the case study for ${who}, made with Don't Be Michael.\n\nDon't Be Michael may publish this on its website, and will take it down if I ask. A reply to this email asking for removal is enough.`
  };
}
