import { searchMedication, validQuery } from '@/server/medications/identity';
import { searchEma, EMA_MSG } from '@/server/medications/ema';
import { errorReply, medLimit, reply, session } from '@/server/medications/http';

export const runtime = 'nodejs';

/** Exact catalog search. Never fuzzy; never returns label text. */
export async function GET(req: Request) {
  const s = session(req);
  const lim = medLimit(req);
  if (!lim.ok) return reply({ error: 'RATE_LIMITED', messageKa: lim.messageKa }, s, { status: 429 });
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  if (!validQuery(q)) return reply({ error: 'BAD_QUERY', messageKa: 'ჩაწერეთ პრეპარატის ზუსტი დასახელება (2–200 სიმბოლო).' }, s, { status: 400 });
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  try {
    const fda = await searchMedication(q, { offset, limit });
    // EU (EMA) is searched separately with the same exact name; nothing links
    // an EMA product to an FDA record. A failure here never hides FDA results.
    let ema = await searchEma(fda.effectiveQuery).catch(() => null);
    if (ema && !ema.total && fda.effectiveQuery !== q) ema = await searchEma(q).catch(() => ema);
    return reply({ ...fda, ema: ema ?? { query: q, total: 0, candidates: [], messageKa: EMA_MSG.unavailable, unavailable: true } }, s);
  } catch (e) {
    return errorReply(e, s);
  }
}
