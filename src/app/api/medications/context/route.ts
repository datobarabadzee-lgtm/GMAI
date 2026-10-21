import { z } from 'zod';
import { confirmedContext, labelSections, validQuery } from '@/server/medications/identity';
import { errorReply, medLimit, reply, session } from '@/server/medications/http';

export const runtime = 'nodejs';
const Body = z.object({ query: z.string(), recordId: z.number().int().positive(), token: z.string().max(700), section: z.string().max(60).optional(), start: z.number().int().min(0).optional() });

/** Confirmed source sections, at most 250 KB per response. Re-verified on every call. */
export async function POST(req: Request) {
  const s = session(req);
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, s, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !validQuery(b.data.query)) return reply({ error: 'BAD_REQUEST' }, s, { status: 400 });
  try {
    const ctx = await confirmedContext(s.fresh ? null : s.sid, b.data.token, b.data.query, b.data.recordId);
    return reply({ identity: ctx.identity, retrieved_at: ctx.retrieved_at, source: ctx.source, ...labelSections(ctx.label, b.data.section, b.data.start ?? 0) }, s);
  } catch (e) {
    return errorReply(e, s);
  }
}
