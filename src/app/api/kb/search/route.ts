import { NextResponse } from 'next/server';
import { z } from 'zod';
import { retrieveRules } from '@/kb/retrieval-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  query: z.string().min(1).max(2000),
  kinds: z.array(z.enum(['clinical_rule', 'quality_rule', 'audit_question'])).optional(),
  limit: z.number().int().min(1).max(40).optional(),
  excludeCandidates: z.boolean().optional(),
  requireComputable: z.boolean().optional(),
  lexicalWeight: z.number().min(0).max(1).optional(),
  semanticWeight: z.number().min(0).max(1).optional(),
  availableData: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
});

export async function POST(req: Request) {
  const devEnabled = process.env.ENABLE_DEV_TOOLS === '1';
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', messageKa: 'მოთხოვნის ფორმატი არასწორია.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues }, { status: 422 });

  const { query, debug, ...filters } = parsed.data;
  const result = await retrieveRules(query, filters);

  return NextResponse.json({
    coverage: result.coverage,
    messageKa: result.messageKa,
    hits: result.hits,
    ruleIds: result.ruleIds,
    // The full retrieval trace is a developer tool and is never exposed publicly.
    trace: debug && devEnabled ? result.trace : null,
  });
}
