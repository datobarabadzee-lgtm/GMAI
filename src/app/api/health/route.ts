import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { AGENTS } from '@/agents/registry';
import { SOURCES } from '@/knowledge/sources';
import { DRUGS } from '@/knowledge/drugs';
import { CALCULATORS } from '@/lib/calculators';
import { DEFECT_CLASSES } from '@/knowledge/defect-classifier';
import { appTier } from '@/lib/tier';
import { releaseSummary } from '@/server/release';
import { limitStoreInfo } from '@/services/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const started = Date.now();

function catalog() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'knowledge', 'medications', 'manifest.json'), 'utf8'));
    return { snapshot: m.snapshot, fdaLabelRecords: m.counts?.label ?? null, fdaNdcRecords: m.counts?.ndc ?? null, misNameEntities: m.mis_entities ?? null, unnamedLabelRecords: m.unnamed_label_records ?? null, clinicalTextBundled: Boolean(m.clinical_text_bundled) };
  } catch {
    return null;
  }
}

/**
 * LIVENESS (audit F14): the process answers. It does not claim that the AI
 * provider or the data work — that is /api/health/ready. Cheap: no network,
 * no disk scan, safe to poll.
 */
export async function GET() {
  const s = releaseSummary();
  return NextResponse.json({
    status: 'alive',
    check: 'liveness',
    readiness: '/api/health/ready',
    release: s.releaseId,
    tier: appTier(),
    uptimeSec: Math.round((Date.now() - started) / 1000),
    // Configured ≠ working: whether the provider answers is a readiness probe.
    ai: { platformKeyConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY), callerKeySupported: true },
    limits: limitStoreInfo(),
    counts: {
      agentsDefined: AGENTS.length,
      registrySources: SOURCES.length,
      // Hand-written interaction/dosing profiles used by the medication-safety
      // engine — NOT the medication catalog (see medicationCatalog).
      interactionDrugProfiles: DRUGS.length,
      calculators: CALCULATORS.length,
      defectClasses: DEFECT_CLASSES.length,
      medicationIndexFiles: s.counts?.medicationIndexFiles ?? null,
    },
    medicationCatalog: catalog(),
    persistence: { patientData: 'session-only', database: process.env.DATABASE_URL ? 'configured' : 'not-configured' },
    medications: { openFdaKey: process.env.OPENFDA_API_KEY ? 'configured' : 'not-configured' },
  });
}
