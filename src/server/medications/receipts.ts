import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Server-owned product confirmations.
 *
 * A receipt is created only by /api/medications/confirm after the server has
 * itself fetched and checked the product's identity fields. It lives in server
 * memory, is bound to the visitor's httpOnly session cookie, to one record ID,
 * to the exact normalized query and to the SHA-256 of the source content, and
 * expires after 15 minutes. A token without the matching session, a boolean
 * from the browser or a model's "confirmed=true" resolves to nothing.
 *
 * On Vercel every API route is a separate function with its own memory, so a
 * receipt kept only in memory would be invisible to /api/drug-summary or
 * /api/orchestrate. When a server secret is available the receipt is
 * therefore also SEALED into the token: HMAC-SHA256 over record ID, normalized
 * query, content hash, linked-record hash, expiry and a hash of the session
 * cookie. Only the server can create or verify it; the browser and the model
 * cannot forge or alter it, and it is useless without the same httpOnly
 * session. Secret: MED_RECEIPT_SECRET, else derived (domain-separated) from
 * the existing server-side provider key. Without any secret (local tests) the
 * in-memory store is used.
 */

export type Receipt = {
  record_id: number;
  query_normalized: string;
  content_sha256: string;
  expires_at: number;
  session: string;
  identity: Record<string, unknown>;
  created_at: number;
};

const TTL_MS = 15 * 60 * 1000;
const MAX = 5000;
const receipts = new Map<string, Receipt>();

function sweep(now = Date.now()) {
  for (const [k, r] of receipts) if (r.expires_at <= now) receipts.delete(k);
  while (receipts.size > MAX) receipts.delete(receipts.keys().next().value as string);
}

function secret(): Buffer | null {
  const own = process.env.MED_RECEIPT_SECRET;
  if (own && own.length >= 32) return Buffer.from(own);
  const base = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  return base ? createHmac('sha256', base).update('gmai/medication-receipt/v1').digest() : null;
}
const sidHash = (sid: string) => createHash('sha256').update(`gmai-med-sid:${sid}`).digest('base64url');
const sign = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest('base64url');

export function issueReceipt(r: Omit<Receipt, 'expires_at' | 'created_at'>): { token: string; expires_at: number } {
  sweep();
  const now = Date.now();
  const expires_at = now + TTL_MS;
  const key = secret();
  let token: string;
  if (key) {
    const linked = (r.identity as { linked_sha256?: string | null }).linked_sha256 ?? null;
    const body = Buffer.from(JSON.stringify({ v: 1, r: r.record_id, q: r.query_normalized, c: r.content_sha256, l: linked, e: expires_at, s: sidHash(r.session), n: randomBytes(9).toString('base64url') })).toString('base64url');
    token = `m1.${body}.${sign(key, body)}`;
  } else {
    token = randomBytes(24).toString('base64url');
  }
  receipts.set(token, { ...r, expires_at, created_at: now });
  return { token, expires_at };
}

function unseal(token: string, session: string): Receipt | null {
  const key = secret();
  const m = token.match(/^m1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
  if (!key || !m) return null;
  const expect = Buffer.from(sign(key, m[1]));
  const got = Buffer.from(m[2]);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  let p: { v: number; r: number; q: string; c: string; l: string | null; e: number; s: string };
  try {
    p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (p.v !== 1 || !(p.e > Date.now()) || p.s !== sidHash(session)) return null;
  return { record_id: p.r, query_normalized: p.q, content_sha256: p.c, expires_at: p.e, session, identity: { linked_sha256: p.l }, created_at: p.e - TTL_MS };
}

/** The only path from a token to a receipt. Requires the same session. */
export function resolveReceipt(token: unknown, session: string | null): Receipt | null {
  if (typeof token !== 'string' || token.length < 20 || token.length > 700 || !session) return null;
  if (token.startsWith('m1.')) return unseal(token, session);
  const r = receipts.get(token);
  if (!r) return null;
  if (r.expires_at <= Date.now()) {
    receipts.delete(token);
    return null;
  }
  return r.session === session ? r : null;
}

export function revokeReceipt(token: string) {
  receipts.delete(token);
}

/** Test seam. */
export function resetReceipts() {
  receipts.clear();
}

export const SESSION_COOKIE = 'gmai_med_sid';

export function sessionFrom(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  const m = raw.match(/(?:^|;\s*)gmai_med_sid=([A-Za-z0-9_-]{20,64})/);
  return m ? m[1] : null;
}

export function newSession(): string {
  return randomBytes(24).toString('base64url');
}

export function sessionCookie(sid: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
}
