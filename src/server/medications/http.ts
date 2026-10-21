import 'server-only';
import { NextResponse } from 'next/server';
import { newSession, sessionCookie, sessionFrom } from './receipts';
import { IdentityError, MSG } from './identity';
import { clientKey } from '@/services/rate-limit';

/** Session for medication confirmations: httpOnly cookie, created on first use. */
export function session(req: Request): { sid: string; fresh: boolean } {
  const sid = sessionFrom(req);
  return sid ? { sid, fresh: false } : { sid: newSession(), fresh: true };
}

export function reply(body: unknown, s: { sid: string; fresh: boolean } | null, init: { status?: number } = {}) {
  const res = NextResponse.json(body, { status: init.status ?? 200, headers: { 'cache-control': 'no-store' } });
  if (s?.fresh) res.headers.append('set-cookie', sessionCookie(s.sid));
  return res;
}

/** Package/runtime error codes → status + Georgian message. Nothing falls back to another source. */
export function errorReply(e: unknown, s: { sid: string; fresh: boolean } | null) {
  if (e instanceof IdentityError) return reply({ error: e.code, messageKa: e.messageKa }, s, { status: 409 });
  const code = e instanceof Error ? e.message : 'UNKNOWN';
  const map: Record<string, [number, string]> = {
    IDENTITY_MISMATCH: [409, 'ეს ჩანაწერი ამ დასახელებას არ შეესაბამება — აირჩიეთ ძიების შედეგიდან.'],
    PRODUCT_CONFIRMATION_REQUIRED: [403, 'პროდუქტი დადასტურებული არ არის ან დადასტურების ვადა გავიდა — აირჩიეთ და დაადასტურეთ ხელახლა.'],
    SOURCE_CHANGED_RECONFIRM: [409, 'წყარო შეიცვალა დადასტურების შემდეგ — გადაამოწმეთ და დაადასტურეთ ხელახლა.'],
    SOURCE_NAME_CHANGED: [409, 'წყაროში პროდუქტის დასახელება შეიცვალა — ჩანაწერი არ გამოიყენება.'],
    SOURCE_ID_MISMATCH: [502, 'წყარომ სხვა ჩანაწერი დააბრუნა — უარყოფილია.'],
    SOURCE_GROUP_MISMATCH: [502, 'წყაროს ჯგუფი (set_id) არ ემთხვევა — უარყოფილია.'],
    SOURCE_RATE_LIMITED: [429, `${MSG.unavailable} მოთხოვნების ლიმიტი ამოიწურა.`],
    SOURCE_UNAVAILABLE: [503, MSG.unavailable],
    SOURCE_TOO_LARGE: [502, MSG.unavailable],
    SOURCE_INVALID: [502, MSG.unavailable],
    IDENTITY_INCOMPLETE: [409, 'წყაროში პროდუქტის იდენტობის ველები აკლია — დადასტურება შეუძლებელია.'],
    UNKNOWN_RECORD: [404, 'ჩანაწერი ვერ მოიძებნა.'],
    INVALID_RECORD_ID: [400, 'არასწორი ჩანაწერი.'],
    INVALID_QUERY: [400, 'არასწორი მოთხოვნა.'],
    INVALID_PAGE: [400, 'არასწორი გვერდი.'],
    EMA_UNAVAILABLE: [503, 'ევროპული ინსტრუქცია დროებით ვერ ჩაიტვირთა EMA-ს საიტიდან. სხვა წყაროთი ან მეხსიერებით არ შევავსებთ.'],
    EMA_RATE_LIMITED: [429, 'EMA-ს საიტზე მოთხოვნების ლიმიტი ამოიწურა — სცადეთ ცოტა ხანში.'],
    EMA_PARSE_FAILED: [502, 'ევროპული ინსტრუქციის PDF ვერ დამუშავდა სტანდარტული სტრუქტურით — ტექსტი არ გამოიყენება.'],
    EMA_HOST_REJECTED: [502, 'ევროპული ინსტრუქციის მისამართი უარყოფილია.'],
    EMA_NOT_SELECTABLE: [409, 'ეს EMA-ს ჩანაწერი არ არის მოქმედი რეგისტრაციით ან ინსტრუქცია არ აქვს — ვერ აირჩევა.'],
    DATA_INTEGRITY_FAILURE: [500, 'ლოკალური ინდექსის მთლიანობა ვერ დადასტურდა — ძიება შეჩერებულია.'],
  };
  const [status, messageKa] = map[code] ?? [500, 'მოთხოვნა ვერ შესრულდა.'];
  return reply({ error: code, messageKa }, s, { status });
}

/**
 * Own per-visitor limit for the medication pages (search, cards, preview,
 * confirm, context). They make no model calls, so they do not share the AI
 * budget limiter; browsing a product list must not lock a visitor out of the
 * clinical chat. The upstream FDA quota is protected separately in fda-client.
 */
const MED_PER_MIN = 60;
const MED_PER_DAY = 1500;
const buckets = new Map<string, { min: number[]; day: string; n: number }>();
export function medLimit(req: Request): { ok: true } | { ok: false; messageKa: string } {
  const key = clientKey(req);
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const b = buckets.get(key) ?? { min: [], day, n: 0 };
  if (b.day !== day) Object.assign(b, { day, n: 0 });
  b.min = b.min.filter((t) => now - t < 60_000);
  if (b.min.length >= MED_PER_MIN || b.n >= MED_PER_DAY) return { ok: false, messageKa: 'ძალიან ბევრი მოთხოვნა — სცადეთ ცოტა ხანში.' };
  b.min.push(now);
  b.n += 1;
  buckets.set(key, b);
  if (buckets.size > 20_000) buckets.delete(buckets.keys().next().value as string);
  return { ok: true };
}
