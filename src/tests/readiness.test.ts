import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { checkEnv, ENV_VARS } from '@/server/env-check';

/**
 * F14/F17/F18/F06 (audit 2026-10-21): liveness vs readiness, env schema,
 * release identity, and the manifest's agreement with what git tracks.
 */

describe('liveness and readiness', () => {
  it('liveness never claims the provider works; readiness reports configured and reachable separately', async () => {
    const { GET } = await import('@/app/api/health/route');
    const live = await (await GET()).json();
    expect(live.status).toBe('alive');
    expect(live).not.toHaveProperty('engine');
    expect(live.counts.interactionDrugProfiles).toBeGreaterThan(0);
    expect(live.medicationCatalog.fdaLabelRecords).toBeGreaterThan(100000);

    const { readiness } = await import('@/server/readiness');
    const r = await readiness();
    expect(r.checks.find((c) => c.name === 'release_manifest')!.status).toBe('pass');
    expect(r.checks.find((c) => c.name === 'runtime_assets')!.status).toBe('pass');
    expect(r.ai.reachable).toBeNull(); // not probed unless asked
    expect(r.checks.find((c) => c.name === 'limit_store')!.detail).toMatch(/memory: per-process/);
  });

  it('readiness fails when a runtime asset is missing', async () => {
    const { checkRuntimeAssets } = await import('@/server/release');
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'node_modules', '.tmp-ready-'));
    try {
      const r = checkRuntimeAssets(tmp);
      expect(r.ok).toBe(false);
      expect(r.missing.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the version endpoint gives a content-derived release id and no secrets', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-' + 'x'.repeat(40);
    const { GET } = await import('@/app/api/version/route');
    const body = await (await GET()).text();
    delete process.env.OPENAI_API_KEY;
    const j = JSON.parse(body);
    expect(j.releaseId).toMatch(/^gmai-\d+\.\d+\.\d+-[0-9a-f]{8}-[0-9a-f]{8}$/);
    expect(j.counts.medicationIndexFiles).toBe(515);
    expect(body).not.toMatch(/sk-test/);
  });
});

describe('environment schema', () => {
  it('documents every environment variable the code reads', () => {
    const used = new Set(execSync("grep -rhoE 'process\\.env\\.[A-Z0-9_]+' src scripts next.config.mjs", { encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => l.replace('process.env.', '')));
    const platform = new Set(['NODE_ENV', 'HTTPS_PROXY', 'VERCEL', 'VERCEL_GIT_COMMIT_SHA']);
    const documented = new Set(ENV_VARS.map((v) => v.name));
    const undocumented = [...used].filter((n) => !platform.has(n) && !documented.has(n));
    expect(undocumented).toEqual([]);
  });

  it('reports presence only and fails on what the profile requires', () => {
    const secret = 'sk-live-' + 'q'.repeat(40);
    const r = checkEnv({ APP_TIER: 'public', OPENAI_API_KEY: secret }, { hosting: 'self_hosted' });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.ok).toBe(false);
    expect(r.findings.find((f) => f.name === 'PUBLIC_ORIGIN')!.level).toBe('error');
    expect(checkEnv({ APP_TIER: 'public', OPENAI_API_KEY: secret }, { hosting: 'vercel' }).ok).toBe(true);
    // BYOK-only host needs its own receipt secret.
    const byok = checkEnv({ APP_TIER: 'public', PUBLIC_ORIGIN: 'https://x.test' }, { hosting: 'self_hosted' });
    expect(byok.findings.find((f) => f.name === 'MED_RECEIPT_SECRET')!.level).toBe('error');
    expect(checkEnv({ APP_TIER: 'internl' }, { hosting: 'vercel' }).findings.find((f) => f.name === 'APP_TIER')!.level).toBe('error');
    expect(checkEnv({ APP_TIER: 'internal', OPERATOR_TOKEN: 'short' }, { hosting: 'vercel' }).findings.find((f) => f.name === 'OPERATOR_TOKEN')!.level).toBe('error');
  });

  it('.env.example lists every documented variable and carries no values for secrets', () => {
    const ex = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    for (const v of ENV_VARS) {
      expect(ex, v.name).toMatch(new RegExp(`^#?\\s?${v.name}=`, 'm'));
      if (v.secret) expect(ex).toMatch(new RegExp(`^#?\\s?${v.name}=$`, 'm'));
    }
  });
});

const isGit = (() => {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

// Outside a git checkout (the release ZIP, the Docker image) this is reported
// as skipped; there the clean-restore check (release:verify) proves the set.
describe.runIf(isGit)('release manifest and the repository (F06)', () => {
  it('lists exactly the files git tracks, including all 515 medication index files', () => {
    const tracked = execSync('git ls-files -c -o --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    const listed = JSON.parse(execSync(`node -e "import('./scripts/release-manifest.mjs').then(m=>console.log(JSON.stringify(m.listFiles())))"`, { encoding: 'utf8' })) as string[];
    // .gitignore / .dockerignore / vercel.json: host metadata, not release content (release-manifest.mjs METADATA).
    expect(listed).toEqual(tracked.filter((f) => fs.existsSync(f) && f !== '.gitignore' && f !== '.dockerignore' && f !== 'vercel.json'));
    expect(tracked.filter((f) => f.startsWith('knowledge/medications/data/')).length).toBe(515);
    expect(tracked).toContain('.env.example');
    expect(tracked.some((f) => /^\.env(\.local)?$/.test(f))).toBe(false);
  });
});

describe('release scripts on a Windows-style path with spaces', () => {
  it('release-manifest.mjs runs from a folder whose name contains spaces („georgian expert AI“)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'georgian expert AI '));
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.copyFileSync(path.join(process.cwd(), 'scripts/release-manifest.mjs'), path.join(dir, 'scripts/release-manifest.mjs'));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.1' }));
      const out = execSync(`node "${path.join(dir, 'scripts/release-manifest.mjs')}" --out "${path.join(dir, 'm.json')}"`, { encoding: 'utf8' });
      expect(out).toMatch(/gmai-0\.0\.1-/);
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'm.json'), 'utf8')).files.map((f: { path: string }) => f.path)).toEqual(['package.json', 'scripts/release-manifest.mjs']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

