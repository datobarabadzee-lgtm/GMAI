import { describe, expect, it, vi } from 'vitest';
import type { AiRunRecord } from '@/services/metering';

/**
 * F13/F14 (audit 2026-10-21): toolsCalled was a fixed list and toolCalls a
 * constant 3. They now come from the run's own trace, and each agent reports
 * its real outcome, including a timeout.
 */

const recorded: AiRunRecord[] = [];
vi.mock('@/services/metering', async (orig) => {
  const real = await orig<typeof import('@/services/metering')>();
  return { ...real, recordRun: (r: AiRunRecord) => (recorded.push(r), real.recordRun(r)) };
});

describe('run trace', () => {
  it('records what actually ran and derives the ledger fields from it', async () => {
    const { orchestrate } = await import('@/services/orchestrator');
    const { emptyPatientContext } = await import('@/schemas/clinical');
    const out = await orchestrate({ question: 'ვარფარინი და იბუპროფენი ერთად — რისკი?', mode: 'quick', patient: emptyPatientContext() } as Parameters<typeof orchestrate>[0]);
    const tools = out.trace.map((e) => e.tool);
    expect(tools).toContain('registry_search');
    expect(tools).toContain('medication_identity');
    expect(tools.some((t) => t.startsWith('agent:'))).toBe(true);
    expect(tools).toContain('ai_synthesis');
    for (const e of out.trace) expect(['ok', 'skipped', 'insufficient_input', 'unavailable', 'error', 'timeout']).toContain(e.status);
    // Agents in the trace are exactly the agents whose results are reported.
    const traced = out.trace.filter((e) => e.tool.startsWith('agent:')).map((e) => e.tool.slice(6)).sort();
    expect(traced).toEqual(out.agentResults.map((r) => r.agentId).sort());

    const rec = recorded.at(-1)!;
    expect(rec.toolsCalled).toEqual([...new Set(out.trace.filter((e) => e.status !== 'skipped').map((e) => e.tool))]);
    expect(rec.toolCalls).toBe(out.trace.filter((e) => e.status !== 'skipped' && e.status !== 'unavailable').length);
    expect(rec.toolsCalled).not.toEqual(['hybrid_search', 'medication_review', 'calculators']);
  });

  it('reports a slow agent as timeout instead of waiting for it', async () => {
    const { runAgent } = await import('@/services/orchestrator');
    const { AGENT_IMPLEMENTATIONS } = await import('@/agents/implementations');
    const real = AGENT_IMPLEMENTATIONS.A01;
    AGENT_IMPLEMENTATIONS.A01 = () => new Promise(() => {});
    process.env.AGENT_TIMEOUT_MS = '50';
    try {
      const trace: { tool: string; status: string; ms: number }[] = [];
      const r = await runAgent('A01', {} as never, trace as never);
      expect(r.status).toBe('timeout');
      expect(trace[0]).toMatchObject({ tool: 'agent:A01', status: 'timeout' });
    } finally {
      AGENT_IMPLEMENTATIONS.A01 = real;
      delete process.env.AGENT_TIMEOUT_MS;
    }
  });
});
