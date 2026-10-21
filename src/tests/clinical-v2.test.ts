import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Collection gmai_clinical_v2 (emergency medicine / intensive care):
 * importer idempotency, data integrity, media links, search in Georgian and
 * English, whole-section context, and that the material reaches the agent
 * context with deep links — triage, sedation and stroke scenarios.
 */

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public/clinical-v2');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'authored/gmai_clinical_v2/units.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'catalog.json'), 'utf8'));

// Captures exactly what the synthesis model would receive.
const captured: { role: string; content: string }[][] = [];
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const fake = {
    live: true,
    id: 'fake',
    async completeDetailed(req: { messages: { role: string; content: string }[] }) {
      captured.push(req.messages);
      return { text: 'საცნობარო მასალის მიხედვით, შეაფასეთ პაციენტი და მიჰყევით ალგორითმს.', model: 'fake-model', usage: { ...real.EMPTY_USAGE }, latencyMs: 1 };
    },
  };
  return { ...real, getProviderFor: () => ({ provider: fake, ownKey: false }) };
});

describe('gmai_clinical_v2 — imported data', () => {
  it('has the package counts and stable ids', () => {
    const units = corpus.units as { id: string; topic_id: string; section_id: string; status: string; setting: string; items: { id: string }[]; context_unit_ids: string[] }[];
    expect(corpus.collection).toBe('gmai_clinical_v2');
    expect(units.length).toBe(962);
    expect(new Set(units.map((u) => u.id)).size).toBe(962);
    expect(new Set(units.map((u) => u.topic_id)).size).toBe(51);
    expect(new Set(units.map((u) => u.section_id)).size).toBe(702);
    expect(units.reduce((a, u) => a + u.items.length, 0)).toBe(8170);
    const items = units.flatMap((u) => u.items.map((i) => i.id));
    expect(new Set(items).size).toBe(items.length);
    expect(units.filter((u) => u.setting === 'emergency').length).toBe(429);
    expect(units.filter((u) => u.setting === 'intensive_care').length).toBe(533);
  });

  it('keeps every context relation inside its own section and topic', () => {
    const byId = new Map(corpus.units.map((u: { id: string }) => [u.id, u]));
    for (const u of corpus.units as { id: string; section_id: string; context_unit_ids: string[] }[]) {
      expect(u.context_unit_ids).toContain(u.id);
      for (const c of u.context_unit_ids) expect((byId.get(c) as { section_id: string } | undefined)?.section_id).toBe(u.section_id);
    }
  });

  it('resolves every media link to a file in the app storage', () => {
    let n = 0;
    for (const u of corpus.units)
      for (const it of u.items)
        for (const m of it.media) {
          n++;
          expect(m.path.startsWith('/clinical-v2/media/')).toBe(true);
          expect(fs.existsSync(path.join(ROOT, 'public', m.path))).toBe(true);
        }
    expect(n).toBeGreaterThan(0);
    expect(fs.readdirSync(path.join(PUBLIC, 'media')).length).toBe(137);
  });

  it('keeps tables as rows, not flattened text', () => {
    const tables = corpus.units.flatMap((u: { items: { kind: string; rows?: string[][] }[] }) => u.items.filter((i) => i.kind === 'table'));
    expect(tables.length).toBe(39);
    for (const t of tables) expect(t.rows!.length).toBeGreaterThan(0);
  });

  it('splits the student catalog from topic data (light first, topic on demand)', () => {
    expect(fs.statSync(path.join(PUBLIC, 'catalog.json')).size).toBeLessThan(40_000);
    expect(catalog.topics.length).toBe(51);
    for (const t of catalog.topics) expect(fs.existsSync(path.join(PUBLIC, 'topics', `${t.id}.json`))).toBe(true);
    const sum = catalog.topics.reduce((a: number, t: { unitCount: number }) => a + t.unitCount, 0);
    expect(sum).toBe(962);
  });

  it('is never imported into a client bundle', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/knowledge/clinical-v2.ts'), 'utf8');
    expect(src).toMatch(/^import 'server-only';/);
    for (const f of ['library.tsx', 'topic-view.tsx', 'shared.tsx']) {
      const ui = fs.readFileSync(path.join(ROOT, 'src/features/clinical-v2', f), 'utf8');
      expect(ui).not.toMatch(/units\.json|knowledge\/clinical-v2/);
    }
  });
});

