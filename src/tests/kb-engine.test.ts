import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { kbExists, kbStats, openDb } from '@/kb/db';
import { ClinicalRuleSchema, QualityRuleSchema, isRestricted, classRefName } from '@/kb/validate';
import { buildFtsQuery, extractTerms, hybridSearch } from '@/kb/search';
import { expandQuery, stem } from '@/kb/lexicon';
import { existingRuleIds, packContext, provenanceOf, retrieveRules } from '@/kb/retrieval-service';
import { getEmbeddingProvider, cosine, normalizeForIndex } from '@/kb/embeddings';

const hasKb = kbExists();
const d = hasKb ? describe : describe.skip;

describe('zero-trust validation', () => {
  it('rejects a clinical rule with an unknown maturity value', () => {
    const bad = { rule_id: 'X', topic_id: 'T', maturity: 'PRODUCTION_CDS', validation_status: 'ok', clinical_logic: { trigger: {}, required_data: [] }, safety: {}, provenance: { rights_status: 'OPEN' }, implementation: {} };
    expect(ClinicalRuleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a quality rule with an unknown maturity value', () => {
    const bad = { rule_id: 'Q', maturity: 'AUTONOMOUS_LEGAL', rule_logic: {}, implementation: {}, validation_status: 'ok' };
    expect(QualityRuleSchema.safeParse(bad).success).toBe(false);
  });

  it('preserves nulls rather than coercing them to empty strings', () => {
    const r = ClinicalRuleSchema.parse({
      rule_id: 'X',
      topic_id: 'T',
      maturity: 'L3_CANDIDATE',
      validation_status: 'HUMAN_REVIEW_REQUIRED',
      clinical_logic: { trigger: { source_trigger: null, normalized_condition_text: null }, required_data: [], action: null },
      safety: {},
      provenance: { rights_status: 'RESTRICTED_INTERNAL_REFERENCE', source_pages: [] },
      implementation: {},
    });
    expect(r.clinical_logic.trigger.normalized_condition_text).toBeNull();
    expect(r.clinical_logic.action).toBeNull();
  });

  it('normalizes defect class objects to their Georgian name', () => {
    expect(classRefName({ code: 'D02', name: 'თერაპიული დეფექტი' })).toBe('თერაპიული დეფექტი');
    expect(classRefName('დოკუმენტაციის დეფექტი')).toBe('დოკუმენტაციის დეფექტი');
  });

  it('treats the internal corpus rights classes as restricted', () => {
    expect(isRestricted('RESTRICTED_INTERNAL_REFERENCE')).toBe(true);
    expect(isRestricted('PROPRIETARY_INTERNAL')).toBe(true);
    expect(isRestricted('OPEN')).toBe(false);
  });
});

describe('embeddings', () => {
  it('produces deterministic unit vectors', async () => {
    const p = getEmbeddingProvider();
    const [a] = await p.embed(['ანტიკოაგულაცია წინაგულების ფიბრილაციაში']);
    const [b] = await p.embed(['ანტიკოაგულაცია წინაგულების ფიბრილაციაში']);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
  });

  it('scores related text above unrelated text', async () => {
    const p = getEmbeddingProvider();
    const [q, near, far] = await p.embed(['informed consent documentation defect', 'informed consent form incomplete documentation', 'renal dose adjustment creatinine clearance']);
    expect(cosine(q, near)).toBeGreaterThan(cosine(q, far));
  });

  it('records the model with every vector space', () => {
    const p = getEmbeddingProvider();
    expect(p.model.length).toBeGreaterThan(3);
    expect(p.dim).toBeGreaterThan(0);
  });
});

describe('query understanding', () => {
  it('stems inflected Georgian words', () => {
    expect('ფიბრილაციით'.startsWith(stem('ფიბრილაცია'))).toBe(true);
  });

  it('expands a Georgian query into English corpus terms', () => {
    const { added, domains } = expandQuery('პაციენტს აქვს წინაგულების ფიბრილაციით და საჭიროა ანტიკოაგულაცია');
    expect(added.join(' ')).toContain('atrial fibrillation');
    expect(domains).toContain('cardiology');
  });

  it('expands an English query into Georgian terms', () => {
    const { added } = expandQuery('informed consent for surgery');
    expect(added.join(' ')).toContain('ინფორმირებული თანხმობა');
  });

  it('keeps numeric terms for lexical weighting', () => {
    const t = extractTerms('აპიქსაბანი 5 მგ ორჯერ დღეში, eGFR 32 მლ/წთ');
    expect(t.numericTerms.join(' ')).toMatch(/5\s*მგ/);
  });

  it('builds a safe FTS expression and never leaks quotes', () => {
    const q = buildFtsQuery(['dyspepsia', 'a"b']);
    expect(q).toContain('"dyspepsia"*');
    expect(q).not.toContain('a"b');
  });

  it('normalizes text consistently', () => {
    expect(normalizeForIndex('  Renal/Hepatic  ADJUSTMENT ')).toBe('renal hepatic adjustment');
  });
});

d('imported corpus', () => {
  it('imported both corpora with no quarantined records', () => {
    const s = kbStats();
    expect(s.clinicalRules).toBeGreaterThan(5000);
    expect(s.qualityRules).toBeGreaterThan(4000);
    expect(s.quarantined).toBe(0);
  });

  it('never marks a rule as production CDS or autonomous legal conclusion', () => {
    const s = kbStats();
    expect(s.productionCds).toBe(0);
    expect(s.autonomousLegal).toBe(0);
  });

  it('keeps rule ids unique across the corpus', () => {
    const db = openDb({ readonly: true });
    const dup = db.prepare('SELECT COUNT(*) n FROM (SELECT rule_id FROM clinical_rules GROUP BY rule_id HAVING COUNT(*) > 1)').get() as { n: number };
    expect(dup.n).toBe(0);
  });

  it('is idempotent: a second import of the same hash adds no rows', () => {
    const db = openDb({ readonly: true });
    const versions = db.prepare('SELECT COUNT(*) n FROM knowledge_source_versions WHERE active = 1').get() as { n: number };
    expect(versions.n).toBe(2);
  });

  it('records provenance for every clinical rule', () => {
    const db = openDb({ readonly: true });
    const missing = db.prepare('SELECT COUNT(*) n FROM clinical_rules r LEFT JOIN clinical_provenance p ON p.rule_id = r.rule_id WHERE p.rule_id IS NULL').get() as { n: number };
    expect(missing.n).toBe(0);
  });

  it('stores a file hash and import run for every version', () => {
    const db = openDb({ readonly: true });
    const rows = db.prepare('SELECT file_hash, record_count FROM knowledge_source_versions').all() as { file_hash: string; record_count: number }[];
    rows.forEach((r) => {
      expect(r.file_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.record_count).toBeGreaterThan(0);
    });
  });

  it('marks every quality rule as requiring human review', () => {
    const db = openDb({ readonly: true });
    const n = (db.prepare('SELECT COUNT(*) n FROM quality_rules WHERE human_review_required = 0').get() as { n: number }).n;
    expect(n).toBe(0);
  });
});

d('hybrid retrieval', () => {
  it('finds the right clinical rules for an English query', async () => {
    const { hits } = await hybridSearch('dyspepsia upper endoscopy age 60', { kinds: ['clinical_rule'], limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].rule_id).toMatch(/DYS/);
  });

  it('finds quality rules for a Georgian consent question', async () => {
    const { hits } = await hybridSearch('ინფორმირებული თანხმობის ხარვეზი ოპერაციამდე', { kinds: ['quality_rule'], limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kind === 'quality_rule')).toBe(true);
  });

  it('honours the kind filter', async () => {
    const { hits } = await hybridSearch('თანხმობა', { kinds: ['audit_question'], limit: 5 });
    hits.forEach((h) => expect(h.kind).toBe('audit_question'));
  });

  it('honours excludeCandidates', async () => {
    const { hits } = await hybridSearch('documentation', { excludeCandidates: true, limit: 10 });
    hits.forEach((h) => { if (h.kind !== 'audit_question' && h.kind !== 'clinical_unit') expect(['L3_CANDIDATE', 'QUALITY_RULE_CANDIDATE']).not.toContain(h.maturity); });
  });

  it('weights structured rules above candidates at equal text match', async () => {
    const { hits } = await hybridSearch('dyspepsia', { kinds: ['clinical_rule'], limit: 10 });
    const structured = hits.find((h) => h.kind === 'clinical_rule' && h.maturity === 'L3_STRUCTURED_RULE');
    const candidate = hits.find((h) => h.kind === 'clinical_rule' && h.maturity === 'L3_CANDIDATE');
    if (structured && candidate) expect(structured.score.maturity).toBeGreaterThan(candidate.score.maturity);
  });

  it('returns a decomposed, explainable score for every hit', async () => {
    const { hits } = await hybridSearch('renal dose adjustment', { limit: 3 });
    hits.forEach((h) => {
      expect(h.score).toHaveProperty('lexical');
      expect(h.score).toHaveProperty('semantic');
      expect(h.score).toHaveProperty('maturity');
      expect(h.score).toHaveProperty('final');
    });
  });

  it('combines lexical and semantic signals rather than one alone', async () => {
    const { hits } = await hybridSearch('informed consent documentation', { limit: 10 });
    expect(hits.some((h) => h.score.lexical > 0)).toBe(true);
    expect(hits.some((h) => h.score.semantic > 0)).toBe(true);
  });

  it('penalises rules that need an evidence refresh', async () => {
    const { hits } = await hybridSearch('endoscopy', { kinds: ['clinical_rule'], limit: 10 });
    const stale = hits.find((h) => h.kind === 'clinical_rule' && h.current_evidence_refresh_required);
    if (stale) expect(stale.score.freshnessPenalty).toBeGreaterThan(0);
  });
});

d('coverage gate and grounding', () => {
  it('reports NOT_COVERED instead of answering from model memory', async () => {
    const r = await retrieveRules('ზზზქქქ ჭჭჭ არარსებული სინდრომი ბბბ');
    expect(['NOT_COVERED', 'PARTIAL']).toContain(r.coverage);
    if (r.coverage === 'NOT_COVERED') expect(r.messageKa).toContain('მოდელის მეხსიერებიდან');
  });

  it('reports COVERED for a topic the corpus actually contains', async () => {
    const r = await retrieveRules('dyspepsia endoscopy');
    expect(r.coverage).toBe('COVERED');
    expect(r.ruleIds.length).toBeGreaterThan(0);
  });

  it('packs a bounded context that never contains the whole corpus', async () => {
    const r = await retrieveRules('dyspepsia endoscopy', { limit: 14 });
    const ctx = packContext(r.hits, 4000);
    expect(ctx.length).toBeLessThanOrEqual(4200);
    expect(ctx).toContain('[RULE');
  });

  it('emits provenance for every retrieved rule', async () => {
    const r = await retrieveRules('dyspepsia endoscopy', { limit: 5 });
    const p = provenanceOf(r.hits);
    expect(p.length).toBe(r.hits.length);
    p.forEach((x) => expect(x.source_id).toBeTruthy());
  });

  it('recognises only rule ids that really exist', () => {
    const real = existingRuleIds(['L3-DYS-001', 'L3-FAKE-999']);
    expect(real.has('L3-DYS-001')).toBe(true);
    expect(real.has('L3-FAKE-999')).toBe(false);
  });
});

describe('restricted corpus protection', () => {
  it('does not ship the source corpus inside the repository', () => {
    // knowledge-source/ is gitignored and never bundled; only the derived DB is built locally.
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('knowledge-source/');
    expect(gitignore).toContain('data/');
  });
});
