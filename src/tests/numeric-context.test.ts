import { describe, expect, it } from 'vitest';
import { verifyNumerics } from '@/services/verifiers';
import { factsFrom, extractQuantities } from '@/services/numeric-facts';
import { buildLedger } from '@/services/run-ledger';
import type { AgentResult } from '@/schemas/agent';

/**
 * F01 (audit 2026-10-21): a number is verified only as a quantity in context —
 * value, unit, kind, drug, route, frequency and population.
 */

const agent = (agentId: string, summary: string): AgentResult => ({ agentId, status: 'ok', summary, sections: [], claims: [], sourceIds: [], data: {}, humanReviewRequired: false, note: '' });
const rule = (id: string, text: string) => ({ kind: 'quality_rule', rule_id: id, trigger_or_question: text, criterion_or_action: '' }) as never;

describe('quantities keep their unit and kind', () => {
  it('distinguishes an age from a dose, and converts units within a dimension', () => {
    const [age] = extractQuantities('Age 5 years');
    expect(age.dim).toBe('age');
    const [dose] = extractQuantities('5 მგ');
    expect(dose.dim).toBe('mass');
    expect(dose.kind).toBe('dose');
    const [range] = extractQuantities('2.5–5 mg');
    expect(range.values).toEqual([2.5, 5]);
  });
});

describe('verifyNumerics — context is required', () => {
  it('an age in a source does not support a dose', () => {
    expect(verifyNumerics('პრეპარატის დოზაა 5 მგ.', [rule('R-AGE', 'Age 5 years')])[0].status).toBe('UNVERIFIED');
  });

  it('an untyped ledger number does not support a quantity with a unit', () => {
    expect(verifyNumerics('მოცულობაა 5 მლ.', [], new Set(['5']))[0].status).toBe('UNVERIFIED');
  });

  it('one drug’s 5 mg does not support another drug’s 5 mg', () => {
    const facts = factsFrom('აპიქსაბანი 5 მგ ორჯერ დღეში.', 'engine', 'A07');
    const r = verifyNumerics('მეტფორმინი 5 მგ ორჯერ დღეში.', [], facts);
    expect(r[0].status).toBe('UNVERIFIED');
    expect(r[0].noteKa).toMatch(/სხვა პრეპარატის/);
    expect(verifyNumerics('აპიქსაბანი 5 მგ ორჯერ დღეში.', [], facts)[0].status).toBe('VERIFIED_AGAINST_ENGINE');
  });

  it('a different unit, route, frequency or population is not a match', () => {
    const facts = factsFrom('Apixaban 2.5 mg orally twice daily in adults.', 'engine', 'A07');
    expect(verifyNumerics('apixaban 2.5 mcg', [], facts)[0].status).toBe('UNVERIFIED');
    expect(verifyNumerics('apixaban 2.5 mg ინტრავენურად', [], facts)[0].status).toBe('UNVERIFIED');
    expect(verifyNumerics('apixaban 2.5 mg დღეში ერთხელ', [], facts)[0].status).toBe('UNVERIFIED');
    expect(verifyNumerics('apixaban 2.5 mg ბავშვებში', [], facts)[0].status).toBe('UNVERIFIED');
    expect(verifyNumerics('apixaban 2.5 mg ორჯერ დღეში', [], facts)[0].status).toBe('VERIFIED_AGAINST_ENGINE');
  });

  it('converts g ↔ mg within the same dimension and keeps the passage', () => {
    const r = verifyNumerics('ცეფტრიაქსონი 1000 მგ ინტრავენურად.', [rule('R-CEF', 'Ceftriaxone 1 g IV once daily.')]);
    expect(r[0].status).toBe('VERIFIED_AGAINST_RULE');
    expect(r[0].evidence?.passage).toMatch(/Ceftriaxone 1 g IV/);
    expect(r[0].supportingRuleIds).toEqual(['R-CEF']);
  });

  it('a dose the user wrote is reported as the user’s, not as verified', () => {
    const ledger = buildLedger([agent('A07', 'პრეპარატის იდენტობა დადასტურებული არ არის.')], 'ვიღებ ვარფარინს 5 მგ დღეში ერთხელ');
    const r = verifyNumerics('თქვენ იღებთ ვარფარინს 5 მგ დღეში ერთხელ.', [], ledger);
    expect(r[0].status).toBe('USER_PROVIDED');
    expect(r[0].noteKa).toMatch(/არ ადასტურებს/);
  });

  it('a value computed by a formula is engine-verified only with its unit', () => {
    const ledger = buildLedger([agent('A09', 'Cockcroft-Gault: CrCl 45 მლ/წთ')], 'ასაკი 80 წლის');
    expect(verifyNumerics('კლირენსი 45 მლ/წთ-ია.', [], ledger)[0].status).toBe('VERIFIED_AGAINST_ENGINE');
    expect(verifyNumerics('დოზა 45 მგ.', [], ledger)[0].status).toBe('UNVERIFIED');
  });
});
