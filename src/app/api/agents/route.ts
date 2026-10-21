import { NextResponse } from 'next/server';
import { AGENTS } from '@/agents/registry';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import { observed, observedSince } from '@/services/agent-stats';

export const runtime = 'nodejs';

/**
 * Agent registry with two separate facts (audit F14):
 *   implementation — what kind of code backs the agent (a function, a stage of
 *                    the orchestrator, or nothing);
 *   observed       — outcomes actually recorded on THIS instance since it
 *                    started (ok / insufficient_input / error / timeout …).
 * Neither is clinical validation.
 */
const STAGE = new Set(['A00', 'A19', 'A20']);

export async function GET() {
  return NextResponse.json({
    agents: AGENTS.map((a) => {
      const implementation = STAGE.has(a.id) ? 'orchestrator_stage' : AGENT_IMPLEMENTATIONS[a.id] ? 'agent_function' : 'none';
      return { ...a, implemented: implementation !== 'none', implementation, observed: observed(a.id) };
    }),
    total: AGENTS.length,
    observedSince: observedSince(),
    noteKa: '„implemented“ ნიშნავს, რომ კოდი არსებობს; „observed“ — ამ ინსტანციაზე ფაქტობრივად დაფიქსირებულ შედეგებს. არცერთი არ არის კლინიკური ვალიდაცია.',
  });
}
