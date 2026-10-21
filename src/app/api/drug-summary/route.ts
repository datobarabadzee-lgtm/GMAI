import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LIMITS, checkLimit, recordSpend } from '@/services/rate-limit';
import { callerKeyFrom, isPlausibleKey } from '@/services/ai-provider';
import { labelFromSource } from '@/services/drug-labels';
import { summarizeLabelKa } from '@/services/drug-summary';
import { confirmedContext, validQuery } from '@/server/medications/identity';
import { errorReply, session } from '@/server/medications/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Only a product confirmed on the server can be summarised. A name alone is
// refused: the summary is built from the confirmed record's own label.
const Body = z.object({ query: z.string(), recordId: z.number().int().positive(), token: z.string().max(700) });

export async function POST(req: Request) {
  const s = session(req);
  const callerKey = callerKeyFrom(req);
  const ownKey = Boolean(callerKey && isPlausibleKey(callerKey));
  const limited = await checkLimit(req, { ownKey, reserveUsd: LIMITS.reserveUsdPerRun });
  if (!limited.ok) return NextResponse.json({ error: 'RATE_LIMITED', messageKa: limited.messageKa }, { status: 429, headers: { 'retry-after': String(limited.retryAfterSec) } });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !validQuery(b.data.query)) {
    return NextResponse.json({ error: 'PRODUCT_CONFIRMATION_REQUIRED', messageKa: 'ქართული შეჯამება მხოლოდ დადასტურებულ პროდუქტზე მზადდება — ჯერ აირჩიეთ და დაადასტურეთ პროდუქტი.' }, { status: 403 });
  }
  let spentUsd = 0;
  try {
    const ctx = await confirmedContext(s.fresh ? null : s.sid, b.data.token, b.data.query, b.data.recordId);
    if (!ctx.label) return NextResponse.json({ error: 'NO_LINKED_LABEL', messageKa: 'ამ პროდუქტს დადასტურებული ინსტრუქცია არ აქვს დაკავშირებული.' }, { status: 409 });
    const label = labelFromSource(ctx.label, b.data.query);
    const summary = await summarizeLabelKa(label, callerKey, `${ctx.record_id}:${ctx.content_sha256}`);
    if (summary && !ownKey) spentUsd = summary.costUsd;
    return NextResponse.json({ identity: ctx.identity, summary, translation: true, messageKa: summary ? '' : 'ქართული შეჯამება ამჯერად ვერ მომზადდა — ორიგინალი ინსტრუქცია ხელმისაწვდომია.' }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorReply(e, s);
  } finally {
    await recordSpend(spentUsd, limited.reservation);
  }
}
