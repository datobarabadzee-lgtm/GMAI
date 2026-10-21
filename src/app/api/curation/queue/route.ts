import { curationQueue } from '@/server/medications/curation';
import { errorReply, medLimit, reply } from '@/server/medications/http';

export const runtime = 'nodejs';

/** Paged queue of Georgian catalog names for curator review. Never the whole catalog. */
export async function GET(req: Request) {
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, null, { status: 429 });
  const u = new URL(req.url);
  const filter = (['crosswalk', 'no_crosswalk', 'decided', 'all'] as const).find((f) => f === u.searchParams.get('filter')) ?? 'crosswalk';
  try {
    return reply(await curationQueue({ q: (u.searchParams.get('q') ?? '').slice(0, 100), filter, offset: Math.max(0, Number(u.searchParams.get('offset')) || 0), limit: Number(u.searchParams.get('limit')) || 25 }), null);
  } catch (e) {
    return errorReply(e, null);
  }
}
