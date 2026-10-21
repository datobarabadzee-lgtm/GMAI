import { curatorWritesEnabled, loadCuratedMap } from '@/server/medications/curation';
import { errorReply, reply } from '@/server/medications/http';

export const runtime = 'nodejs';

/** Decisions in force (shipped with this deployment) and any entries rejected by validation. */
export async function GET() {
  try {
    const m = await loadCuratedMap(true);
    return reply({ entries: [...m.valid.values()], invalid: m.invalid, localWrite: curatorWritesEnabled() }, null);
  } catch (e) {
    return errorReply(e, null);
  }
}
