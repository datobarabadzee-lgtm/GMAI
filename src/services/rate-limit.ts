import 'server-only';

/**
 * ABUSE AND SPEND PROTECTION
 *
 * The public tier runs without accounts, so there is no user to attribute cost
 * to. That makes the AI endpoints the only place where an anonymous visitor can
 * spend the operator's money, and until now nothing stopped a script from
 * calling them in a loop.
 *
 * Three independent limits, cheapest check first:
 *   1. per-IP sliding window       — stops a single abusive client
 *   2. global requests-per-minute  — stops a distributed burst
 *   3. daily estimated-spend cap   — bounds the bill whatever gets through
 *
 * HONEST LIMITATION: this state lives in the serverless instance's memory, so
 * each instance enforces its own counters. It raises the cost of abuse
 * substantially but it is not a distributed guarantee. The only hard financial
 * ceiling is the budget limit set in the provider account itself, and the
 * operator is told so rather than being left to assume this is airtight.
 * Moving to a shared store (Vercel KV / Upstash) makes it exact.
 */

export type LimitVerdict =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'ip' | 'global' | 'budget'; retryAfterSec: number; messageKa: string };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LIMITS = {
  /** AI-backed requests per IP per window. */
  ipPerWindow: num(process.env.RATE_LIMIT_IP_PER_WINDOW, 12),
  windowSec: num(process.env.RATE_LIMIT_WINDOW_SEC, 60),
  /** AI-backed requests per IP per day — blunts slow, patient abuse. */
  ipPerDay: num(process.env.RATE_LIMIT_IP_PER_DAY, 200),
  /** Across all callers on this instance. */
  globalPerMinute: num(process.env.RATE_LIMIT_GLOBAL_PER_MIN, 120),
  /** Estimated USD per day before AI endpoints close. */
  dailyBudgetUsd: num(process.env.DAILY_BUDGET_USD, 5),
};

type Bucket = { hits: number[]; dayCount: number; dayStamp: string };

const buckets = new Map<string, Bucket>();
const globalHits: number[] = [];
let spend = { day: '', usd: 0 };

const today = () => new Date().toISOString().slice(0, 10);

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  const cutoff = now - LIMITS.windowSec * 1000;
  for (const [key, b] of buckets) {
    if (!b.hits.some((t) => t > cutoff) && b.dayStamp !== today()) buckets.delete(key);
  }
}

/** Client address, trusting only the proxy headers the platform sets. */
export function clientKey(req: Request): string {
  const h = req.headers;
  const ip =
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('cf-connecting-ip') ??
    'unknown';
  return ip || 'unknown';
}

/**
 * @param ownKey true when the caller supplied their own provider key, in which
 *   case they are spending their own money: the budget cap does not apply and
 *   the request allowance is larger. Abuse limits still apply, because the
 *   endpoint itself is still ours to protect.
 */
export function checkLimit(req: Request, opts: { ownKey?: boolean } = {}): LimitVerdict {
  const now = Date.now();
  const day = today();
  sweep(now);

  if (spend.day !== day) spend = { day, usd: 0 };

  // 3. Budget first: if the day's money is gone, nothing else matters.
  if (!opts.ownKey && spend.usd >= LIMITS.dailyBudgetUsd) {
    return {
      ok: false,
      reason: 'budget',
      retryAfterSec: 3600,
      messageKa:
        'დღევანდელი უფასო ლიმიტი ამოიწურა. სერვისი უფასოა და დღიური ბიუჯეტით შეზღუდული — სცადეთ ხვალ, ან მიამაგრეთ თქვენი საკუთარი API გასაღები პარამეტრებში და იმუშავეთ შეზღუდვის გარეშე.',
    };
  }

  // 2. Global burst.
  while (globalHits.length && globalHits[0] < now - 60_000) globalHits.shift();
  if (globalHits.length >= LIMITS.globalPerMinute) {
    return {
      ok: false,
      reason: 'global',
      retryAfterSec: 30,
      messageKa: 'სისტემა ამჟამად გადატვირთულია. სცადეთ ნახევარ წუთში.',
    };
  }

  // 1. Per-IP window and per-IP day.
  const key = clientKey(req);
  const bucket = buckets.get(key) ?? { hits: [], dayCount: 0, dayStamp: day };
  if (bucket.dayStamp !== day) {
    bucket.dayStamp = day;
    bucket.dayCount = 0;
  }

  const windowStart = now - LIMITS.windowSec * 1000;
  bucket.hits = bucket.hits.filter((t) => t > windowStart);

  const perWindow = opts.ownKey ? LIMITS.ipPerWindow * 3 : LIMITS.ipPerWindow;
  const perDay = opts.ownKey ? LIMITS.ipPerDay * 5 : LIMITS.ipPerDay;

  if (bucket.hits.length >= perWindow) {
    buckets.set(key, bucket);
    return {
      ok: false,
      reason: 'ip',
      retryAfterSec: LIMITS.windowSec,
      messageKa: `ძალიან ბევრი მოთხოვნა მოკლე დროში. დაელოდეთ ${LIMITS.windowSec} წამს.`,
    };
  }

  if (bucket.dayCount >= perDay) {
    buckets.set(key, bucket);
    return {
      ok: false,
      reason: 'ip',
      retryAfterSec: 3600,
      messageKa:
        'დღიური ლიმიტი ამ მოწყობილობისთვის ამოიწურა. სცადეთ ხვალ, ან მიამაგრეთ საკუთარი API გასაღები.',
    };
  }

  bucket.hits.push(now);
  bucket.dayCount += 1;
  buckets.set(key, bucket);
  globalHits.push(now);

  return { ok: true, remaining: perWindow - bucket.hits.length };
}

/** Called after a run so the day's spend reflects what was actually used. */
export function recordSpend(usd: number) {
  const day = today();
  if (spend.day !== day) spend = { day, usd: 0 };
  if (Number.isFinite(usd) && usd > 0) spend.usd += usd;
}

export function spendToday(): { day: string; usd: number; capUsd: number; remainingUsd: number } {
  const day = today();
  const usd = spend.day === day ? spend.usd : 0;
  return { day, usd, capUsd: LIMITS.dailyBudgetUsd, remainingUsd: Math.max(0, LIMITS.dailyBudgetUsd - usd) };
}

/** Test seam. */
export function __resetLimiter() {
  buckets.clear();
  globalHits.length = 0;
  spend = { day: '', usd: 0 };
}
