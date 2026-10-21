import 'server-only';
import type { TraceEvent } from '@/services/orchestrator';

/**
 * Observed agent outcomes (audit F14). `implemented` in the registry only says
 * that code exists; this records what actually happened when it ran, per
 * process since start. It is evidence of execution, not of clinical validity.
 */
type Stat = { runs: number; ok: number; insufficient_input: number; unavailable: number; error: number; timeout: number; skipped: number; lastStatus: string; lastAt: string; totalMs: number };
const stats = new Map<string, Stat>();
const since = new Date().toISOString();

export function recordTrace(trace: TraceEvent[]) {
  for (const e of trace) {
    const id = e.tool.startsWith('agent:') ? e.tool.slice(6) : e.tool;
    const s = stats.get(id) ?? { runs: 0, ok: 0, insufficient_input: 0, unavailable: 0, error: 0, timeout: 0, skipped: 0, lastStatus: '', lastAt: '', totalMs: 0 };
    s.runs += 1;
    s[e.status] += 1;
    s.lastStatus = e.status;
    s.lastAt = new Date().toISOString();
    s.totalMs += e.ms;
    stats.set(id, s);
  }
}

export function observed(id: string) {
  const s = stats.get(id);
  return s ? { ...s, meanMs: Math.round(s.totalMs / s.runs) } : null;
}

export const observedSince = () => since;
