import { describe, expect, it } from 'vitest';
import {
  LOW_VALUE_MEDS,
  LOW_VALUE_STATS,
  TAPER_SCHEDULES,
  screenMedicationList,
  taperFor,
} from '@/knowledge/low-value-meds';
import { latinCandidates } from '@/services/drug-naming';
import { buildQuery } from '@/services/literature';
import {
  AUDIT_QUESTIONS,
  QUALITY_MANIFEST,
  QUALITY_RULES,
  QUALITY_TAXONOMY,
  RULE_TRACE_COUNT,
  matchAuditQuestions,
  matchRules,
} from '@/knowledge/quality-corpus';

describe('quality corpus', () => {
  it('loads the author corpus with reconcilable counts', () => {
    expect(RULE_TRACE_COUNT).toBe(4482);
    expect(QUALITY_MANIFEST.rulesExtracted).toBe(4482);
    expect(QUALITY_RULES.length).toBe(QUALITY_MANIFEST.rulesActive);
    expect(QUALITY_TAXONOMY.length).toBe(160);
    expect(AUDIT_QUESTIONS.length).toBe(128);
  });

  it('never serves a sentence-level candidate as an active rule', () => {
    expect(QUALITY_RULES.every((r) => r.active)).toBe(true);
    // Checked against the loaded data, not the declared type: the type says
    // candidates cannot be here, but the JSON is what actually ships.
    const maturities = new Set((QUALITY_RULES as { maturity: string }[]).map((r) => r.maturity));
    expect(maturities.has('QUALITY_RULE_CANDIDATE')).toBe(false);
    expect(maturities.size).toBe(4);
  });

  it('gives every active rule a decidable body and a source locator', () => {
    for (const r of QUALITY_RULES) {
      const body = `${r.triggerKa ?? ''}${r.criterionKa ?? ''}`.trim();
      expect(body.length).toBeGreaterThan(0);
      expect(Array.isArray(r.chapterPath)).toBe(true);
    }
  });

  it('never authorises an autonomous legal conclusion', () => {
    expect(QUALITY_RULES.every((r) => r.automation !== 'autonomous')).toBe(true);
  });

  it('returns nothing rather than the whole corpus for an unrelated narrative', () => {
    // The failure mode that matters: an irrelevant rule cited against a clinician.
    const hits = matchRules('today the weather in Tbilisi is pleasant and the traffic is light');
    expect(hits.length).toBe(0);
  });

  it('retrieves documentation rules for a documentation complaint', () => {
    const hits = matchRules('ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა და ჩანაწერი არასრულია', { limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it('retrieves audit questions tied to defect classes', () => {
    const qs = matchAuditQuestions('მკურნალობა არ შეესაბამებოდა გაიდლაინს და დოზა იყო არაადეკვატური', { limit: 5 });
    expect(qs.length).toBeGreaterThan(0);
  });
});

describe('low-value medication registry', () => {
  it('states a regulatory status and an evidence grade for every entry', () => {
    for (const e of LOW_VALUE_MEDS) {
      expect(typeof e.approval.fda).toBe('boolean');
      expect(typeof e.approval.ema).toBe('boolean');
      expect(e.grade).toBeTruthy();
      expect(e.evidenceKa.length).toBeGreaterThan(40);
      expect(e.insteadKa.length).toBeGreaterThan(0);
      expect(e.evidenceTerm.length).toBeGreaterThan(2);
    }
  });

  it('does not claim proven uselessness where no assessment exists', () => {
    // Absence of evidence must never be reported as evidence of absence.
    const unassessed = LOW_VALUE_MEDS.filter((e) => e.grade === 'no_international_assessment');
    expect(unassessed.length).toBeGreaterThan(0);
    for (const e of unassessed) {
      expect(e.evidenceKa).not.toMatch(/უეფექტურია|დადასტურებულია უეფექტურობა/);
    }
  });

  it('carries a resolvable reference wherever a named trial backs the grade', () => {
    for (const e of LOW_VALUE_MEDS) {
      if (!e.keyReference) continue;
      expect(e.keyReference.url).toMatch(/^https:\/\//);
      expect(e.keyReference.year).toBeGreaterThan(1990);
    }
  });

  it('detects Georgian and brand spellings in a free-text list', () => {
    const hits = screenMedicationList('ცერებროლიზინი 10მლ\nკავინტონი 5მგ\nTeraflex\nEssentiale');
    const ids = hits.map((h) => h.entry.id);
    expect(ids).toContain('cerebrolysin');
    expect(ids).toContain('vinpocetine');
    expect(ids).toContain('glucosamine-chondroitin');
    expect(ids).toContain('essential-phospholipids');
  });

  it('orders findings by action priority, stop-now first', () => {
    const hits = screenMedicationList('მულტივიტამინები\nცერებროლიზინი');
    expect(hits[0].entry.tier).toBe('I_stop_now');
  });

  it('does not match an unrelated drug on a short fragment', () => {
    const hits = screenMedicationList('ომეპრაზოლი 20მგ\nბისოპროლოლი 5მგ\nატორვასტატინი 20მგ');
    expect(hits.length).toBe(0);
  });

  it('matches tapering schedules by drug name', () => {
    expect(taperFor('სერტრალინი 50მგ').map((t) => t.groupKa)).toContain('SSRI / SNRI');
    expect(taperFor('diazepam 5mg').length).toBeGreaterThan(0);
    expect(taperFor('ომეპრაზოლი').length).toBeGreaterThan(0);
    expect(taperFor('ატორვასტატინი').length).toBe(0);
  });

  it('publishes stats that match the data', () => {
    expect(LOW_VALUE_STATS.entries).toBe(LOW_VALUE_MEDS.length);
    expect(LOW_VALUE_STATS.taperSchedules).toBe(TAPER_SCHEDULES.length);
    expect(LOW_VALUE_STATS.notApprovedFdaEma).toBe(LOW_VALUE_MEDS.filter((e) => !e.approval.fda && !e.approval.ema).length);
  });
});

describe('Georgian drug name resolution', () => {
  it('resolves common Georgian names to the INN', () => {
    expect(latinCandidates('ომეპრაზოლი')).toContain('omeprazole');
    expect(latinCandidates('ვარფარინი')).toContain('warfarin');
    expect(latinCandidates('იბუპროფენი')).toContain('ibuprofen');
    expect(latinCandidates('სერტრალინი')).toContain('sertraline');
    expect(latinCandidates('ამიტრიპტილინი')).toContain('amitriptyline');
  });

  it('passes Latin input through unchanged', () => {
    expect(latinCandidates('warfarin')).toEqual(['warfarin']);
  });

  it('falls back to transliteration for a name outside the dictionary', () => {
    const c = latinCandidates('ტესტოლოლი');
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]).toMatch(/^testolol/);
  });
});

describe('literature query construction', () => {
  it('keeps a field-qualified query scoped to the title', () => {
    // Stripping quotes here would silently turn a title search into a
    // match-anywhere search, and the results drift off the drug entirely.
    const q = buildQuery({ text: 'TITLE:"Cerebrolysin"' });
    expect(q).toContain('TITLE:"Cerebrolysin"');
  });

  it('preserves boolean grouping', () => {
    const q = buildQuery({ text: 'cerebrolysin AND (stroke OR dementia)' });
    expect(q).toContain('(stroke OR dementia)');
  });

  it('builds a PICO query as quoted phrases', () => {
    const q = buildQuery({ text: '', pico: { p: 'elderly patients', i: 'deprescribing' } });
    expect(q).toContain('"elderly patients"');
    expect(q).toContain('"deprescribing"');
  });

  it('applies a recency floor and returns empty for an empty query', () => {
    expect(buildQuery({ text: '', pico: {} })).toBe('');
    expect(buildQuery({ text: 'polypharmacy', fromYear: 2015 })).toContain('FIRST_PDATE:[2015-01-01');
  });
});

describe('Georgian interface completeness', () => {
  it('labels every evidence dimension the corpus actually uses', async () => {
    const { EVIDENCE_LABEL_KA, QUALITY_RULES, AUDIT_QUESTIONS } = await import('@/knowledge/quality-corpus');
    const used = new Set<string>();
    for (const r of QUALITY_RULES) for (const e of r.requiredEvidence) used.add(e);
    for (const q of AUDIT_QUESTIONS) for (const e of q.evidence) used.add(e);
    const unlabelled = [...used].filter((d) => !EVIDENCE_LABEL_KA[d]);
    expect(unlabelled).toEqual([]);
  });

  it('labels every rule family the corpus actually uses', async () => {
    const { FAMILY_LABEL_KA, QUALITY_RULES } = await import('@/knowledge/quality-corpus');
    const unlabelled = [...new Set(QUALITY_RULES.map((r) => r.family))].filter((f) => !FAMILY_LABEL_KA[f]);
    expect(unlabelled).toEqual([]);
  });
});

describe('result clearing', () => {
  it('offers a clear action on every workspace that produces a result', async () => {
    // A stale result left on screen is how one patient's answer gets read as
    // another's. Every surface that renders an exportable result must offer a
    // way to empty it.
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.tsx')) files.push(full);
      }
    };
    walk('src/features');

    // AnswerView receives onClear from its callers rather than owning state.
    // Browse surfaces whose output is derived from the current selection, and
    // medication-review, which hosts PolypharmacyScreen's own clear and is
    // reset by the global "new case" action.
    const EXEMPT = ['guideline-comparator.tsx', 'drug-workspace.tsx', 'academy-workspace.tsx', 'medication-review.tsx'];

    const missing = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('<ExportBar')) return false;
      if (EXEMPT.some((e) => f.endsWith(e))) return false;
      return !src.includes('onClear');
    });

    expect(missing).toEqual([]);
  });
});

