import { randomUUID } from 'node:crypto';
import { kbExists, openDb } from '@/kb/db';

/**
 * USAGE METERING AND TRACEABILITY.
 *
 * Every AI run is recorded with the model used, token counts, retrieved rule ids
 * and release status. No patient-identifiable text is ever written here — only
 * the query terms needed for retrieval debugging, and only when explicitly enabled.
 */

export type ModelPricing = { model: string; inputPerMTok: number; cachedInputPerMTok: number; outputPerMTok: number };

/**
 * Pricing is configuration, not agent logic. Override with MODEL_PRICING_JSON:
 *   [{"model":"gpt-6-luna","inputPerMTok":0.1,"cachedInputPerMTok":0.01,"outputPerMTok":0.5}]
 * Published list prices are recorded below; a deployment on different terms sets
 * its own. A model absent from the table costs 0, which would understate spend —
 * `isPriced()` lets the dashboards say "unpriced" instead of showing a false zero.
 */
export function pricingTable(): ModelPricing[] {
  const raw = process.env.MODEL_PRICING_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ModelPricing[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* fall through to defaults */
    }
  }
  return [
    { model: 'gpt-6-luna', inputPerMTok: 0.1, cachedInputPerMTok: 0.01, outputPerMTok: 0.5 },
    // Fallback candidates measured for script drift (2026-10-17 public rate cards).
    { model: 'gpt-5.4-mini', inputPerMTok: 0.75, cachedInputPerMTok: 0.075, outputPerMTok: 4.5 },
    { model: 'gpt-5.4-nano', inputPerMTok: 0.2, cachedInputPerMTok: 0.02, outputPerMTok: 1.25 },
    { model: 'gpt-4o-mini', inputPerMTok: 0.15, cachedInputPerMTok: 0.075, outputPerMTok: 0.6 },
    { model: 'gpt-4o', inputPerMTok: 2.5, cachedInputPerMTok: 1.25, outputPerMTok: 10 },
    { model: 'text-embedding-3-small', inputPerMTok: 0.02, cachedInputPerMTok: 0.02, outputPerMTok: 0 },
    { model: 'gmai-hash-ngram-v1', inputPerMTok: 0, cachedInputPerMTok: 0, outputPerMTok: 0 },
    { model: 'deterministic', inputPerMTok: 0, cachedInputPerMTok: 0, outputPerMTok: 0 },
  ];
}

/** Whether the table carries a price for this model. */
export function isPriced(model: string): boolean {
  return pricingTable().some((x) => x.model === model);
}

