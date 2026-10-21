import { z } from 'zod';
import { saveDecisions } from '@/server/medications/curation';
import { checkOperator } from '@/server/operator-auth';
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
  substance: z.string().max(200).optional(),
  salt: z.string().max(120).optional(),
  form: z.string().max(120).optional(),
  strength: z.string().max(120).optional(),
  route: z.string().max(80).optional(),
  registration_ref: z.string().max(300).optional(),
  evidence: z.object({ source_url: z.string().max(500), checked: z.string().max(800) }).optional(),
});
const Body = z.object({ decisions: z.array(Decision).min(1).max(2000) });

/**
 * Writes curator decisions into knowledge/medications/curated-map.json.
 * Only on a local run of the app (not the public site): the public site has no
 * persistent storage and no curator login, so there decisions are exported as
 * a file and merged by the operator before the next deployment.
 */
export async function POST(req: Request) {
  // Writes require the internal tier, a configured OPERATOR_TOKEN, the token in
  // the request and a same-origin browser request (operator-auth.ts).
  const auth = checkOperator(req);
  if (!auth.ok) {
    return reply({ error: auth.error, messageKa: auth.error === 'PUBLIC_READ_ONLY' ? 'ონლაინ ვერსიაში ფაილში ჩაწერა შეუძლებელია — გადაწყვეტილებები ინახება ამ ბრაუზერში; ჩამოტვირთეთ ფაილი და გადმოეცით ოპერატორს.' : auth.messageKa }, null, { status: auth.status });
  }
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return reply({ error: 'BAD_REQUEST', messageKa: 'გადაწყვეტილებების ფორმატი არასწორია.' }, null, { status: 400 });
  try {
    return reply(await saveDecisions(b.data.decisions), null);
  } catch (e) {
    return errorReply(e, null);
  }
}
