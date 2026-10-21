import { describe, expect, it } from 'vitest';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import { AGENTS } from '@/agents/registry';
import type { AgentContext } from '@/agents/context';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { emptyPatientContext } from '@/schemas/clinical';

/**
 * Phase 5 — every content agent, on a realistic case, must return status "ok"
 * and substantive text. A00 (orchestrator), A19 (citation/numeric verifier) and
 * A20 (release gate) are infrastructure and are exercised end-to-end in
 * verifiers-phase3 and open-corpus tests.
 */

const demo = DEMO_CASES[0];
const base = (over: Partial<AgentContext>): AgentContext =>
  ({
    question: demo.suggestedQuestion, plan: '', patient: demo.patient, mode: 'deep', intent: 'clinical_reasoning', risk: 'R3', emergency: false,
    hits: [], reviewMode: 'clinician', academyLevel: 'resident', extras: {}, results: new Map(), ...over,
  }) as AgentContext;

const NARRATIVE = 'პაციენტი მიღებულ იქნა მუცლის ტკივილით. ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე, დიაგნოზი დაგვიანდა 48 საათით.';

const CASES: Record<string, Partial<AgentContext>> = {
  A01: {},
  A02: {},
  A03: {},
  A04: { mode: 'challenge', plan: 'დავიწყოთ ასპირინი და კლოპიდოგრელი 21 დღით, შემდეგ სტატინი.' },
  A05: { question: 'წინაგულების ფიბრილაცია ანტიკოაგულაცია თირკმლის უკმარისობა' },
  A06: { question: 'რას ამბობს ESC და AHA გაიდლაინი ანტიკოაგულაციაზე წინაგულების ფიბრილაციისას?' },
  A07: { question: 'აპიქსაბანის დოზა', extras: { drug: 'აპიქსაბანი' } },
  A08: { patient: { ...emptyPatientContext(), age: 82, medications: ['ამიტრიპტილინი', 'დიაზეპამი', 'ომეპრაზოლი', 'ცერებროლიზინი', 'ვარფარინი', 'იბუპროფენი'].map((d, i) => ({ id: `m${i}`, drug: d, dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' as const })) } },
  A09: { question: 'გამოთვალე CHA2DS2-VASc' },
  A10: { patient: { ...emptyPatientContext(), labs: [{ id: 'l1', analyte: 'sodium', value: 124, unit: 'mmol/L', date: '' }, { id: 'l2', analyte: 'potassium', value: 6.2, unit: 'mmol/L', date: '' }] } },
  A11: { extras: { reportText: 'გულმკერდის კტ: მარჯვენა ფილტვში მყარი კვანძი 9 მმ. პნევმოთორაქსი არ ვლინდება. დასკვნა: ფილტვის კვანძი 9 მმ.' } },
  A12: { question: 'მომიმზადე ეპიკრიზი' },
  A13: { mode: 'quality', extras: { caseNarrative: NARRATIVE } },
  A14: { mode: 'quality', extras: { caseNarrative: NARRATIVE, claim: 'პაციენტი აცხადებს, რომ თანხმობა არ მიუცია' } },
  A15: { question: 'ფორმა 100 და ინფორმირებული თანხმობა' },
  A16: { mode: 'patient', question: 'მაქვს წინაგულების ფიბრილაცია, რას ნიშნავს?' },
  A17: { extras: { topic: 'პოლიფარმაცია და დეპრესკრაიბინგი' } },
  A18: { extras: { researchQuestion: 'დეპრესკრაიბინგი და დაცემები', pico: { p: 'ხანდაზმული', i: 'ბენზოდიაზეპინი', o: 'დაცემა' } } },
};

const text = (r: { summary: string; sections: { body: string; bullets: string[] }[] }) => [r.summary, ...r.sections.flatMap((s) => [s.body, ...s.bullets])].join(' ');

describe('every content agent produces substantive output', () => {
  it('covers every implemented agent', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(AGENT_IMPLEMENTATIONS).sort());
    // Every registry agent is either implemented or infrastructure.
    const infra = new Set(['A00', 'A19', 'A20']);
    for (const a of AGENTS) expect(infra.has(a.id) || a.id in AGENT_IMPLEMENTATIONS).toBe(true);
  });

  for (const [id, over] of Object.entries(CASES)) {
    it(`${id} returns ok with real content`, async () => {
      const r = await Promise.resolve(AGENT_IMPLEMENTATIONS[id](base(over)));
      expect(r.status, `${id}: ${r.note}`).toBe('ok');
      expect(text(r).length, `${id} text too thin`).toBeGreaterThan(120);
      expect(r.sections.length).toBeGreaterThan(0);
    });
  }
});
