import { z } from 'zod';
import { confirmProduct, confirmedContext, labelSections, validQuery } from '@/server/medications/identity';
import { errorReply, medLimit, reply, session } from '@/server/medications/http';

export const runtime = 'nodejs';
// The body carries only what the user chose. A "confirmed" flag, a receipt or
// a token in the body is ignored: confirmation is created here, server-side.
const Body = z.object({ query: z.string(), recordId: z.number().int().positive() }).strip();

export async function POST(req: Request) {
  const s = session(req);
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, s, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !validQuery(b.data.query)) return reply({ error: 'BAD_REQUEST' }, s, { status: 400 });
  try {
    const c = await confirmProduct(s.sid, b.data.query, b.data.recordId);
    const ctx = await confirmedContext(s.sid, c.token, b.data.query, b.data.recordId);
    return reply({ token: c.token, expires_at: c.expires_at, identity: ctx.identity, retrieved_at: ctx.retrieved_at, source: ctx.source, ...labelSections(ctx.label), clinical_validation_performed: false, executable_prescription: false }, s);
  } catch (e) {
    return errorReply(e, s);
  }
}