const PKG = process.env.CLINICAL_V2_PKG ?? path.resolve(ROOT, '../GMAI_Clinical_Knowledge_L5_v2');
describe.skipIf(!fs.existsSync(path.join(PKG, 'manifest.json')))('gmai_clinical_v2 — importer', () => {
  let out = '';
  beforeAll(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'cv2-'));
  });
  afterAll(() => fs.rmSync(out, { recursive: true, force: true }));
  const run = () => {
    execFileSync('node', [path.join(ROOT, 'scripts/import-clinical-v2.mjs'), PKG, '--out', out], { stdio: 'pipe' });
    return JSON.parse(fs.readFileSync(path.join(out, 'authored/gmai_clinical_v2/import-report.json'), 'utf8'));
  };

  it('inserts on the first run and changes nothing on the second (idempotent upsert)', () => {
    const first = run();
    expect(first.ok).toBe(true);
    expect(first.units.inserted).toBe(962);
    expect(first.errors).toEqual([]);
    expect(first.checksums.mismatched).toEqual([]);
    const second = run();
    expect(second.units).toMatchObject({ inserted: 0, updated: 0, unchanged: 962, retired: 0 });
    expect(second.media).toMatchObject({ copied: 0, unchanged: 137 });
    const units = JSON.parse(fs.readFileSync(path.join(out, 'authored/gmai_clinical_v2/units.json'), 'utf8')).units;
    expect(new Set(units.map((u: { id: string }) => u.id)).size).toBe(962);
  }, 120_000);

  it('does not import training or validation files', () => {
    const r = JSON.parse(fs.readFileSync(path.join(out, 'authored/gmai_clinical_v2/import-report.json'), 'utf8'));
    expect(JSON.stringify(r.not_imported)).toMatch(/validation/);
  });
});

describe('gmai_clinical_v2 — search', async () => {
  const { clinicalV2Search, clinicalV2Context } = await import('@/kb/clinical-v2-search');
  const { retrieveRules } = await import('@/kb/retrieval-service');

  it.each([
    ['ტრიაჟი', 'emergency-ch002'],
    ['ESI', 'emergency-ch002'],
    ['სედაცია', 'resuscitation-ch022'],
    ['ინსულტი', 'resuscitation-ch029'],
    ['მასიური ტრანსფუზია', 'resuscitation-ch016'],
  ])('finds %s in topic %s (Georgian / abbreviation)', async (q, topic) => {
    const { hits } = await clinicalV2Search(q, { limit: 3 });
    expect(hits[0].topic_id).toBe(topic);
  });

  it('finds English clinical terms in the Georgian text', async () => {
    const { hits } = await clinicalV2Search('stroke thrombolysis', { limit: 6 });
    expect(hits.some((h) => h.topic_id === 'resuscitation-ch029' || h.topic_id === 'emergency-ch012')).toBe(true);
    const arrest = await clinicalV2Search('cardiac arrest adrenaline', { limit: 6 });
    expect(arrest.hits.some((h) => h.topic_id === 'emergency-ch005')).toBe(true);
  });

  it('filters by setting without mixing the two', async () => {
    const { hits } = await clinicalV2Search('რთული სასუნთქი გზები', { setting: 'intensive_care', limit: 8 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.setting === 'intensive_care')).toBe(true);
  });

  it('does not ground questions outside the collection', async () => {
    for (const q of ['ჰიპოთირეოზის მკურნალობა', '81 წლის ქალი, AF, eGFR 32 — რომელი ანტიკოაგულანტი?']) {
      const r = await retrieveRules(q, { kinds: ['clinical_unit'], limit: 6 });
      expect(r.coverage).toBe('NOT_COVERED');
      expect(r.hits).toEqual([]);
    }
  });

  it('says plainly that semantic search is not enabled', async () => {
    const { trace } = await clinicalV2Search('სედაცია', { limit: 1 });
    expect(trace.embedding.labelKa).toMatch(/სემანტიკური ძიება ჩართული არ არის/);
  });

  it('hands the model whole sections with the topic path, never a lone dose', async () => {
    const { hits } = await clinicalV2Search('სედაცია', { limit: 2 });
    const ctx = clinicalV2Context(hits, 24000);
    expect(ctx.omittedSectionIds).toEqual([]);
    for (const sid of ctx.sectionIds) {
      const all = corpus.units.filter((u: { section_id: string }) => u.section_id === sid).map((u: { id: string }) => u.id);
      for (const id of all) expect(ctx.text).toContain(`[${id}]`);
    }
    expect(ctx.text).toMatch(/თემის სტრუქტურა/);
    expect(ctx.text).toMatch(/კლინიკური ვალიდაცია არ ჩატარებულა/);
    expect(ctx.text).toContain('/academy/clinical/resuscitation-ch022?u=');
  });

  it('names what does not fit instead of cutting silently', async () => {
    const { hits } = await clinicalV2Search('მასიური ტრანსფუზია', { limit: 6 });
    const ctx = clinicalV2Context(hits, 2500);
    expect(ctx.omittedSectionIds.length + ctx.partialSectionIds.length).toBeGreaterThan(0);
    expect(ctx.text).toMatch(/არ ჩაეტია/);
  });

  it('marks images as unread rather than as facts', () => {
    const withImage = corpus.units.find((u: { items: { media: unknown[] }[] }) => u.items.some((i) => i.media.length));
    return import('@/knowledge/clinical-v2').then(({ unitText, UNIT_BY_ID }) => {
      expect(unitText(UNIT_BY_ID.get(withImage.id)!, { media: true })).toMatch(/ტექსტად არ არის წაკითხული/);
    });
  });
});

