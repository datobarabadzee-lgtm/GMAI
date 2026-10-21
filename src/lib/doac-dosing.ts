import type { PatientContext } from '@/schemas/clinical';

/**
 * DOAC DOSE CRITERIA — non-valvular atrial fibrillation, EU SmPC.
 *
 * The generic drug record states the reduction rule ("≥2 of 3 criteria");
 * this module APPLIES it to the patient, which is the step that was missing:
 * an 81-year-old weighing 58 kg with creatinine 1.6 mg/dL meets all three
 * apixaban criteria, and the agent reported "no adjustment needed".
 *
 * Unknown values are never assumed normal. When a missing value could change
 * the dose, the result says so and does not state a dose as settled.
 *
 * Sources (EU Summary of Product Characteristics, section 4.2):
 *   apixaban (Eliquis), rivaroxaban (Xarelto), dabigatran etexilate (Pradaxa),
 *   edoxaban (Lixiana).
 */

export type DoacResult = {
  drug: 'apixaban' | 'rivaroxaban' | 'dabigatran' | 'edoxaban';
  doseKa: string | null;
  settled: boolean;
  criteriaKa: string[];
  missingKa: string[];
  warningsKa: string[];
  sourceKa: string;
};

const SOURCE = (n: string) => `${n} — EU SmPC, 4.2 (არავალვულური AF)`;

export function crclCockcroftGault(p: Pick<PatientContext, 'age' | 'weightKg' | 'creatinineMgDl' | 'sex'>): number | null {
  if (!p.age || !p.weightKg || !p.creatinineMgDl) return null;
  const base = ((140 - p.age) * p.weightKg) / (72 * p.creatinineMgDl);
  return Math.round((p.sex === 'female' ? base * 0.85 : base) * 10) / 10;
}

