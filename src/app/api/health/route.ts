import { NextResponse } from 'next/server';
import { engineStatus } from '@/services/ai-provider';
import { AGENTS } from '@/agents/registry';
import { SOURCES } from '@/knowledge/sources';
import { DRUGS } from '@/knowledge/drugs';
import { CALCULATORS } from '@/lib/calculators';
import { DEFECT_CLASSES } from '@/knowledge/defect-classifier';

export const runtime = 'nodejs';

export async function GET() {
  const e = engineStatus();
  return NextResponse.json({
    status: 'ok',
    engine: e.engine,
    counts: { agents: AGENTS.length, sources: SOURCES.length, drugs: DRUGS.length, calculators: CALCULATORS.length, defectClasses: DEFECT_CLASSES.length },
    persistence: { patientData: 'session-only', database: process.env.DATABASE_URL ? 'configured' : 'not-configured' },
    // Presence only — the value is never returned.
    medications: { openFdaKey: process.env.OPENFDA_API_KEY ? 'configured' : 'not-configured' },
  });
}
