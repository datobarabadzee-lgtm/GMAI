import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INTERNAL_ONLY_APIS, INTERNAL_ONLY_PREFIXES, PUBLIC_MODES, appTier, isPublicApi, isPublicPage } from '@/lib/tier';
import { NAV } from '@/components/layout/nav';

/** Every clinical module ships in both tiers. */
const SHARED_PAGES = [
  '/', '/clinical', '/case', '/ddx', '/evidence', '/guidelines', '/drugs',
  '/medication-review', '/calculators', '/labs', '/documents', '/quality',
  '/defect', '/patient', '/academy', '/research', '/hospital', '/library', '/about',
];

/** Operator tooling only — it inspects a knowledge base the public tier lacks. */
const INTERNAL_PAGES = ['/admin', '/admin/knowledge', '/admin/retrieval', '/admin/usage', '/dev/ingest'];

/** APIs that work without the knowledge base and are therefore public. */
const SHARED_APIS = ['/api/health', '/api/library', '/api/sources', '/api/orchestrate', '/api/parse', '/api/evidence', '/api/guidelines', '/api/agents'];

describe('public tier boundary', () => {
  it('defaults to the internal tier when APP_TIER is unset', () => {
    const prev = process.env.APP_TIER;
    delete process.env.APP_TIER;
    expect(appTier()).toBe('internal');
    if (prev !== undefined) process.env.APP_TIER = prev;
  });

  it('serves every clinical module in the public tier', () => {
    SHARED_PAGES.forEach((p: string) => expect(isPublicPage(p)).toBe(true));
  });

  it('closes the operator dashboards, which inspect an absent knowledge base', () => {
    INTERNAL_PAGES.forEach((p: string) => expect(isPublicPage(p)).toBe(false));
    INTERNAL_ONLY_PREFIXES.forEach((p) => expect(isPublicPage(p)).toBe(false));
  });

  it('serves every API that works without the knowledge base', () => {
    SHARED_APIS.forEach((p: string) => expect(isPublicApi(p)).toBe(true));
  });

  it('closes the knowledge-base and usage-ledger APIs', () => {
    INTERNAL_ONLY_APIS.forEach((p) => expect(isPublicApi(p)).toBe(false));
  });

  it('reaches every clinical mode publicly', () => {
    ['quick', 'deep', 'evidence', 'challenge', 'missing', 'quality', 'second-opinion', 'patient', 'academy'].forEach(
      (m) => expect((PUBLIC_MODES as readonly string[]).includes(m)).toBe(true),
    );
  });

  it('shows the whole navigation in both tiers', () => {
    expect(NAV.every((n) => isPublicPage(n.href))).toBe(true);
    // A hardcoded total broke every time a screen was added, which trained the
    // reflex to bump the number rather than ask whether the entry belonged.
    // The invariants that matter: nothing disappears, and every link resolves.
    expect(NAV.length).toBeGreaterThanOrEqual(19);
  });

  it('points every navigation entry at a page that exists', () => {
    for (const item of NAV) {
      const dir = item.href === '/' ? 'src/app/page.tsx' : `src/app${item.href}/page.tsx`;
      expect(fs.existsSync(dir), `missing page for ${item.href}`).toBe(true);
    }
  });
});

describe('knowledge base is unreachable in the public tier', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.APP_TIER;
    process.env.APP_TIER = 'public';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.APP_TIER;
    else process.env.APP_TIER = prev;
  });

  it('reports the knowledge base as absent regardless of any file on disk', async () => {
    const { kbExists } = await import('@/kb/db');
    expect(kbExists()).toBe(false);
  });

  it('refuses to open a connection even if a database file were deployed', async () => {
    const { openDb, KbUnavailableError } = await import('@/kb/db');
    expect(() => openDb()).toThrow(KbUnavailableError);
  });
});

describe('deployment hygiene', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('excludes the corpus and every database artefact from a public deploy', () => {
    const ignore = read('.vercelignore');
    ['knowledge-source/', 'data/', '*.sqlite'].forEach((entry) => expect(ignore).toContain(entry));
  });

  it('ships a manifest that installs as a standalone Georgian app', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('ka');
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('ships every icon the manifest and iOS reference', () => {
    ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'].forEach((f) => {
      expect(fs.existsSync(path.join(process.cwd(), 'public', 'icons', f))).toBe(true);
    });
  });

  it('never lets the service worker cache a clinical answer', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toMatch(/if \(req\.method !== 'GET'\) return;/);
  });
});

