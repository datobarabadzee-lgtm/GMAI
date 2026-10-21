#!/usr/bin/env node
/**
 * RELEASE MANIFEST (audit F06/F17, 2026-10-21)
 *
 *   node scripts/release-manifest.mjs                    → writes release-manifest.json
 *   node scripts/release-manifest.mjs --out FILE         → writes FILE
 *   node scripts/release-manifest.mjs --verify FILE      → compares this tree with FILE, exit 1 on any difference
 *
 * The manifest lists every file of the release (the same set git tracks: the
 * walk below mirrors .gitignore, and a test checks that the two agree) with its
 * SHA-256 and size, grouped into source and runtime assets, plus the counts a
 * restore must reproduce (e.g. 515 medication index files). The release id is
 * derived from the content, not from the host, so the same files give the same
 * id on Vercel, in Docker and on a workstation. No secrets: .env files other
 * than the templates are excluded by the same rules as .gitignore.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Mirrors .gitignore. Paths are relative, with forward slashes. */
const IGNORE_DIR = new Set(['node_modules', '.next', 'out', 'coverage', '.vercel', 'screenshots', 'release-out', '.git']);
const IGNORE_ROOT_DIR = new Set(['data', 'knowledge-source', 'mnt']);
// Host metadata, not release content: .gitignore and .dockerignore are dropped
// by hosting uploads (the Vercel CLI never sends them), and Vercel rewrites
// vercel.json during its build (measured: +16 bytes). Including them would give
// the same commit different ids on different hosts.
export const METADATA = new Set(['.gitignore', '.dockerignore', 'vercel.json']);
const IGNORE_FILE = (rel, base) =>
  METADATA.has(rel) ||
  base.endsWith('.tsbuildinfo') ||
  rel === 'next-env.d.ts' ||
  rel === 'eval-report.json' ||
  rel === 'release-manifest.json' ||
  rel === 'RELEASE_MANIFEST.json' ||
  (base === '.env' || (base.startsWith('.env.') && base !== '.env.example' && base !== '.env.local.template')) ||
  /\.sqlite(-wal|-shm)?$/.test(base) ||
  base.endsWith('.zip');

export function listFiles(root = ROOT) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORE_DIR.has(e.name) || (!rel && IGNORE_ROOT_DIR.has(e.name))) continue;
        walk(path.join(dir, e.name), r);
      } else if (e.isFile() && !IGNORE_FILE(r, e.name)) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

const RUNTIME = /^(knowledge|authored|public)\//;

export function buildManifest(root = ROOT) {
  const files = listFiles(root).map((rel) => {
    const buf = fs.readFileSync(path.join(root, rel));
    return { path: rel, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), kind: RUNTIME.test(rel) ? 'runtime_asset' : 'source' };
  });
  const digest = (list) => crypto.createHash('sha256').update(list.map((f) => `${f.sha256}  ${f.path}\n`).join('')).digest('hex');
  const source = files.filter((f) => f.kind === 'source');
  const assets = files.filter((f) => f.kind === 'runtime_asset');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  let commit = process.env.RELEASE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null;
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = null;
    }
  }
  const sourceSha256 = digest(source);
  const assetsSha256 = digest(assets);
  const count = (re) => files.filter((f) => re.test(f.path)).length;
  return {
    schema: 'gmai-release-manifest/1',
    releaseId: `gmai-${pkg.version}-${sourceSha256.slice(0, 8)}-${assetsSha256.slice(0, 8)}`,
    version: pkg.version,
    commit,
    node: pkg.engines?.node ?? null,
    totals: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), sourceFiles: source.length, runtimeAssetFiles: assets.length },
    digests: { sourceSha256, assetsSha256, releaseSha256: digest(files) },
    counts: {
      medicationIndexFiles: count(/^knowledge\/medications\/data\//),
      medicationNameShards: count(/^knowledge\/medications\/data\/names\//),
      medicationRecordShards: count(/^knowledge\/medications\/data\/records\//),
      emaIndexFiles: count(/^knowledge\/medications\/ema\//),
      authoredFiles: count(/^authored\//),
    },
    files,
  };
}

function verify(expectedFile, root = ROOT) {
  const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
  const actual = buildManifest(root);
  const exp = new Map(expected.files.map((f) => [f.path, f.sha256]));
  const act = new Map(actual.files.map((f) => [f.path, f.sha256]));
  const missing = [...exp.keys()].filter((p) => !act.has(p));
  const extra = [...act.keys()].filter((p) => !exp.has(p));
  const changed = [...exp.keys()].filter((p) => act.has(p) && act.get(p) !== exp.get(p));
  const ok = !missing.length && !extra.length && !changed.length;
  const report = { ok, expectedReleaseId: expected.releaseId, actualReleaseId: actual.releaseId, counts: actual.counts, missing, extra, changed };
  console.log(JSON.stringify(report, null, 2));
  return ok;
}

// pathToFileURL: a path with spaces (e.g. „georgian expert AI“) is percent-encoded in import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  if (at('--verify')) process.exit(verify(at('--verify'), at('--root') ?? ROOT) ? 0 : 1);
  const out = at('--out') ?? path.join(ROOT, 'release-manifest.json');
  const m = buildManifest(at('--root') ?? ROOT);
  fs.writeFileSync(out, JSON.stringify(m, null, 1));
  // Diagnostics: list source files with size and hash (no content) to compare two hosts.
  if (process.env.RELEASE_MANIFEST_DEBUG === '1') for (const f of m.files) if (f.kind === 'source') console.log(`${f.sha256.slice(0, 12)} ${f.bytes} ${f.path}`);
  console.log(`${m.releaseId}  files=${m.totals.files}  medicationIndexFiles=${m.counts.medicationIndexFiles}  → ${out}`);
}
