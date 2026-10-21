import 'server-only';
import type { RiskClass, ClinicalMode, Intent } from '@/schemas/clinical';

/**
 * MODEL ROUTER — decides which model tier, temperature and verification budget a
 * request gets. Kept as a standalone service so the routing policy can evolve
 * independently of both the agents and the provider.
 */

export type RouteDecision = {
  tier: 'fast' | 'reasoning';
  temperature: number;
  maxTokens: number;
  requireCitationVerification: boolean;
  requireNumericVerification: boolean;
  requireSafetyGate: boolean;
  rationale: string;
};

const HIGH_RISK: RiskClass[] = ['R3', 'R4', 'R5'];

export function routeModel(params: { risk: RiskClass; mode: ClinicalMode; intent: Intent; hasPatientContext: boolean }): RouteDecision {
  const { risk, mode, intent, hasPatientContext } = params;
  const deep = mode === 'deep' || mode === 'challenge' || mode === 'quality' || mode === 'second-opinion' || HIGH_RISK.includes(risk);
  const numeric = intent === 'drug' || intent === 'calculator' || intent === 'medication_review' || intent === 'laboratory';

  return {
    tier: deep ? 'reasoning' : 'fast',
    temperature: risk === 'R4' || risk === 'R5' ? 0.1 : deep ? 0.2 : 0.3,
    maxTokens: deep ? 3200 : 1600,
    requireCitationVerification: risk !== 'R0',
    requireNumericVerification: numeric,
    requireSafetyGate: HIGH_RISK.includes(risk) || numeric,
    rationale: [
      `რისკის კლასი ${risk}`,
      deep ? 'გამოიყენება reasoning მოდელი' : 'გამოიყენება fast მოდელი',
      numeric ? 'ჩართულია რიცხვითი ვერიფიკაცია' : 'რიცხვითი ვერიფიკაცია არ არის საჭირო',
      hasPatientContext ? 'პაციენტის კონტექსტი მოწოდებულია' : 'პაციენტის კონტექსტი არ არის მოწოდებული',
    ].join(' · '),
  };
}
