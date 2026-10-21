import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { timingSafeEqual } from 'node:crypto';
import { FOREIGN_SCRIPT, SYSTEM_PROMPT } from '@/services/orchestrator';

/**
 * OPERATOR EVALUATION — script-drift rate per model.
 *
 * Exists only when EVAL_TOKEN is configured, and answers only a caller that
 * presents it. Sends the production synthesis prompt with a caller-supplied,
 * synthetic (non-patient) context N times and reports how often the output
 * contains a forbidden script. Returns counts and token usage, plus one output
 * per synthetic context only when `sample` is requested. Never changes the
 * model used for real answers.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const want = process.env.EVAL_TOKEN ?? '';
  const got = req.headers.get('x-eval-token') ?? '';
  if (!want || want.length < 32 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(req: Request) {
  if (!authorised(req)) return new NextResponse(null, { status: 404 });
  const list = await client().models.list();
  return NextResponse.json({ models: list.data.map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id)).sort() });
}

export async function POST(req: Request) {
  if (!authorised(req)) return new NextResponse(null, { status: 404 });
  const body = (await req.json()) as { model?: string; contexts?: string[]; n?: number; effort?: 'minimal' | 'low' | 'medium'; sample?: boolean };
  const model = String(body.model ?? '');
  const contexts = (body.contexts ?? []).filter((c) => typeof c === 'string' && c.length > 20).slice(0, 5);
  const n = Math.min(Math.max(Number(body.n ?? 10), 1), 15);
  if (!model || !contexts.length) return NextResponse.json({ error: 'model and contexts required' }, { status: 400 });

  const c = client();
  const runs: { ctx: number; drift: boolean; empty: boolean; inputTokens: number; outputTokens: number; ms: number; error?: string; text?: string }[] = [];
  const jobs = contexts.flatMap((ctx, i) => Array.from({ length: n }, () => ({ ctx, i })));
  // Bounded concurrency keeps the run inside the function's time limit without bursting the account.
  for (let k = 0; k < jobs.length; k += 5) {
    await Promise.all(
      jobs.slice(k, k + 5).map(async ({ ctx, i }) => {
        const t = Date.now();
        try {
          const r = await c.responses.create({
            model,
            store: false,
            max_output_tokens: 700,
            ...(body.effort ? { reasoning: { effort: body.effort } } : {}),
            input: [
              { role: 'developer', content: SYSTEM_PROMPT },
              { role: 'user', content: ctx.slice(0, 12000) },
            ],
          });
          const text = (r.output_text ?? '').trim();
          runs.push({ ctx: i, drift: FOREIGN_SCRIPT.test(text), empty: !text, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0, ms: Date.now() - t, text });
        } catch (e) {
          runs.push({ ctx: i, drift: false, empty: true, inputTokens: 0, outputTokens: 0, ms: Date.now() - t, error: (e as Error).message.slice(0, 160) });
        }
      }),
    );
  }
  const ok = runs.filter((r) => !r.error);
  return NextResponse.json({
    model,
    total: runs.length,
    errors: runs.filter((r) => r.error).length,
    errorSample: runs.find((r) => r.error)?.error ?? null,
    drift: ok.filter((r) => r.drift).length,
    empty: ok.filter((r) => r.empty).length,
    perContext: contexts.map((_, i) => ({ ctx: i, n: ok.filter((r) => r.ctx === i).length, drift: ok.filter((r) => r.ctx === i && r.drift).length })),
    avgInputTokens: Math.round(ok.reduce((a, r) => a + r.inputTokens, 0) / Math.max(1, ok.length)),
    avgOutputTokens: Math.round(ok.reduce((a, r) => a + r.outputTokens, 0) / Math.max(1, ok.length)),
    avgMs: Math.round(ok.reduce((a, r) => a + r.ms, 0) / Math.max(1, ok.length)),
    // Contexts are synthetic test cases supplied by the operator, so one output
    // per context may be returned for quality review when explicitly requested.
    samples: body.sample ? contexts.map((_, i) => ok.find((r) => r.ctx === i && !r.drift)?.text ?? null) : undefined,
  });
}
