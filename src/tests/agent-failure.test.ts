import { describe, expect, it } from 'vitest';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import { AgentResultSchema } from '@/schemas/agent';
import type { AgentContext } from '@/agents/context';
import { emptyPatientContext } from '@/schemas/clinical';

/**
 * F14 (audit 2026-10-21): the failure column of the agent matrix. With no
 * usable input every agent must return a valid result object with an explicit
 * status — never throw, never return "ok" with invented content.
 */
const empty = (): AgentContext =>
  ({ question: '', plan: '', patient: emptyPatientContext(), mode: 'quick', intent: 'clinical_reasoning', risk: 'R1', emergency: false, hits: [], reviewMode: 'clinician', academyLevel: 'specialist', extras: {}, results: new Map() }) as unknown as AgentContext;

describe('agents on empty input', () => {
  for (const [id, impl] of Object.entries(AGENT_IMPLEMENTATIONS)) {
    it(`${id} returns a valid, explicit result`, async () => {
      const r = await Promise.resolve(impl(empty()));
      expect(() => AgentResultSchema.parse(r)).not.toThrow();
      expect(r.agentId).toBe(id);
      // Nothing to work on: either a non-ok status, or an ok without claims or sources.
      if (r.status === 'ok') {
        expect(r.claims, `${id} claims on empty input`).toEqual([]);
      }
    });
  }
});
