import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { appTier } from '@/lib/tier';
import { checkEnv } from '@/server/env-check';
import { checkRuntimeAssets, releaseManifest, releaseSummary } from '@/server/release';
import { counterStore } from '@/services/counter-store';

/**
 * READINESS (audit F14, 2026-10-21)
 *
 * Liveness (/api/health) says the process answers. Readiness (/api/health/ready)
 * says whether this release can serve: its data are present and match the
 * manifest, its environment is valid, its counter store answers. Each external
 * dependency is reported on two separate axes:
 *
 *   configured — the setting exists (cheap, always checked)
 *   reachable  — a real request succeeded (only with ?probe=1, cached 10 min,
 *                because a probe costs a network call)
 *
 * "configured" is never reported as "working".
 */

export type Check = { name: string; status: 'pass' | 'warn' | 'fail'; detail: string };

type Probe = { at: number; reachable: boolean | null; detail: string };
const probes = new Map<string, Probe>();
const PROBE_TTL = 10 * 60_000;

async function probe(name: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<Probe> {
  const hit = probes.get(name);
  if (hit && Date.now() - hit.at < PROBE_TTL) return hit;
  let p: Probe;
  try {
    const r = await fn();
    p = { at: Date.now(), reachable: r.ok, detail: r.detail };
  } catch (e) {
    p = { at: Date.now(), reachable: false, detail: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
  probes.set(name, p);
  return p;
}

export async function readiness(opts: { probe?: boolean } = {}) {
  const checks: Check[] = [];
  const tier = appTier();

  const m = releaseManifest();
  checks.push({ name: 'release_manifest', status: m ? 'pass' : 'fail', detail: m ? m.releaseId : 'release-manifest.json missing (npm run build writes it)' });

  const assets = checkRuntimeAssets();
  checks.push({
    name: 'runtime_assets',
    status: assets.ok ? 'pass' : 'fail',
    detail: assets.ok ? `${assets.checked} files present with manifest sizes (medication index ${m?.counts.medicationIndexFiles ?? '?'})` : `missing ${assets.missing.length}, size mismatch ${assets.sizeMismatch.length}: ${[...assets.missing, ...assets.sizeMismatch].slice(0, 5).join(', ')}`,
  });

  const corpus: [string, boolean][] = [
    ['authored/quality/rules-active.json', fs.existsSync(path.join(process.cwd(), 'authored', 'quality', 'rules-active.json'))],
    ['authored/quality/taxonomy.json', fs.existsSync(path.join(process.cwd(), 'authored', 'quality', 'taxonomy.json'))],
    ['authored/gmai_clinical_v2/units.json', fs.existsSync(path.join(process.cwd(), 'authored', 'gmai_clinical_v2', 'units.json'))],
  ];
  const authored = corpus.filter(([, ok]) => !ok).map(([f]) => f);
  checks.push({ name: 'open_corpus', status: authored.length ? 'fail' : 'pass', detail: authored.length ? `missing: ${authored.join(', ')}` : 'quality corpus and clinical-v2 present' });

  if (tier === 'internal') {
    const db = process.env.KB_DB_PATH ?? path.join(process.cwd(), 'data', 'gmai-kb.sqlite');
    const present = fs.existsSync(/*turbopackIgnore: true*/ db);
    checks.push({ name: 'internal_kb', status: present ? 'pass' : 'warn', detail: present ? 'SQLite knowledge base present' : 'internal SQLite knowledge base not built (npm run kb:import) — clinical-rule retrieval unavailable' });
  }

  const env = checkEnv(process.env, { hosting: process.env.VERCEL ? 'vercel' : 'self_hosted' });
  const errs = env.findings.filter((f) => f.level === 'error').map((f) => f.name);
  const warns = env.findings.filter((f) => f.level === 'warning').map((f) => f.name);
  checks.push({ name: 'environment', status: errs.length ? 'fail' : warns.length ? 'warn' : 'pass', detail: errs.length ? `invalid or missing: ${errs.join(', ')}` : warns.length ? `warnings: ${warns.join(', ')}` : 'valid' });

  const store = counterStore();
  try {
    await store.incrWithin('gmai:ready:probe', 0, 1, 60);
    checks.push({ name: 'limit_store', status: store.shared ? 'pass' : 'warn', detail: store.shared ? `${store.kind}: shared` : `${store.kind}: per-process counters (not a site-wide ceiling)` });
  } catch {
    checks.push({ name: 'limit_store', status: 'fail', detail: `${store.kind}: unreachable` });
  }

  const aiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  const ai: { configured: boolean; reachable: boolean | null; detail: string; byok: true } = { configured: aiConfigured, reachable: null, detail: aiConfigured ? 'not probed' : 'platform key not set — AI only with the caller’s own key', byok: true };
  if (opts.probe && aiConfigured) {
    const base = (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const p = await probe('ai', async () => {
      const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY || process.env.AI_API_KEY}` }, signal: AbortSignal.timeout(4000) });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    });
    ai.reachable = p.reachable;
    ai.detail = p.detail;
  }
  checks.push({ name: 'ai_provider', status: !aiConfigured ? 'warn' : ai.reachable === false ? 'warn' : 'pass', detail: aiConfigured ? `configured; reachable: ${ai.reachable === null ? 'not probed' : ai.reachable ? 'yes' : `no (${ai.detail})`}` : ai.detail });

  const live = process.env.DISABLE_LIVE_SOURCES !== '1';
  const sources: Record<string, { configured: boolean; reachable: boolean | null; detail: string }> = {
    openfda: { configured: live, reachable: null, detail: process.env.OPENFDA_API_KEY ? 'with key' : 'without key (lower quota)' },
    europepmc: { configured: live, reachable: null, detail: '' },
  };
  if (opts.probe && live) {
    const f = await probe('openfda', async () => {
      const r = await fetch('https://api.fda.gov/drug/label.json?limit=1', { signal: AbortSignal.timeout(4000) });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    });
    sources.openfda.reachable = f.reachable;
    const e = await probe('europepmc', async () => {
      const r = await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=aspirin&format=json&pageSize=1', { signal: AbortSignal.timeout(4000) });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    });
    sources.europepmc.reachable = e.reachable;
  }

  const ready = !checks.some((c) => c.status === 'fail');
  return { ready, tier, release: releaseSummary().releaseId, checks, ai, sources, probed: Boolean(opts.probe) };
}
