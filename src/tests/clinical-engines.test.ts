import { describe, expect, it } from 'vitest';
import { reviewMedications } from '@/lib/medication-review';
import { interpretLabs, parseLabText, findRef } from '@/lib/labs';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { findDrug, brandOnlyMatch, interactionsFor, searchDrugs } from '@/knowledge/drugs';
import { suggestDefectClasses, DEFECT_CLASSES, NEUTRAL_LANGUAGE } from '@/knowledge/defect-classifier';
import { emptyPatientContext } from '@/schemas/clinical';

const polypharmacy = DEMO_CASES.find((d) => d.id === 'demo-polypharmacy')!.patient;
const afCkd = DEMO_CASES.find((d) => d.id === 'demo-af-ckd')!.patient;

describe('drug registry', () => {
  it('finds a curated monograph by substance name only; a trade name is a product, not a substance', () => {
    expect(findDrug('Apixaban')?.id).toBe('apixaban');
    expect(findDrug('აპიქსაბანი')?.id).toBe('apixaban');
    expect(findDrug('Eliquis')).toBeUndefined();
    expect(brandOnlyMatch('Eliquis')?.id).toBe('apixaban');
  });
  it('returns nothing for an unknown molecule instead of guessing', () => {
    expect(findDrug('ზზზქქქჭჭჭ')).toBeUndefined();
  });
  it('searches by indication', () => {
    expect(searchDrugs('ტკივილ').length).toBeGreaterThan(0);
  });
  it('finds a documented interaction pair', () => {
    const found = interactionsFor(['apixaban', 'ibuprofen']);
    expect(found.length).toBe(1);
    expect(found[0].severity).toBe('major');
  });
});

describe('medication reconciliation', () => {
  const review = reviewMedications(polypharmacy);

  it('detects at least one critical or high severity finding in the polypharmacy case', () => {
    expect(review.findings.some((f) => f.severity === 'critical' || f.severity === 'high')).toBe(true);
  });
  it('sorts findings by severity', () => {
    const order = ['critical', 'high', 'moderate', 'low', 'info'];
    const idx = review.findings.map((f) => order.indexOf(f.severity));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
  it('detects the serotonergic tramadol + sertraline interaction', () => {
    expect(review.findings.some((f) => f.category === 'interaction' && f.drugs.includes('Tramadol') && f.drugs.includes('Sertraline'))).toBe(true);
  });
  it('computes cumulative anticholinergic and sedative burden', () => {
    expect(review.burdens.anticholinergic).toBeGreaterThan(0);
    expect(review.burdens.sedative).toBeGreaterThan(0);
  });
  it('proposes deprescribing candidates with a taper concept', () => {
    expect(review.deprescribing.length).toBeGreaterThan(0);
    const diazepam = review.deprescribing.find((d) => d.drug === 'Diazepam');
    expect(diazepam?.taperNeeded).toBe(true);
    expect(diazepam?.taperConcept.length).toBeGreaterThan(5);
  });
  it('reports missing renal function rather than assuming it', () => {
    const noRenal = reviewMedications({ ...polypharmacy, creatinineMgDl: null, egfr: null, weightKg: null });
    expect(noRenal.crcl).toBeNull();
    expect(noRenal.findings.some((f) => f.category === 'renal' && f.titleKa.includes('შეუფასებელია'))).toBe(true);
  });
  it('lists unresolved medications instead of silently ignoring them', () => {
    const withUnknown = reviewMedications({ ...emptyPatientContext(), medications: [{ id: '1', drug: 'ზზზქქქ', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' }] });
    expect(withUnknown.unresolved).toContain('ზზზქქქ');
  });
  it('detects the NSAID + anticoagulation risk pattern in the AF/CKD case', () => {
    const r = reviewMedications({ ...afCkd, medications: [...afCkd.medications, { id: 'x', drug: 'Apixaban', dose: '5 მგ', frequency: 'ორჯერ', route: 'per os', indication: 'AF', startDate: '', status: 'active' }] });
    expect(r.findings.some((f) => f.category === 'interaction' && f.severity === 'high')).toBe(true);
  });
});

describe('laboratory intelligence', () => {
  it('resolves reference ranges for Georgian and English analyte names', () => {
    expect(findRef('ნატრიუმი')?.key).toBe('sodium');
    expect(findRef('Creatinine')?.key).toBe('creatinine');
  });

  it('flags critical values', () => {
    const a = interpretLabs([{ id: '1', analyte: 'Potassium', value: 6.4, unit: 'მმოლ/ლ', date: '2026-09-01' }]);
    expect(a.critical.length).toBe(1);
    expect(a.urgent.length).toBeGreaterThan(0);
  });

  it('recognises the hyponatraemia pattern and links it to medications', () => {
    const a = interpretLabs(polypharmacy.labs, polypharmacy);
    expect(a.patterns.some((p) => p.titleKa.includes('ჰიპონატრიემია'))).toBe(true);
    expect(a.medicationRelated.length).toBeGreaterThan(0);
  });

  it('computes trends across repeated measurements', () => {
    const a = interpretLabs([
      { id: '1', analyte: 'Creatinine', value: 1.0, unit: 'მგ/დლ', date: '2026-01-01' },
      { id: '2', analyte: 'Creatinine', value: 1.6, unit: 'მგ/დლ', date: '2026-06-01' },
    ]);
    expect(a.trends[0].direction).toBe('rising');
    expect(a.trends[0].deltaPct).toBe(60);
  });

  it('states when a reference range cannot be determined instead of inventing one', () => {
    const a = interpretLabs([{ id: '1', analyte: 'ზზზქქქ', value: 5, unit: '', date: '' }]);
    expect(a.results[0].status).toBe('unknown');
    expect(a.results[0].noteKa).toContain('ვერ დადგინდა');
  });

  it('parses a pasted laboratory table', () => {
    const rows = parseLabText('Sodium; 128; მმოლ/ლ; 2026-09-09\nPotassium; 3.1; მმოლ/ლ; 2026-09-09');
    expect(rows.length).toBe(2);
    expect(rows[0].value).toBe(128);
  });
});

describe('defect classifier', () => {
  it('ships all ten classes from the author manual', () => {
    expect(DEFECT_CLASSES.length).toBe(10);
    expect(DEFECT_CLASSES.map((c) => c.roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
  });

  it('gives every class assessment criteria, a control mechanism and responsible roles', () => {
    DEFECT_CLASSES.forEach((c) => {
      expect(c.assessmentCriteria.length).toBeGreaterThan(0);
      expect(c.controlMechanism.length).toBeGreaterThan(0);
      expect(c.responsible.length).toBeGreaterThan(0);
      expect(c.subcategories.length).toBeGreaterThan(0);
    });
  });

  it('detects documentation and diagnostic signals in the quality demo case', () => {
    const narrative = DEMO_CASES.find((d) => d.id === 'demo-quality')!.patient.narrative;
    const suggested = suggestDefectClasses(narrative).map((s) => s.cls.code);
    expect(suggested).toContain('III_documentation');
  });

  it('keeps guilt-assigning vocabulary on the forbidden list', () => {
    expect(NEUTRAL_LANGUAGE.forbidden).toContain('დანაშაული');
    expect(NEUTRAL_LANGUAGE.allowed).toContain('პოტენციური დეფექტი');
  });
});