describe('direct contact channel', () => {
  it('builds a wa.me link with a digits-only number', async () => {
    const { WHATSAPP_NUMBER, whatsappLink } = await import('@/lib/contact');
    expect(WHATSAPP_NUMBER).toMatch(/^\d+$/);
    expect(whatsappLink()).toBe(`https://wa.me/${WHATSAPP_NUMBER}`);
  });

  it('carries the patient question into the message, url-encoded', async () => {
    const { whatsappLink } = await import('@/lib/contact');
    const link = whatsappLink('გამარჯობა, კითხვა მაქვს: რას ნიშნავს ჩემი დიაგნოზი?');
    expect(link).toContain('?text=');
    expect(decodeURIComponent(link.split('?text=')[1])).toContain('რას ნიშნავს ჩემი დიაგნოზი?');
  });

  it('trims an over-long question at a word boundary rather than mid-word', async () => {
    const { whatsappLink } = await import('@/lib/contact');
    const text = decodeURIComponent(whatsappLink('სიტყვა '.repeat(300)).split('?text=')[1]);
    expect(text.length).toBeLessThanOrEqual(701);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/სიტყ…$/);
  });

  it('offers the channel wherever a public visitor can reach a dead end', () => {
    const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    // The contact channel is part of the shell: sidebar card and the patient menu.
    expect(read('src/components/layout/app-shell.tsx')).toContain('whatsappLink(CONTACT_INTRO_KA)');
    expect(read('src/features/clinical/patient-workspace.tsx')).toContain('AskDoctor');
    expect(read('src/features/home/public-extras.tsx')).toContain('whatsappLink');
  });

  it('bounds uploads on the publicly reachable parse endpoint', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/parse/route.ts'), 'utf8');
    expect(route).toContain('MAX_FILES');
    expect(route).toContain('MAX_FILE_BYTES');
    expect(route).toContain('MAX_TOTAL_BYTES');
    expect(route).toContain('413');
  });

  it('refuses to answer publicly when no model is configured', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/orchestrate/route.ts'), 'utf8');
    expect(route).toContain('AI_NOT_CONFIGURED');
    expect(route).toMatch(/engineStatus\(\)\.engine !== 'live'/);
  });
});

describe('model configuration', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('defaults to the configured model and never escalates to a costlier one implicitly', () => {
    const p = read('src/services/ai-provider.ts');
    expect(p).toContain("process.env.OPENAI_MODEL ?? 'gpt-6-luna'");
    // Both tiers fall back to the same model rather than a hard-coded larger one.
    expect(p).toContain('process.env.AI_MODEL_FAST ?? model');
    expect(p).toContain('process.env.AI_MODEL_REASONING ?? model');
    expect(p).not.toMatch(/reasoning:\s*process\.env\.AI_MODEL_REASONING \?\? 'gpt-4o'/);
  });

  it('uses the Responses API through the official SDK with a bounded output', () => {
    const p = read('src/services/ai-provider.ts');
    expect(p).toContain("import OpenAI from 'openai'");
    expect(p).toContain('this.client.responses.create');
    expect(p).toContain('max_output_tokens');
    expect(p).toContain("reasoning: { effort }");
  });

  it('defaults reasoning effort to low', () => {
    expect(read('src/services/ai-provider.ts')).toContain("effortFrom(process.env.OPENAI_REASONING_EFFORT, 'low')");
  });

  it('keeps the key server-side only', () => {
    const p = read('src/services/ai-provider.ts');
    expect(p).toContain("import 'server-only'");
    // No NEXT_PUBLIC_ variable may ever carry the key.
    expect(p).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN)/);
  });

  it('prices the configured model so cost is not silently reported as zero', async () => {
    const { pricingTable, isPriced, estimateCost } = await import('@/services/metering');
    expect(isPriced('gpt-6-luna')).toBe(true);
    const p = pricingTable().find((x) => x.model === 'gpt-6-luna')!;
    expect(p.inputPerMTok).toBeGreaterThan(0);
    expect(p.outputPerMTok).toBeGreaterThan(p.inputPerMTok);
    // 1M input + 1M output at list price.
    expect(estimateCost('gpt-6-luna', 1_000_000, 0, 1_000_000)).toBeCloseTo(0.6, 5);
  });

  it('counts usage even where no knowledge database exists', async () => {
    const { recordRun, ledgerTotals, resetLedger } = await import('@/services/metering');
    resetLedger();
    recordRun({ model: 'gpt-6-luna', inputTokens: 1000, cachedInputTokens: 200, outputTokens: 500 });
    const row = ledgerTotals().find((r) => r.model === 'gpt-6-luna')!;
    expect(row.totals.runs).toBe(1);
    expect(row.totals.inputTokens).toBe(1000);
    expect(row.totals.costUsd).toBeGreaterThan(0);
    resetLedger();
  });
});

