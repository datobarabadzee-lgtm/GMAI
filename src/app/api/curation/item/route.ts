import { curationItem } from '@/server/medications/curation';
import { errorReply, medLimit, reply } from '@/server/medications/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, null, { status: 429 });
  const id = new URL(req.url).searchParams.get('mis_id') ?? '';
  if (!/^mis-[a-z_]+-[0-9a-f]{20}$/.test(id)) return reply({ error: 'BAD_REQUEST' }, null, { status: 400 });
  try {
    const item = await curationItem(id);
    return item ? reply(item, null) : reply({ error: 'NOT_FOUND', messageKa: 'ჩანაწერი ვერ მოიძებნა.' }, null, { status: 404 });
  } catch (e) {
    return errorReply(e, null);
  }
}