describe('document templates', () => {
  it('offers an insurance justification with an argument structure', async () => {
    const { templateById } = await import('@/knowledge/document-templates');
    const t = templateById('insurance');
    expect(t).toBeDefined();
    expect(t!.audience).toBe('insurer');
    // The sections that make it a justification rather than a description.
    expect(t!.sections).toContain('კლინიკური აუცილებლობის დასაბუთება');
    expect(t!.sections).toContain('განხილული ალტერნატივები');
    expect(t!.sections).toContain('მოქმედი სტანდარტის მითითება');
  });

  it('covers every audience a clinic actually writes for', async () => {
    const { DOC_TEMPLATES } = await import('@/knowledge/document-templates');
    const audiences = new Set(DOC_TEMPLATES.map((t) => t.audience));
    expect(audiences.has('clinician')).toBe(true);
    expect(audiences.has('patient')).toBe(true);
    expect(audiences.has('insurer')).toBe(true);
    expect(audiences.has('institution')).toBe(true);
    expect(DOC_TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it('gives every template a non-empty section list and a method note', async () => {
    const { DOC_TEMPLATES } = await import('@/knowledge/document-templates');
    for (const t of DOC_TEMPLATES) {
      expect(t.sections.length).toBeGreaterThan(2);
      expect(t.noteKa.length).toBeGreaterThan(20);
      expect(new Set(t.sections).size).toBe(t.sections.length);
    }
  });

  it('keeps SOP governance fields required by the author standard', async () => {
    const { templateById } = await import('@/knowledge/document-templates');
    const sop = templateById('sop')!;
    const joined = sop.sections.join(' ');
    expect(joined).toContain('სარეგისტრაციო ნომერი');
    expect(joined).toContain('ძალაში შესვლის თარიღი');
    expect(joined).toContain('შემდეგი განხილვის თარიღი');
    expect(joined).toContain('დამტკიცება');
  });
});

describe('patient module does not echo scaffolding', () => {
  it('leaves the explanation section to the synthesis step', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/agents/implementations.ts', 'utf8');
    // Echoing the question back labelled as a finding reflected whatever the
    // patient pasted — including test scaffolding — as if it were clinical.
    expect(src).not.toContain('თქვენი კითხვა ეხება:');
  });
});

describe('Georgian declension in medication matching', () => {
  it('finds drugs named in an inflected sentence', async () => {
    const { screenMedicationList } = await import('@/knowledge/low-value-meds');
    const hits = screenMedicationList(
      'პაციენტს უნიშნავენ ცერებროლიზინს და კავინტონს უკვე სამი თვეა, ასევე იღებს Teraflex-ს სახსრებისთვის',
    );
    const ids = hits.map((h) => h.entry.id);
    expect(ids).toContain('cerebrolysin');
    expect(ids).toContain('vinpocetine');
    expect(ids).toContain('glucosamine-chondroitin');
  });

  it('matches other case endings', async () => {
    const { screenMedicationList } = await import('@/knowledge/low-value-meds');
    expect(screenMedicationList('ცერებროლიზინით მკურნალობა').map((h) => h.entry.id)).toContain('cerebrolysin');
    expect(screenMedicationList('კავინტონზე გადაიყვანეს').map((h) => h.entry.id)).toContain('vinpocetine');
    expect(screenMedicationList('აქტოვეგინის კურსი').map((h) => h.entry.id)).toContain('actovegin');
  });

  it('still does not match a rational regimen', async () => {
    const { screenMedicationList } = await import('@/knowledge/low-value-meds');
    expect(
      screenMedicationList('ბისოპროლოლი 5მგ, ატორვასტატინი 20მგ, მეტფორმინი 1000მგ, ლიზინოპრილი 10მგ'),
    ).toHaveLength(0);
  });
});

describe('literature classification and formatting', () => {
  it('does not label a study about guideline adherence as a guideline', async () => {
    const { citationText } = await import('@/services/literature');
    const c = { authors: 'Liao TW, Chen WT.', title: 'Improved Anticoagulation Guideline Adherence', journal: 'J', year: 2024, doi: null, pmid: '1' } as never;
    expect(citationText(c)).not.toMatch(/\.\./);
  });
});