describe('gmai_clinical_v2 — reaches the agents (triage, sedation, stroke)', async () => {
  const { orchestrate } = await import('@/services/orchestrator');

  it.each([
    ['როგორ ტარდება ტრიაჟი ემერჯენსიში? ESI დონეები', 'emergency-ch002'],
    ['სედაცია არაინტუბირებულ პაციენტში — რა პრინციპებით?', 'resuscitation-ch022'],
    ['ინსულტის მართვა ინტენსიურ თერაპიაში', 'resuscitation-ch029'],
  ])('%s → context and unit links from %s', async (question, topic) => {
    captured.length = 0;
    const out = await orchestrate({ question, mode: 'deep' });
    // the model received the section text of the matched topic
    const user = captured.flat().find((m) => m.role === 'user')!.content;
    expect(user).toContain('კლინიკური ცოდნის კოლექცია gmai_clinical_v2');
    expect(user).toContain(`[${topic}]`);
    expect(user).toContain(`/academy/clinical/${topic}?u=`);
    // and the system prompt carries the reference-material rules
    expect(captured.flat().find((m) => m.role === 'system')!.content).toMatch(/gmai_clinical_v2/);
    // the answer carries deep links back to the student page
    expect(out.clinicalKnowledge).not.toBeNull();
    expect(out.clinicalKnowledge!.units.some((u) => u.href.startsWith(`/academy/clinical/${topic}?u=${topic}-u`))).toBe(true);
    expect(out.clinicalKnowledge!.contextSectionIds.length).toBeGreaterThan(0);
    expect(out.provenance.some((p) => p.kind === 'clinical_unit')).toBe(true);
  }, 60_000);

  it('keeps patient mode out of the professional reference collection', async () => {
    captured.length = 0;
    const out = await orchestrate({ question: 'ინსულტის ნიშნები', mode: 'patient' });
    expect(out.clinicalKnowledge).toBeNull();
  }, 60_000);

  it('adds nothing for a question outside the collection', async () => {
    const out = await orchestrate({ question: 'ჰიპოთირეოზის მკურნალობა ლევოთიროქსინით', mode: 'quick' });
    expect(out.clinicalKnowledge).toBeNull();
  }, 60_000);
});

describe('gmai_clinical_v2 — public tier access', () => {
  it('leaves the student page and search API public', async () => {
    const { isPublicPage, isPublicApi } = await import('@/lib/tier');
    expect(isPublicPage('/academy/clinical')).toBe(true);
    expect(isPublicPage('/academy/clinical/emergency-ch002')).toBe(true);
    expect(isPublicApi('/api/clinical-v2/search')).toBe(true);
  });
});

describe('gmai_clinical_v2 — section words alone do not ground an answer', async () => {
  const { retrieveRules } = await import('@/kb/retrieval-service');
  it('„ავასტინის უკუჩვენებები" is not grounded in stroke thrombolysis contraindications', async () => {
    for (const q of ['ავასტინის უკუჩვენებები მითხარით', 'უკუჩვენებები', 'რა დოზით']) {
      const r = await retrieveRules(q, { kinds: ['clinical_unit'], limit: 6 });
      expect(r.hits).toEqual([]);
    }
    const ok = await retrieveRules('თრომბოლიზისის უკუჩვენებები ინსულტისას', { kinds: ['clinical_unit'], limit: 6 });
    expect(ok.hits.length).toBeGreaterThan(0);
  });
});