export function estimateCost(model: string, inputTokens: number, cachedInputTokens: number, outputTokens: number): number {
  const table = pricingTable();
  // The API reports dated snapshots ("gpt-5.4-mini-2026-03-17"); price them as their family.
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  let p = table.find((x) => x.model === model) ?? table.find((x) => x.model === base);
  if (!p) {
    if (model === 'deterministic' || !model) return 0;
    // An unpriced model is costed at the highest known rate, never at zero:
    // a zero estimate would let the daily budget guard run past its ceiling.
    const max = (k: 'inputPerMTok' | 'cachedInputPerMTok' | 'outputPerMTok') => Math.max(...table.map((x) => x[k]));
    p = { model, inputPerMTok: max('inputPerMTok'), cachedInputPerMTok: max('cachedInputPerMTok'), outputPerMTok: max('outputPerMTok') };
  }
  const billableInput = Math.max(0, inputTokens - cachedInputTokens);
  return (billableInput * p.inputPerMTok + cachedInputTokens * p.cachedInputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
}

export type AiRunRecord = {
  runId?: string;
  sessionId?: string | null;
  requestType?: string;
  agent?: string;
  model?: string;
  intent?: string;
  riskLevel?: string;
  retrievalQuery?: string;
  retrievedRuleIds?: string[];
  agentsCalled?: string[];
  toolsCalled?: string[];
  verifierStatus?: string;
  releaseStatus?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  toolCalls?: number;
  latencyMs?: number;
  /** Generations discarded for containing a non-Georgian script. */
  scriptRejections?: number;
};

/**
 * In-process ledger for deployments without the knowledge database (the public
 * tier, and any serverless instance). It is per-instance and therefore partial
 * by nature — the durable record is the SQLite ledger below, and the per-request
 * figures the API returns to the caller. It exists so that spend is never simply
 * unobserved.
 */
type LedgerTotals = { runs: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; costUsd: number };
const ledger = new Map<string, LedgerTotals>();

export function ledgerTotals(): { model: string; totals: LedgerTotals }[] {
  return [...ledger.entries()].map(([model, totals]) => ({ model, totals }));
}

export function resetLedger() {
  ledger.clear();
}

function addToLedger(model: string, rec: AiRunRecord, cost: number) {
  const t = ledger.get(model) ?? { runs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 };
  t.runs += 1;
  t.inputTokens += rec.inputTokens ?? 0;
  t.cachedInputTokens += rec.cachedInputTokens ?? 0;
  t.outputTokens += rec.outputTokens ?? 0;
  t.costUsd += cost;
  ledger.set(model, t);
}

/** Best-effort. Metering must never break a clinical response. */
export function recordRun(rec: AiRunRecord): string {
  const runId = rec.runId ?? randomUUID();
  const model = rec.model ?? 'deterministic';
  const cost = estimateCost(model, rec.inputTokens ?? 0, rec.cachedInputTokens ?? 0, rec.outputTokens ?? 0);
  addToLedger(model, rec, cost);

  // A structured line so spend is auditable from the host's logs even where no
  // database exists. Deliberately carries no case text.
  if (model !== 'deterministic') {
    console.info(
      JSON.stringify({
        evt: 'ai_run',
        runId,
        model,
        priced: isPriced(model),
        inputTokens: rec.inputTokens ?? 0,
        cachedInputTokens: rec.cachedInputTokens ?? 0,
        outputTokens: rec.outputTokens ?? 0,
        estimatedCostUsd: Number(cost.toFixed(6)),
        releaseStatus: rec.releaseStatus,
        scriptRejections: rec.scriptRejections ?? 0,
        latencyMs: rec.latencyMs,
      }),
    );
  }

  if (!kbExists()) return runId;
  try {
    const db = openDb();
    db.prepare(
      `INSERT OR REPLACE INTO ai_runs (
        run_id, session_id, created_at, request_type, agent, model, intent, risk_level, retrieval_query,
        retrieved_rule_ids, agents_called, tools_called, verifier_status, release_status,
        input_tokens, cached_input_tokens, output_tokens, tool_calls, latency_ms, estimated_cost_usd
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      runId,
      rec.sessionId ?? null,
      new Date().toISOString(),
      rec.requestType ?? null,
      rec.agent ?? null,
      model,
      rec.intent ?? null,
      rec.riskLevel ?? null,
      process.env.LOG_RETRIEVAL_QUERY === '1' ? (rec.retrievalQuery ?? null) : null,
      JSON.stringify(rec.retrievedRuleIds ?? []),
      JSON.stringify(rec.agentsCalled ?? []),
      JSON.stringify(rec.toolsCalled ?? []),
      rec.verifierStatus ?? null,
      rec.releaseStatus ?? null,
      rec.inputTokens ?? 0,
      rec.cachedInputTokens ?? 0,
      rec.outputTokens ?? 0,
      rec.toolCalls ?? 0,
      rec.latencyMs ?? 0,
      cost,
    );
  } catch {
    /* metering is best-effort */
  }
  return runId;
}

export type UsageSummary = {
  today: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  month: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  byAgent: { agent: string; runs: number; cost: number }[];
  byModel: { model: string; runs: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; cost: number }[];
  costliest: { agent: string; requestType: string; cost: number; runId: string; createdAt: string }[];
  mostUsed: { requestType: string; runs: number }[];
  avgCostPerRun: number;
  totalCost: number;
  totalRuns: number;
};

export function usageSummary(): UsageSummary {
  const empty: UsageSummary = {
    today: { runs: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
    month: { runs: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
    byAgent: [],
    byModel: [],
    costliest: [],
    mostUsed: [],
    avgCostPerRun: 0,
    totalCost: 0,
    totalRuns: 0,
  };
  if (!kbExists()) return empty;
  const db = openDb({ readonly: true });
  const day = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const window = (prefix: string) =>
    db
      .prepare(
        `SELECT COUNT(*) runs, COALESCE(SUM(estimated_cost_usd),0) cost, COALESCE(SUM(input_tokens),0) it, COALESCE(SUM(output_tokens),0) ot
         FROM ai_runs WHERE substr(created_at,1,${prefix.length}) = ?`,
      )
      .get(prefix) as { runs: number; cost: number; it: number; ot: number };

  const d = window(day);
  const m = window(month);
  const totals = db.prepare('SELECT COUNT(*) runs, COALESCE(SUM(estimated_cost_usd),0) cost FROM ai_runs').get() as { runs: number; cost: number };

  return {
    today: { runs: d.runs, cost: d.cost, inputTokens: d.it, outputTokens: d.ot },
    month: { runs: m.runs, cost: m.cost, inputTokens: m.it, outputTokens: m.ot },
    byAgent: db.prepare('SELECT COALESCE(agent,\'—\') agent, COUNT(*) runs, COALESCE(SUM(estimated_cost_usd),0) cost FROM ai_runs GROUP BY agent ORDER BY runs DESC LIMIT 25').all() as UsageSummary['byAgent'],
    byModel: db
      .prepare(
        `SELECT COALESCE(model,'—') model, COUNT(*) runs, COALESCE(SUM(input_tokens),0) inputTokens,
                COALESCE(SUM(cached_input_tokens),0) cachedInputTokens, COALESCE(SUM(output_tokens),0) outputTokens,
                COALESCE(SUM(estimated_cost_usd),0) cost
         FROM ai_runs GROUP BY model ORDER BY cost DESC`,
      )
      .all() as UsageSummary['byModel'],
    costliest: db
      .prepare("SELECT COALESCE(agent,'—') agent, COALESCE(request_type,'—') requestType, estimated_cost_usd cost, run_id runId, created_at createdAt FROM ai_runs ORDER BY estimated_cost_usd DESC LIMIT 10")
      .all() as UsageSummary['costliest'],
    mostUsed: db.prepare("SELECT COALESCE(request_type,'—') requestType, COUNT(*) runs FROM ai_runs GROUP BY request_type ORDER BY runs DESC LIMIT 10").all() as UsageSummary['mostUsed'],
    avgCostPerRun: totals.runs ? totals.cost / totals.runs : 0,
    totalCost: totals.cost,
    totalRuns: totals.runs,
  };
}

/** Rough token estimate when a provider returns no usage block. */
export const approxTokens = (text: string) => Math.ceil(text.length / 3.6);