describe('reported interface faults', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('a new conversation is one visible button in the clinical workspace', () => {
    const ws = read('src/features/clinical/workspace.tsx');
    expect(ws).toContain('newConversation');
    expect(ws).toContain('ახალი საუბარი');
    // Follow-ups carry the earlier turns.
    expect(ws).toContain('conversation');
  });

  it('every hospital module opens a module that actually does the work', async () => {
    const { HOSPITAL_MODULES } = await import('@/knowledge/hospital');
    const map = read('src/features/home/hospital-map.tsx');
    HOSPITAL_MODULES.forEach((m) => {
      expect(map, `hospital module ${m.id} has no action`).toContain(`${m.id}`);
    });
    expect(map).toContain('MODULE_ACTIONS');
    expect(map).toContain('გახსენი ეს მოდული');
  });
});

describe('answers stay in Georgian', () => {
  it('detects every script that must never reach a Georgian reader', async () => {
    const { hasForeignScript } = await import('@/services/orchestrator');
    // The exact failure seen in production: Georgian sentence slipping into Armenian.
    expect(hasForeignScript('ორსულობის შემდგომი მეთვალყურეობა և ընդունվող մեդիկամენტები')).toBe(true);
    expect(hasForeignScript('пациент')).toBe(true);
    expect(hasForeignScript('ασθενής')).toBe(true);
    expect(hasForeignScript('患者')).toBe(true);
    expect(hasForeignScript('مريض')).toBe(true);
  });

  it('accepts Georgian with the Latin medical terms the register requires', async () => {
    const { hasForeignScript } = await import('@/services/orchestrator');
    expect(hasForeignScript('CHA₂DS₂-VASc ქულა 5 — ორალური ანტიკოაგულაცია (DOAC) რეკომენდებულია.')).toBe(false);
    expect(hasForeignScript('eGFR 38 მლ/წთ, OHSS გამორიცხვა საჭიროა.')).toBe(false);
  });

  it('retries once and then falls back rather than showing unreadable text', () => {
    const o = fs.readFileSync(path.join(process.cwd(), 'src/services/orchestrator.ts'), 'utf8');
    expect(o).toContain('SCRIPT_CORRECTION_KA');
    expect(o).toContain('attempt < 2');
    expect(o).toContain('script_drift_rejected');
  });
});

describe('patient answers are never invented', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('refuses to interpret the patient\'s own results until the values are supplied', () => {
    const route = read('src/app/api/orchestrate/route.ts');
    expect(route).toContain('NEEDS_PATIENT_DATA');
    expect(route).toContain('needsOwnData');
    // Only own-result interpretation is gated; general questions are answered.
    expect(route).toMatch(/\(ჩემი\|ჩემს\)/);
  });

  it('asks for the missing value in the interface instead of a dead end', () => {
    const w = read('src/features/clinical/patient-workspace.tsx');
    expect(w).toContain('intakeQuestions(text)');
    expect(w).toContain("json.error === 'NEEDS_PATIENT_DATA'");
    expect(w).toContain('missingRequired');
  });

  it('hides governance sources from a clinical answer', () => {
    const w = read('src/features/clinical/patient-workspace.tsx');
    expect(w).toContain("s.source_type !== 'legal'");
    expect(w).toContain("s.source_type !== 'regulatory'");
  });

  it('does not render answer sections that have no content', () => {
    const w = read('src/features/clinical/patient-workspace.tsx');
    expect(w).toContain('.sections ?? []).filter(');
    expect(w).toContain("s.body.trim() !== '—'");
  });
});

describe('citations are relevant or absent', () => {
  it('returns nothing rather than an unrelated source', async () => {
    const { retrieveText } = await import('@/services/retrieval');
    // Nothing in the registry covers haematology, so this must come back empty
    // instead of falling through to the data-protection act.
    const hits = retrieveText('ჰემოგლობინი ფერიტინი MCV რკინადეფიციტური ანემია');
    const titles = hits.map((h) => h.source.title.toLowerCase());
    expect(titles.some((t) => t.includes('personal data') || t.includes('fhir'))).toBe(false);
  });

  it('still finds the right source when the registry does cover the topic', async () => {
    const { retrieveText } = await import('@/services/retrieval');
    const hits = retrieveText('atrial fibrillation anticoagulation stroke prevention');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /atrial fibrillation/i.test(h.source.title))).toBe(true);
  });

  it('never pads results from the whole registry when nothing matches', () => {
    const r = fs.readFileSync(path.join(process.cwd(), 'src/services/retrieval.ts'), 'utf8');
    expect(r).not.toContain('relevant.length ? relevant : hits');
    expect(r).toContain('MIN_RELEVANCE');
  });
});

describe('model calls do not ask the provider to retain data', () => {
  it('sets store: false on every Responses API call', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/services/ai-provider.ts', 'utf8');
    expect(src).toMatch(/responses\.create\([\s\S]{0,400}store: false/);
  });
});
