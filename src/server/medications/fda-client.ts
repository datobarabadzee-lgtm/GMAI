import 'server-only';

/**
 * openFDA transport for the medication identity service.
 *
 * Wraps fetch for the package runtime (knowledge/medications/store.mjs) and
 * for the identity-field enrichment in identity.ts. It adds what the runtime
 * leaves to the application:
 *   · fixed host (api.fda.gov, HTTPS only, no redirects) and a 12 s timeout;
 *   · response size cap (8 MB) while reading;
 *   · rate control per server instance (per minute and per day);
 *   · coalescing of identical in-flight requests;
 *   · a size- and TTL-bounded cache of successful bodies. The cache stores raw
 *     bytes only — every caller re-verifies ID, group, name and content hash on
 *     every read, so a cached body is never trusted more than a fresh one.
 * The API key (OPENFDA_API_KEY) is read from the server environment, never
 * cached, logged or sent to the browser; cache keys exclude it.
 */

const HOST = 'api.fda.gov';
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 8_000_000;
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_BYTES = 40_000_000;
const CACHE_MAX_ENTRIES = 300;

type Entry = { at: number; status: number; bytes: Uint8Array };
const cache = new Map<string, Entry>();
let cacheBytes = 0;
const inflight = new Map<string, Promise<Entry>>();

// openFDA: without a key 1,000 requests/day per IP; with a key 120,000/day and
// 240/minute. Limits here are per instance and deliberately below those.
const hasKey = () => Boolean(process.env.OPENFDA_API_KEY);
const PER_MINUTE = () => (hasKey() ? 200 : 60);
const PER_DAY = () => (hasKey() ? 100_000 : 800);
let minute = { at: 0, n: 0 };
let day = { key: '', n: 0 };

export class FdaRateLimited extends Error {}

function take() {
  const now = Date.now();
  if (now - minute.at > 60_000) minute = { at: now, n: 0 };
  const d = new Date().toISOString().slice(0, 10);
  if (day.key !== d) day = { key: d, n: 0 };
  if (minute.n >= PER_MINUTE() || day.n >= PER_DAY()) throw new FdaRateLimited('FDA_RATE_LIMITED');
  minute.n += 1;
  day.n += 1;
}

const cacheKey = (url: URL) => {
  const u = new URL(url.toString());
  u.searchParams.delete('api_key');
  return u.toString();
};

function remember(key: string, e: Entry) {
  if (e.status !== 200 || e.bytes.byteLength > MAX_BYTES) return;
  const old = cache.get(key);
  if (old) cacheBytes -= old.bytes.byteLength;
  cache.set(key, e);
  cacheBytes += e.bytes.byteLength;
  while ((cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) && cache.size) {
    const [k, v] = cache.entries().next().value as [string, Entry];
    cache.delete(k);
    cacheBytes -= v.bytes.byteLength;
  }
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('SOURCE_TOO_LARGE');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/** Test seam: the network call itself. */
let transport: (url: URL, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);
export function setFdaTransport(t: typeof transport | null) {
  transport = t ?? ((url, init) => fetch(url, init));
  resetFdaClient();
}
export function resetFdaClient() {
  cache.clear();
  cacheBytes = 0;
  inflight.clear();
  minute = { at: 0, n: 0 };
  day = { key: '', n: 0 };
}

/** fetch-compatible function handed to MedicationStore. */
export async function fdaFetch(input: URL | string, _init?: RequestInit): Promise<Response> {
  const url = new URL(input.toString());
  if (url.protocol !== 'https:' || url.hostname !== HOST) throw new Error('FDA_HOST_REJECTED');
  if (process.env.DISABLE_LIVE_SOURCES === '1' && transport === defaultTransportRef) throw new Error('SOURCE_UNAVAILABLE');
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return new Response(hit.bytes.slice(), { status: hit.status });

  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      take();
      const res = await transport(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error', headers: { 'user-agent': 'GMAI-LeaderMed/1.0 (medication identity)' } });
      const bytes = await readCapped(res);
      const e: Entry = { at: Date.now(), status: res.status, bytes };
      remember(key, e);
      return e;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const e = await p;
  return new Response(e.status === 204 ? null : e.bytes.slice(), { status: e.status });
}
const defaultTransportRef = transport;

/** GET JSON through the same guards; throws SOURCE_UNAVAILABLE on any non-200. */
export async function fdaJson(path: 'label' | 'ndc', search: string, limit: number): Promise<{ results?: Record<string, unknown>[] }> {
  const url = new URL(`https://${HOST}/drug/${path}.json`);
  url.searchParams.set('search', search);
  url.searchParams.set('limit', String(limit));
  if (process.env.OPENFDA_API_KEY) url.searchParams.set('api_key', process.env.OPENFDA_API_KEY);
  let res: Response;
  try {
    res = await fdaFetch(url);
  } catch (e) {
    if (e instanceof FdaRateLimited) throw new Error('SOURCE_RATE_LIMITED');
    throw new Error((e as Error).message === 'SOURCE_TOO_LARGE' ? 'SOURCE_TOO_LARGE' : 'SOURCE_UNAVAILABLE');
  }
  if (res.status === 404) return { results: [] };
  if (res.status === 429) throw new Error('SOURCE_RATE_LIMITED');
  if (!res.ok) throw new Error('SOURCE_UNAVAILABLE');
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer())));
  } catch {
    throw new Error('SOURCE_INVALID');
  }
}

export const fdaKeyConfigured = hasKey;
