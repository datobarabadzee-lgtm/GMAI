import { z } from 'zod';
import { targetCheck } from '@/server/medications/curation';
import { errorReply, medLimit, reply } from '@/server/medications/http';

export const runtime = 'nodejs';
const Body = z.object({ target: z.string().min(2).max(200) });

/** Does this exact name exist in the FDA index with selectable products? Exact match only. */
export async function POST(req: Request) {
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, null, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return reply({ error: 'BAD_REQUEST' }, null, { status: 400 });
  try {
    return reply(await targetCheck(b.data.target.trim()), null);
  } catch (e) {
    return errorReply(e, null);
  }
}
