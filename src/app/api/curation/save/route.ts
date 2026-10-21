import { z } from 'zod';
import { localWriteAllowed, saveDecisions } from '@/server/medications/curation';
import { errorReply, reply } from '@/server/medications/http';

export const runtime = 'nodejs';

const Decision = z.object({
  mis_id: z.string().regex(/^mis-[a-z_]+-[0-9a-f]{20}$/),
  name_ka: z.string().max(300),
  name_en: z.string().max(300),
  kind: z.string().max(40),
  decision: z.enum(['approved', 'rejected']),
  target_query: z.string().max(200).optional(),
  approved_by: z.string().min(2).max(120),
  approved_at: z.string().max(40),
  note: z.string().max(500).optional(),
});
const Body = z.object({ decisions: z.array(Decision).min(1).max(2000) });

/**
 * Writes curator decisions into knowledge/medications/curated-map.json.
 * Only on a local run of the app (not the public site): the public site has no
 * persistent storage and no curator login, so there decisions are exported as
 * a file and merged by the operator before the next deployment.
 */
export async function POST(req: Request) {
  if (!localWriteAllowed(req)) {
    return reply({ error: 'LOCAL_ONLY', messageKa: 'ონლაინ ვერსიაში ფაილში ჩაწერა შეუძლებელია — გადაწყვეტილებები ინახება ამ ბრაუზერში; ჩამოტვირთეთ ფაილი და გადმოეცით ოპერატორს.' }, null, { status: 403 });
  }
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return reply({ error: 'BAD_REQUEST', messageKa: 'გადაწყვეტილებების ფორმატი არასწორია.' }, null, { status: 400 });
  try {
    return reply(await saveDecisions(b.data.decisions), null);
  } catch (e) {
    return errorReply(e, null);
  }
}
