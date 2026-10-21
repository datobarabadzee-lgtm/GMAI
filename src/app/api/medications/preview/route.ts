import { z } from 'zod';
import { previewProduct, validQuery } from '@/server/medications/identity';
import { isEmaRecord, previewEma } from '@/server/medications/ema';
import { errorReply, medLimit, reply, session } from '@/server/medications/http';

export const runtime = 'nodejs';
const Body = z.object({ query: z.string(), recordId: z.number().int().positive() });

/** Identity fields only (name, ingredient/salt, strength, form, route, maker, IDs). No label text. */
export async function POST(req: Request) {
  const s = session(req);
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, s, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !validQuery(b.data.query)) return reply({ error: 'BAD_REQUEST' }, s, { status: 400 });
  try {
    // EMA: one product-information PDF may hold several SmPCs (e.g. tablets and
    // an injection); every one is listed with its own checked identity.
    if (isEmaRecord(b.data.recordId)) {
      const e = await previewEma(b.data.query, b.data.recordId);
      return reply({ identities: e.identities, retrieved_at: e.retrieved_at }, s);
    }
    const p = await previewProduct(b.data.query, b.data.recordId);
    return reply({ identity: p.identity, confirmable: p.identity.complete }, s);
  } catch (e) {
    return errorReply(e, s);
  }
}
