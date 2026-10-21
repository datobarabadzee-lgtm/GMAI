import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * F21 (audit 2026-10-21): the quality master's taxonomy parents are defect-class
 * NAMES, sometimes several joined by " / ". The importer looked them up as
 * codes and produced 124 BROKEN_TAXONOMY_PARENT warnings. The fixture is the
 * author's own taxonomy as shipped in authored/quality/taxonomy.json (160
 * nodes, 124 with a parent), written in the master file's format.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmai-kb-'));
process.env.KB_DB_PATH = path.join(tmp, 'kb.sqlite');
process.env.EMBEDDING_PROVIDER = 'hash';
process.env.APP_TIER = 'internal';

const nodes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'authored', 'quality', 'taxonomy.json'), 'utf8')) as { id: string; type: string; code: string | null; nameKa: string; parent: string | null; headingPath: string[] }[];

function writeMaster(dir: string, taxonomy: unknown[]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'GMAI_Quality_Defect_Rules_Master_v1.json'),
    JSON.stringify({ metadata: { package_name: 'fixture', rights_status: 'PROPRIETARY_INTERNAL' }, defect_taxonomy: taxonomy, quality_rules: [], audit_question_bank: [] }),
  );
}

describe('taxonomy referential integrity', () => {
  it('splits only on " / " — a slash inside a name is part of the name', async () => {
    const { splitParents } = await import('@/kb/import');
    expect(splitParents('დოკუმენტაციის დეფექტი / ინფორმირების/კომუნიკაციის დეფექტი / თანხმობის დეფექტი')).toEqual(['დოკუმენტაციის დეფექტი', 'ინფორმირების/კომუნიკაციის დეფექტი', 'თანხმობის დეფექტი']);
  });

  it('resolves every parent of the author taxonomy to a stable defect-class id, keeping the raw text', async () => {
    const src = path.join(tmp, 'src');
    writeMaster(src, nodes.map((n) => ({ taxonomy_id: n.id, taxonomy_type: n.type, code: n.code, name: n.nameKa, parent: n.parent, source_heading_path: n.headingPath })));
    const { runImport } = await import('@/kb/import');
    const report = await runImport(src);
    expect(report.status).not.toBe('FAILED');
    expect(report.warnings.filter((w) => w.code === 'BROKEN_TAXONOMY_PARENT')).toEqual([]);
    expect(report.counts.taxonomyParentsUnresolved).toBe(0);
    expect(report.counts.taxonomyParentLinks).toBe(205);
    const { openDb } = await import('@/kb/db');
    const db = openDb();
    const raw = db.prepare('SELECT parent FROM defect_taxonomy WHERE taxonomy_id = ?').get('TAX-0011') as { parent: string };
    expect(raw.parent).toBe('დიაგნოსტიკური დეფექტი / თერაპიული დეფექტი');
    const links = db.prepare('SELECT parent_id, resolution FROM defect_taxonomy_parents WHERE taxonomy_id = ? ORDER BY parent_id').all('TAX-0011');
    expect(links).toEqual([
      { parent_id: 'TAX-0001', resolution: 'defect_class_name' },
      { parent_id: 'TAX-0002', resolution: 'defect_class_name' },
    ]);
  });

  it('does not invent a link: an unknown or ambiguous parent stays unresolved and is reported', async () => {
    const { runImport } = await import('@/kb/import');
    const src = path.join(tmp, 'src2');
    writeMaster(src, [
      { taxonomy_id: 'T-1', taxonomy_type: 'defect_class', code: 'X1', name: 'ა', parent: null },
      { taxonomy_id: 'T-2', taxonomy_type: 'defect_class', code: 'X2', name: 'ა', parent: null },
      { taxonomy_id: 'T-3', taxonomy_type: 'row', code: null, name: 'ბ', parent: 'ა / არარსებული კლასი' },
      { taxonomy_id: 'T-4', taxonomy_type: 'row', code: null, name: 'გ', parent: 'X1' },
    ]);
    const report = await runImport(src);
    const broken = report.warnings.filter((w) => w.code === 'BROKEN_TAXONOMY_PARENT' && w.recordId === 'T-3');
    expect(broken.map((w) => w.message).join(' ')).toMatch(/ambiguous/);
    expect(broken.map((w) => w.message).join(' ')).toMatch(/matches no code/);
    const { openDb } = await import('@/kb/db');
    expect(openDb().prepare("SELECT parent_id, resolution FROM defect_taxonomy_parents WHERE taxonomy_id = 'T-4'").get()).toEqual({ parent_id: 'T-1', resolution: 'code' });
  });
});
