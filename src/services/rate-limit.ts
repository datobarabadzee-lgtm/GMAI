import 'server-only';
import { MemoryStore, __setCounterStore, counterStore } from '@/services/counter-store';

/**
 * ABUSE AND SPEND PROTECTION
 *
 * The public tier runs without accounts, so there is no user to attribute cost
 * to. That makes the AI endpoints the only place where an anonymous visitor can
 * spend the operator's money.
 *
 * Four limits, each one atomic counter in the shared CounterStore
 * (counter-store.ts, audit F13):
 *   1. per-IP window and per-IP day — stops a single abusive client
 *   2. global requests-per-minute   — stops a distributed burst
 *   3. daily spend cap              — a run first RESERVES its estimated cost
 *      against the cap and settles to the actual cost afterwards, so
 *      concurrent runs cannot overshoot the cap by more than their estimates.
 *
 * Whether this is a site-wide ceiling depends on the store: with LIMIT_STORE
 * unset (memory) every serverless instance counts on its own, and /api/health
 * says so (limits.shared=false). The provider-side budget in the provider
 * account remains the only hard financial ceiling outside this application.
 */

export type LimitVerdict =
  | { ok: true; remaining: number; reservation: Reservation | null }
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
  /** Cost reserved against the cap when an AI run starts, settled to the actual cost afterwards. */
  reserveUsdPerRun: num(process.env.AI_RESERVE_USD_PER_RUN, 0.03),
};

const today = () => new Date().toISOString().slice(0, 10);
const MICRO = 1_000_000;
const DAY_TTL = 2 * 86_400;

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

export type Reservation = { day: string; micro: number };
export type LimitOk = { ok: true; remaining: number; reservation: Reservation | null };

const BUDGET_KA =
  'დღევანდელი უფასო ლიმიტი ამოიწურა. სერვისი უფასოა და დღიური ბიუჯეტით შეზღუდული — სცადეთ ხვალ, ან მიამაგრეთ თქვენი საკუთარი API გასაღები პარამეტრებში და იმუშავეთ შეზღუდვის გარეშე.';

/**
 * @param ownKey true when the caller supplied their own provider key, in which
 *   case they are spending their own money: the budget cap does not apply and
 *   the request allowance is larger. Abuse limits still apply.
 * @param reserveUsd estimated cost of the run, reserved against the daily cap
 *   before it starts; settle it with recordSpend(actual, reservation).
 */
export async function checkLimit(req: Request, opts: { ownKey?: boolean; reserveUsd?: number } = {}): Promise<LimitVerdict> {
  const s = counterStore();
  const now = Date.now();
  const day = today();
  const capMicro = Math.round(LIMITS.dailyBudgetUsd * MICRO);
  const spendKey = `gmai:spend:${day}`;

  // Budget first: if the day's money is gone, nothing else matters.
  if (!opts.ownKey && (await s.get(spendKey)) >= capMicro) return { ok: false, reason: 'budget', retryAfterSec: 3600, messageKa: BUDGET_KA };

  const ip = clientKey(req);
  const perWindow = opts.ownKey ? LIMITS.ipPerWindow * 3 : LIMITS.ipPerWindow;
  const perDay = opts.ownKey ? LIMITS.ipPerDay * 5 : LIMITS.ipPerDay;
  const win = Math.floor(now / (LIMITS.windowSec * 1000));
  const taken: [string, number][] = [];
  const undo = async () => {
    for (const [k, by] of taken) await s.incrWithin(k, -by, Number.MAX_SAFE_INTEGER, 1);
  };

  const w = await s.incrWithin(`gmai:ip:${ip}:w:${win}`, 1, perWindow, LIMITS.windowSec * 2);
  if (!w.ok) return { ok: false, reason: 'ip', retryAfterSec: LIMITS.windowSec, messageKa: `ძალიან ბევრი მოთხოვნა მოკლე დროში. დაელოდეთ ${LIMITS.windowSec} წამს.` };
  taken.push([`gmai:ip:${ip}:w:${win}`, 1]);

  const d = await s.incrWithin(`gmai:ip:${ip}:d:${day}`, 1, perDay, DAY_TTL);
  if (!d.ok) {
    await undo();
    return { ok: false, reason: 'ip', retryAfterSec: 3600, messageKa: 'დღიური ლიმიტი ამ მოწყობილობისთვის ამოიწურა. სცადეთ ხვალ, ან მიამაგრეთ საკუთარი API გასაღები.' };
  }
  taken.push([`gmai:ip:${ip}:d:${day}`, 1]);

  const minute = Math.floor(now / 60_000);
  const g = await s.incrWithin(`gmai:global:${minute}`, 1, LIMITS.globalPerMinute, 120);
  if (!g.ok) {
    await undo();
    return { ok: false, reason: 'global', retryAfterSec: 30, messageKa: 'სისტემა ამჟამად გადატვირთულია. სცადეთ ნახევარ წუთში.' };
  }
  taken.push([`gmai:global:${minute}`, 1]);

  let reservation: Reservation | null = null;
  if (!opts.ownKey && opts.reserveUsd && opts.reserveUsd > 0) {
    const micro = Math.round(opts.reserveUsd * MICRO);
    const r = await s.incrWithin(spendKey, micro, capMicro, DAY_TTL);
    if (!r.ok) {
      await undo();
      return { ok: false, reason: 'budget', retryAfterSec: 3600, messageKa: BUDGET_KA };
    }
    reservation = { day, micro };
  }

  return { ok: true, remaining: perWindow - w.value, reservation };
}

/**
 * Called after a run with what it actually cost. With a reservation, the
 * difference between the estimate and the actual cost is settled (a failed
 * run settles to 0 and releases its reservation).
 */
export async function recordSpend(usd: number, reservation: Reservation | null = null) {
  const actual = Number.isFinite(usd) && usd > 0 ? Math.round(usd * MICRO) : 0;
  const day = reservation?.day ?? today();
  const delta = actual - (reservation?.micro ?? 0);
  if (delta !== 0) await counterStore().incrWithin(`gmai:spend:${day}`, delta, Number.MAX_SAFE_INTEGER, DAY_TTL);
}

export async function spendToday(): Promise<{ day: string; usd: number; capUsd: number; remainingUsd: number }> {
  const day = today();
  const usd = (await counterStore().get(`gmai:spend:${day}`)) / MICRO;
  return { day, usd, capUsd: LIMITS.dailyBudgetUsd, remainingUsd: Math.max(0, LIMITS.dailyBudgetUsd - usd) };
}

export function limitStoreInfo() {
  const s = counterStore();
  return { store: s.kind, shared: s.shared };
}

/** Test seam: a fresh in-memory store. */
export function __resetLimiter() {
  __setCounterStore(new MemoryStore());
}
