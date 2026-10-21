/**
 * Browser-side references to products confirmed on the medication page — one
 * US (openFDA) and one EU (EMA). Only a reference travels (query, record ID,
 * server token); the server re-checks each against its own receipt and this
 * browser's httpOnly session. Nothing here is trusted as "confirmed".
 */
export type Region = 'US' | 'EU';
export type ConfirmedRef = { query: string; recordId: number; token: string; title: string; expires_at: number; region?: Region };

export const MED_KEY = 'gmai.med.confirmed.v1';
export const MED_KEY_EU = 'gmai.med.confirmed.ema.v1';
const keyOf = (r: Region) => (r === 'EU' ? MED_KEY_EU : MED_KEY);

function read(key: string, region: Region): ConfirmedRef | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ConfirmedRef | null;
    return r && typeof r.token === 'string' && r.expires_at > Date.now() ? { ...r, region } : null;
  } catch {
    return null;
  }
}

export function readConfirmedAll(): ConfirmedRef[] {
  return [read(MED_KEY, 'US'), read(MED_KEY_EU, 'EU')].filter((x): x is ConfirmedRef => Boolean(x));
}

export function saveConfirmed(region: Region, ref: Omit<ConfirmedRef, 'region'>) {
  try {
    sessionStorage.setItem(keyOf(region), JSON.stringify(ref));
  } catch {
    /* the page still works without it */
  }
}

export function clearConfirmed(region?: Region) {
  try {
    for (const r of region ? [region] : (['US', 'EU'] as Region[])) sessionStorage.removeItem(keyOf(r));
  } catch {
    /* ignore */
  }
}

/** Request extras: `medConfirmations` (all) and `medConfirmation` (the first, for older servers). */
export function confirmationExtras(refs: ConfirmedRef[]): Record<string, unknown> {
  if (!refs.length) return {};
  const list = refs.map((r) => ({ token: r.token, query: r.query, recordId: r.recordId }));
  return { medConfirmations: list, medConfirmation: list[0] };
}

export const regionKa = (r?: Region) => (r === 'EU' ? 'ევროპა (EMA)' : 'აშშ (FDA)');
