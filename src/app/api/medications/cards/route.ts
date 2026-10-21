import { z } from 'zod';
import { enrichCards, validQuery } from '@/server/medications/identity';
import { errorReply, medLimit, reply, session } from '@/server/medications/http';

export const runtime = 'nodejs';
const Body = z.object({ query: z.string(), ids: z.array(z.number().int().positive()).min(1).max(6) });

/** Identity fields for one page of candidates (one batched source request). */
export async function POST(req: Request) {
  const s = session(req);
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, s, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !validQuery(b.data.query)) return reply({ error: 'BAD_REQUEST' }, s, { status: 400 });
  try {
    return reply({ cards: await enrichCards(b.data.query, b.data.ids) }, s);
  } catch (e) {
    return errorReply(e, s);
  }
}