export function evaluateDoac(drugName: string, p: PatientContext): DoacResult | null {
  const n = drugName.toLowerCase();
  const crcl = crclCockcroftGault(p);
  const missing: string[] = [];
  const sexNote = p.sex === 'unspecified' && crcl !== null ? [`სქესი უცნობია — CrCl გამოთვლილია მამრობითი ფორმულით (${crcl} მლ/წთ); ქალისთვის იქნებოდა ${Math.round(crcl * 0.85 * 10) / 10} მლ/წთ.`] : [];
  if (crcl === null) missing.push(['ასაკი', 'წონა', 'შრატის კრეატინინი'].filter((_, i) => ![p.age, p.weightKg, p.creatinineMgDl][i]).join(', ') + ' — CrCl (Cockcroft–Gault) ვერ გამოითვლება');

  if (n.includes('apixaban') || n.includes('აპიქსაბან')) {
    const crit = [
      { label: 'ასაკი ≥80 წ.', v: p.age === null ? null : p.age >= 80, have: p.age },
      { label: 'წონა ≤60 კგ', v: p.weightKg === null ? null : p.weightKg <= 60, have: p.weightKg },
      { label: 'შრატის კრეატინინი ≥1.5 მგ/დლ', v: p.creatinineMgDl === null ? null : p.creatinineMgDl >= 1.5, have: p.creatinineMgDl },
    ];
    const met = crit.filter((c) => c.v === true).length;
    const unknown = crit.filter((c) => c.v === null).length;
    const criteriaKa = crit.map((c) => `${c.label}: ${c.v === null ? 'უცნობია' : c.v ? `დიახ (${c.have})` : `არა (${c.have})`}`);
    const warnings: string[] = [...sexNote];
    if (crcl !== null && crcl < 15) return { drug: 'apixaban', doseKa: null, settled: true, criteriaKa, missingKa: missing, warningsKa: [...warnings, `CrCl ${crcl} მლ/წთ (<15) — აპიქსაბანი არ არის რეკომენდებული.`], sourceKa: SOURCE('Apixaban') };
    if (crcl !== null && crcl < 30) warnings.push(`CrCl ${crcl} მლ/წთ (15–29) — 2.5 მგ ორჯერ დღეში, კრიტერიუმების მიუხედავად.`);
    if (met >= 2 || (crcl !== null && crcl >= 15 && crcl < 30))
      return { drug: 'apixaban', doseKa: '2.5 მგ ორჯერ დღეში', settled: true, criteriaKa: [...criteriaKa, `შესრულებულია ${met}/3 კრიტერიუმი`], missingKa: missing, warningsKa: warnings, sourceKa: SOURCE('Apixaban') };
    if (met + unknown >= 2)
      return { drug: 'apixaban', doseKa: null, settled: false, criteriaKa: [...criteriaKa, `შესრულებულია ${met}/3; უცნობია ${unknown}`], missingKa: [...missing, 'დოზა დამოკიდებულია უცნობ კრიტერიუმზე — 5 მგ ან 2.5 მგ ორჯერ დღეში'], warningsKa: warnings, sourceKa: SOURCE('Apixaban') };
    return { drug: 'apixaban', doseKa: '5 მგ ორჯერ დღეში', settled: true, criteriaKa: [...criteriaKa, `შესრულებულია ${met}/3 კრიტერიუმი`], missingKa: missing, warningsKa: warnings, sourceKa: SOURCE('Apixaban') };
  }

  if (n.includes('rivaroxaban') || n.includes('რივაროქსაბან')) {
    const base = { drug: 'rivaroxaban' as const, criteriaKa: crcl !== null ? [`CrCl ${crcl} მლ/წთ`] : [], missingKa: missing, sourceKa: SOURCE('Rivaroxaban') };
    if (crcl === null) return { ...base, doseKa: null, settled: false, warningsKa: ['დოზა დამოკიდებულია CrCl-ზე: ≥50 — 20 მგ, 15–49 — 15 მგ დღეში ერთხელ, საკვებთან ერთად.'] };
    if (crcl < 15) return { ...base, doseKa: null, settled: true, warningsKa: [...sexNote, 'CrCl <15 მლ/წთ — არ არის რეკომენდებული.'] };
    return { ...base, doseKa: crcl < 50 ? '15 მგ დღეში ერთხელ, საკვებთან ერთად' : '20 მგ დღეში ერთხელ, საკვებთან ერთად', settled: true, warningsKa: [...sexNote, ...(crcl < 30 ? ['CrCl 15–29 — სიფრთხილით.'] : [])] };
  }

  if (n.includes('dabigatran') || n.includes('დაბიგატრან')) {
    const base = { drug: 'dabigatran' as const, criteriaKa: [p.age !== null ? `ასაკი ${p.age} წ.` : 'ასაკი უცნობია', crcl !== null ? `CrCl ${crcl} მლ/წთ` : 'CrCl უცნობია'], missingKa: missing, sourceKa: SOURCE('Dabigatran etexilate') };
    if (crcl !== null && crcl < 30) return { ...base, doseKa: null, settled: true, warningsKa: [...sexNote, 'CrCl <30 მლ/წთ — უკუნაჩვენებია.'] };
    if (p.age !== null && p.age >= 80) return { ...base, doseKa: '110 მგ ორჯერ დღეში', settled: crcl !== null, warningsKa: [...sexNote, 'ასაკი ≥80 — 110 მგ ორჯერ დღეში; ვერაპამილის თანხმლები მიღებისასაც 110 მგ.', ...(crcl === null ? ['CrCl უცნობია — <30-ზე უკუნაჩვენებია.'] : [])] };
    if (crcl === null || p.age === null) return { ...base, doseKa: null, settled: false, warningsKa: ['დოზა დამოკიდებულია ასაკსა და CrCl-ზე (150 ან 110 მგ ორჯერ დღეში).'] };
    const consider = (p.age >= 75 && p.age < 80) || (crcl >= 30 && crcl <= 50);
    return { ...base, doseKa: '150 მგ ორჯერ დღეში', settled: !consider, warningsKa: [...sexNote, ...(consider ? ['ასაკი 75–79 ან CrCl 30–50 — განიხილეთ 110 მგ ორჯერ დღეში სისხლდენის ინდივიდუალური რისკის მიხედვით.'] : [])] };
  }

  if (n.includes('edoxaban') || n.includes('ედოქსაბან')) {
    const base = { drug: 'edoxaban' as const, criteriaKa: [crcl !== null ? `CrCl ${crcl} მლ/წთ` : 'CrCl უცნობია', p.weightKg !== null ? `წონა ${p.weightKg} კგ` : 'წონა უცნობია'], missingKa: missing, sourceKa: SOURCE('Edoxaban') };
    if (crcl !== null && crcl < 15) return { ...base, doseKa: null, settled: true, warningsKa: [...sexNote, 'CrCl <15 მლ/წთ — არ არის რეკომენდებული.'] };
    const reduce = (crcl !== null && crcl <= 50) || (p.weightKg !== null && p.weightKg <= 60);
    if (reduce) return { ...base, doseKa: '30 მგ დღეში ერთხელ', settled: true, warningsKa: [...sexNote, 'ასევე 30 მგ ციკლოსპორინის, დრონედარონის, ერითრომიცინის ან კეტოკონაზოლის თანხმლები მიღებისას.'] };
    if (crcl === null || p.weightKg === null) return { ...base, doseKa: null, settled: false, warningsKa: ['დოზა 60 ან 30 მგ — დამოკიდებულია CrCl-ზე (≤50) და წონაზე (≤60 კგ).'] };
    return { ...base, doseKa: '60 მგ დღეში ერთხელ', settled: true, warningsKa: [...sexNote, ...(crcl > 95 ? ['მაღალი CrCl (>95) — ეფექტურობის შემცირების ტენდენცია; გამოიყენეთ მხოლოდ თრომბოემბოლიური და სისხლდენის რისკის შეფასების შემდეგ.'] : [])] };
  }

  return null;
}
