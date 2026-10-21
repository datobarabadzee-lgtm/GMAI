import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { appTier } from '@/lib/tier';

/**
 * OPERATOR AUTHORISATION for state-changing administrative requests
 * (audit F18, 2026-10-21).
 *
 * A request may change application state (the curated medication map, source
 * ingestion) only when ALL of these hold:
 *   1. the deployment is the internal tier (APP_TIER=internal set explicitly) —
 *      public data is immutable at runtime;
 *   2. OPERATOR_TOKEN is configured on the server (≥ 32 characters);
 *   3. the request carries it: `Authorization: Bearer <token>`;
 *   4. a browser request is same-origin (the Origin header, when present, must
 *      match PUBLIC_ORIGIN, or the request's own host when PUBLIC_ORIGIN is unset).
 * A localhost hostname, a missing VERCEL variable or a forwarded header are
 * not authorisation.
 */

export type OperatorCheck = { ok: true } | { ok: false; status: 401 | 403; error: string; messageKa: string };

const digest = (s: string) => createHash('sha256').update(s).digest();

export function operatorConfigured(): boolean {
  return (process.env.OPERATOR_TOKEN ?? '').length >= 32;
}

export function checkOperator(req: Request): OperatorCheck {
  if (appTier() !== 'internal') return { ok: false, status: 403, error: 'PUBLIC_READ_ONLY', messageKa: 'საჯარო ვერსიაში მონაცემების შეცვლა შეუძლებელია.' };
  const token = process.env.OPERATOR_TOKEN ?? '';
  if (token.length < 32) return { ok: false, status: 403, error: 'OPERATOR_NOT_CONFIGURED', messageKa: 'ოპერატორის გასაღები (OPERATOR_TOKEN) სერვერზე კონფიგურირებული არ არის — ჩაწერა გამორთულია.' };
  const origin = req.headers.get('origin');
  if (origin) {
    let expected: string;
    try {
      expected = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : new URL(req.url).host;
    } catch {
      return { ok: false, status: 403, error: 'ORIGIN_REJECTED', messageKa: 'მოთხოვნის წყარო უარყოფილია.' };
    }
    let got = '';
    try {
      got = new URL(origin).host;
    } catch {
      got = '';
    }
    if (got !== expected) return { ok: false, status: 403, error: 'ORIGIN_REJECTED', messageKa: 'მოთხოვნის წყარო უარყოფილია (cross-origin).' };
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m || !timingSafeEqual(digest(m[1].trim()), digest(token))) return { ok: false, status: 401, error: 'OPERATOR_AUTH_REQUIRED', messageKa: 'ოპერატორის ავტორიზაცია საჭიროა.' };
  return { ok: true };
}
