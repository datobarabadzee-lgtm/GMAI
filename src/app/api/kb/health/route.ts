import { NextResponse } from 'next/server';
import { kbExists, kbStats, openDb, KbUnavailableError } from '@/kb/db';
import { getEmbeddingProvider } from '@/kb/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!kbExists()) {
    return NextResponse.json({ available: false, messageKa: new KbUnavailableError().messageKa }, { status: 200 });
  }
  const db = openDb({ readonly: true });
  const provider = getEmbeddingProvider();

  const sources = db.prepare('SELECT * FROM knowledge_sources ORDER BY source_id').all();
  const versions = db
    .prepare(
      `SELECT v.*, s.name FROM knowledge_source_versions v JOIN knowledge_sources s ON s.source_id = v.source_id ORDER BY v.imported_at DESC`,
    )
    .all();
  const runs = db.prepare('SELECT run_id, started_at, finished_at, status, files_seen, records_seen, records_accepted, records_quarantined FROM knowledge_import_runs ORDER BY started_at DESC LIMIT 10').all();
  const errorsByCode = db.prepare('SELECT severity, code, COUNT(*) n FROM knowledge_import_errors GROUP BY severity, code ORDER BY n DESC').all();
  const maturityClinical = db.prepare('SELECT maturity, COUNT(*) n FROM clinical_rules GROUP BY maturity ORDER BY n DESC').all();
  const maturityQuality = db.prepare('SELECT maturity, COUNT(*) n FROM quality_rules GROUP BY maturity ORDER BY n DESC').all();
  const families = db.prepare('SELECT rule_family, COUNT(*) n FROM quality_rules GROUP BY rule_family ORDER BY n DESC LIMIT 25').all();
  const topics = db.prepare('SELECT title, clinical_rules FROM clinical_topics ORDER BY clinical_rules DESC LIMIT 20').all();
  const defectClasses = db
    .prepare("SELECT name, COUNT(*) n FROM defect_taxonomy WHERE taxonomy_type = 'defect_class' GROUP BY name ORDER BY n DESC")
    .all();

  return NextResponse.json({
    available: true,
    stats: kbStats(),
    embedding: { provider: provider.id, model: provider.model, dim: provider.dim, semantic: provider.semantic, labelKa: provider.labelKa },
    sources,
    versions,
    runs,
    errorsByCode,
    maturityClinical,
    maturityQuality,
    families,
    topics,
    defectClasses,
  });
}
