import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The release this process is serving (audit F17). release-manifest.json is
 * written by `npm run build` (prebuild → scripts/release-manifest.mjs) from the
 * files themselves, so the same files give the same release id on every host.
 */
export type ReleaseManifest = {
  schema: string;
  releaseId: string;
  version: string;
  commit: string | null;
  totals: { files: number; bytes: number; sourceFiles: number; runtimeAssetFiles: number };
  digests: { sourceSha256: string; assetsSha256: string; releaseSha256: string };
  counts: Record<string, number>;
  files: { path: string; bytes: number; sha256: string; kind: 'source' | 'runtime_asset' }[];
};

let cached: ReleaseManifest | null | undefined;

export function releaseManifest(): ReleaseManifest | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release-manifest.json'), 'utf8')) as ReleaseManifest;
  } catch {
    cached = null;
  }
  return cached;
}

/** Public, non-secret summary (no file list). */
export function releaseSummary() {
  const m = releaseManifest();
  if (!m) return { releaseId: 'unknown (release-manifest.json missing — run npm run build)', version: null, commit: null, digests: null, counts: null, totals: null };
  return { releaseId: m.releaseId, version: m.version, commit: m.commit, digests: m.digests, counts: m.counts, totals: m.totals };
}

/**
 * Runtime assets the server reads at run time: each must be present with the
 * size the manifest records. Sizes are cheap to check on every readiness call;
 * a full hash comparison is `npm run release:verify -- release-manifest.json`.
 */
export function checkRuntimeAssets(root = process.cwd()): { ok: boolean; checked: number; missing: string[]; sizeMismatch: string[] } {
  const m = releaseManifest();
  if (!m) return { ok: false, checked: 0, missing: ['release-manifest.json'], sizeMismatch: [] };
  const required = m.files.filter((f) => f.kind === 'runtime_asset' && f.path.startsWith('knowledge/'));
  const missing: string[] = [];
  const sizeMismatch: string[] = [];
  for (const f of required) {
    try {
      if (fs.statSync(path.join(root, f.path)).size !== f.bytes) sizeMismatch.push(f.path);
    } catch {
      missing.push(f.path);
    }
  }
  return { ok: !missing.length && !sizeMismatch.length, checked: required.length, missing: missing.slice(0, 20), sizeMismatch: sizeMismatch.slice(0, 20) };
}

export function __resetReleaseCache() {
  cached = undefined;
}
