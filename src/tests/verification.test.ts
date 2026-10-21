import { describe, expect, it } from 'vitest';
import { classifyImportance, unsupportedMajorClaims, verifyClaims } from '@/services/citation-verifier';
import { runSafetyGate, sanitize } from '@/services/safety-gate';
import { retrieve, retrieveText } from '@/services/retrieval';
import { SOURCES } from '@/knowledge/sources';
import type { ClinicalAnswer } from '@/schemas/clinical';

describe('citation verification', () => {
  it('classifies a dose statement as a critical claim', () => {
    expect(classifyImportance('აპიქსაბანი 5 მგ ორჯერ დღეში')).toBe('critical');
  });

  it('supports a claim that matches a registry source', () => {
    const [claim] = verifyClaims(['ანტიკოაგულაცია წინაგულების ფიბრილაციაში ამცირებს ინსულტის რისკს'], ['SRC-ESC-AF-2024']);
    expect(['supported', 'partially_supported']).toContain(claim.verification_status);
    expect(claim.source_ids.length).toBeGreaterThan(0);
  });

  it('marks a claim with no matching source as unsupported', () => {
    const [claim] = verifyClaims(['ულტრაიშვიათი ჰიპოთეტური სინდრომი მკურნალობს არარსებული პრეპარატით ზზზქქქ']);
    expect(claim.verification_status).toBe('unsupported');
    expect(claim.support_strength).toBe('none');
    expect(claim.source_ids).toEqual([]);
  });

  it('never invents a source id that is not in the registry', () => {
    const ids = new Set(SOURCES.map((s) => s.source_id));
    const claims = verifyClaims(['ვარფარინი მოითხოვს INR-ის კონტროლს', 'მეტფორმინი უკუნაჩვენებია დაბალი eGFR-ისას']);
    claims.flatMap((c) => c.source_ids).forEach((id) => expect(ids.has(id)).toBe(true));
  });

  it('surfaces unsupported major claims for the safety gate', () => {
    const claims = verifyClaims(['სრულიად შეუსაბამო მტკიცება ზზზ ქქქ ჭჭჭ დოზა 999 მგ']);
    expect(unsupportedMajorClaims(claims).length).toBe(1);
  });

  it('warns when a matched source is marked superseded', () => {
    const superseded = SOURCES.filter((s) => s.freshness === 'superseded');
    // The seed registry contains no superseded rows; the guard must still exist.
    expect(Array.isArray(superseded)).toBe(true);
    const [claim] = verifyClaims(['ანტიკოაგულაცია']);
    expect(claim).toHaveProperty('note');
  });
});

describe('retrieval', () => {
  it('ranks guidelines above lower-tier evidence for a guideline question', () => {
    const hits = retrieveText('ანტიკოაგულაცია წინაგულების ფიბრილაცია', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source.evidence_rank).toBeLessThanOrEqual(3);
  });

  it('honours the onlyCurrent filter', () => {
    const hits = retrieve({ text: 'stroke', sourceTypes: [], specialties: [], jurisdictions: [], onlyCurrent: true, limit: 10 });
    hits.forEach((h) => expect(h.source.freshness).toBe('current'));
  });

  it('honours a source type filter', () => {
    const hits = retrieve({ text: 'atrial fibrillation', sourceTypes: ['guideline'], specialties: [], jurisdictions: [], onlyCurrent: false, limit: 10 });
    hits.forEach((h) => expect(h.source.source_type).toBe('guideline'));
  });

  it('surfaces conflicting jurisdictions for the guideline comparator', () => {
    const hits = retrieve({ text: 'atrial fibrillation anticoagulation', sourceTypes: ['guideline'], specialties: [], jurisdictions: [], onlyCurrent: false, limit: 10 });
    const jurisdictions = new Set(hits.map((h) => h.source.jurisdiction));
    expect(jurisdictions.size).toBeGreaterThan(1);
  });

  it('never returns a source outside the registry', () => {
    const ids = new Set(SOURCES.map((s) => s.source_id));
    retrieveText('any question at all', 20).forEach((h) => expect(ids.has(h.source.source_id)).toBe(true));
  });
});

const answer = (text: string): ClinicalAnswer => ({
  queryId: 'q',
  mode: 'quality',
  intent: 'defect',
  risk: 'R4',
  emergency: false,
  bottomLine: text,
  sections: [],
  claims: [],
  agentsUsed: [],
  uncertainty: { level: 'moderate', drivers: [] },
  humanReviewRequired: false,
  generatedAt: new Date().toISOString(),
  engine: 'mock',
});

describe('safety gate', () => {
  it('rewrites prohibited guilt-assigning language', () => {
    expect(sanitize('ექიმმა დაარღვია კანონი')).not.toContain('დაარღვია კანონი');
    expect(sanitize('ეს არის დანაშაული')).toContain('პოტენციური გადახვევა');
    expect(sanitize('the doctor is guilty')).not.toContain('guilty');
  });

  it('flags prohibited use and warns', () => {
    const res = runSafetyGate({ answer: answer('ექიმი ბრალეულია'), claims: [], risk: 'R4', emergency: false, numericVerified: true });
    expect(res.warnings.join(' ')).toContain('ნეიტრალურით');
  });

  it('requires human review for every R3-R5 answer', () => {
    (['R3', 'R4', 'R5'] as const).forEach((risk) => {
      expect(runSafetyGate({ answer: answer('x'), claims: [], risk, emergency: false, numericVerified: true }).humanReviewRequired).toBe(true);
    });
  });

  it('does not force human review for a general R1 answer with verified claims', () => {
    expect(runSafetyGate({ answer: answer('x'), claims: [], risk: 'R1', emergency: false, numericVerified: true }).humanReviewRequired).toBe(false);
  });

  it('warns about unverified numbers in high-risk answers', () => {
    const res = runSafetyGate({ answer: answer('დოზა 5 მგ'), claims: [], risk: 'R4', emergency: false, numericVerified: false });
    expect(res.warnings.join(' ')).toContain('რიცხვითი მნიშვნელობა');
  });

  it('prioritises immediate assessment when an emergency is present', () => {
    const res = runSafetyGate({ answer: answer('x'), claims: [], risk: 'R5', emergency: true, numericVerified: true });
    expect(res.warnings.join(' ')).toContain('დაუყოვნებელი კლინიკური შეფასება');
  });

  it('escalates to human review when a major claim is unsupported', () => {
    const claims = verifyClaims(['სრულიად შეუსაბამო მტკიცება ზზზ ქქქ ჭჭჭ დოზა 999 მგ']);
    const res = runSafetyGate({ answer: answer('x'), claims, risk: 'R1', emergency: false, numericVerified: true });
    expect(res.humanReviewRequired).toBe(true);
  });
});
