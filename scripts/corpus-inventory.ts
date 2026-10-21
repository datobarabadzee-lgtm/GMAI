/**
 * CORPUS INVENTORY (audit F11, 2026-10-21)
 *
 *   npx tsx scripts/corpus-inventory.ts [--sources <owner folder>] [--out docs]
 *
 * For every knowledge collection the application has been given, records the
 * full path from the owner's source file to an answer:
 *
 *   source → normalized (files in this repository) → active (runtime loader)
 *          → indexed (how it is searched) → retrieved (code path) → answer
 *
 * with byte sizes, SHA-256 hashes and record counts computed from the files
 * themselves, the tiers in which the collection is live, and — where it is
 * not live — the reason. „A file is on disk" is not counted as „an agent uses
 * it": the active/retrieved columns name the code that reads it.
 *
 * With --sources, the owner's original files (ZIP/JSON/DOCX) are hashed too, so
 * a restore can be checked against the originals.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const SOURCES = arg('--sources');
const OUT = arg('--out') ?? 'docs';

const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

function filesUnder(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(abs);
  return out.sort();
}

/** One hash over a directory: sha256 of "relpath\tsha256\n" lines, sorted. */
function treeDigest(dir: string) {
  const files = filesUnder(dir);
  const lines = files.map((f) => `${rel(f)}\t${sha(f)}`);
  return {
    path: dir,
    files: files.length,
    bytes: files.reduce((a, f) => a + fs.statSync(f).size, 0),
    sha256: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'),
  };
}
const fileEntry = (p: string) => ({ path: p, bytes: fs.statSync(path.join(ROOT, p)).size, sha256: sha(path.join(ROOT, p)) });
const json = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

async function main() {
  const { QUALITY_RULES, AUDIT_QUESTIONS } = await import('../src/knowledge/quality-corpus');
  const { LOW_VALUE_MEDS } = await import('../src/knowledge/low-value-meds').catch(() => ({ LOW_VALUE_MEDS: [] as unknown[] }));
  const { SOURCES: REGISTRY } = await import('../src/knowledge/sources');
  const { DRUGS } = await import('../src/knowledge/drugs');
  const { CALCULATORS } = await import('../src/lib/calculators');
  const { GEORGIAN_TERMS, GEORGIAN_CONTEXT_NOTES } = await import('../src/knowledge/georgian-context');

  const qualityManifest = json('authored/quality/manifest.json');
  const v2Report = json('authored/gmai_clinical_v2/import-report.json');
  const v2Catalog = json('public/clinical-v2/catalog.json');
  const medManifest = json('knowledge/medications/manifest.json');
  const emaManifest = json('knowledge/medications/ema/manifest.json');
  const curated = json('knowledge/medications/curated-map.json');

  const collections = [
    {
      id: 'quality-defect-corpus',
      name: 'ხარისხისა და დეფექტების კორპუსი (ავტორის სახელმძღვანელო)',
      owner: 'დავით ბარაბაძე — ავტორის საკუთარი მასალა',
      permission: 'ავტორის საკუთრება; გამოყენება და საჯარო გავრცელება ავტორის მიერ ნებადართულია (owner statement, 2026-10-21; earlier: knowledge-base-ingestion 2026-10-15).',
      sourceFiles: ['დეფექტების_კლასიფიკატორი - DRAFT.docx', 'GMAI_Quality_Defect_Rules_Master_v1.json', 'GMAI_Quality_Defect_Rules_Master_v1.zip'],
      sourceVersion: `${qualityManifest.sourceStatus} · ingested ${qualityManifest.ingestedAt}`,
      normalized: treeDigest('authored/quality'),
      counts: { extracted: qualityManifest.rulesExtracted, active: qualityManifest.rulesActive, activeLoaded: QUALITY_RULES.length, auditQuestions: AUDIT_QUESTIONS.length, taxonomyNodes: qualityManifest.taxonomyNodes },
      active: 'src/knowledge/quality-corpus.ts (bundled JSON) — public and internal tiers',
      indexed: 'src/kb/open-corpus.ts: BM25 + Georgian/English lexicon + hash n-gram vectors (NOT learned embeddings)',
      retrieved: 'retrieveRules(kinds: quality_rule, audit_question) → orchestrator; /api/quality/audit',
      answer: 'A13/A14, quality mode, /defect, /quality; rule IDs verified by A19 (verifyCitations)',
      tiers: { public: true, internal: true },
      excluded: `${qualityManifest.rulesExtracted - qualityManifest.rulesActive} records are not active: ${qualityManifest.maturityCounts.QUALITY_RULE_CANDIDATE} QUALITY_RULE_CANDIDATE sentence extracts (traceability only) and ${qualityManifest.rulesExtracted - qualityManifest.rulesActive - qualityManifest.maturityCounts.QUALITY_RULE_CANDIDATE} rules of an active maturity without a decidable trigger/criterion/evidence — activation policy in knowledge-base-ingestion.md.`,
      internalKb: 'npm run kb:import imports the full master (4,482 rules, 160 taxonomy nodes, 128 audit questions) into data/gmai-kb.sqlite for the internal tier.',
    },
    {
      id: 'gmai_clinical_v2',
      name: 'კლინიკური ცოდნა L5 v2 — გადაუდებელი მედიცინა / ინტენსიური თერაპია',
      owner: 'მფლობელის მიერ მოწოდებული პაკეტი GMAI-CLINICAL-KNOWLEDGE-L5-v2',
      permission: 'მფლობელის მიერ მოწოდებული ამ აპლიკაციისთვის; საჯარო გამოყენება ნებადართულია მფლობელის მიერ.',
      sourceFiles: ['GMAI_Clinical_Knowledge_L5_v2.zip', 'GMAI_Clinical_Knowledge_L5_v2/'],
      sourceVersion: `${v2Report.package_id} schema ${v2Report.schema_version} · imported ${v2Report.finished_at}`,
      normalized: { units: fileEntry('authored/gmai_clinical_v2/units.json'), public: treeDigest('public/clinical-v2') },
      counts: { topics: v2Catalog.topics.length, units: v2Report.counts.units, sections: v2Report.counts.sections, items: v2Report.counts.items, media: v2Report.counts.media_files, trainingSectionsNotImported: v2Report.manifest_counts.training_sections, validationSectionsNotImported: v2Report.manifest_counts.validation_sections },
      active: 'src/knowledge/clinical-v2.ts — public and internal tiers (not in patient mode)',
      indexed: 'src/kb/clinical-v2-search.ts: lexical/morphological BM25 + lexicon (NOT learned embeddings)',
      retrieved: 'retrieveRules(kinds: clinical_unit) → orchestrator (quick/deep/evidence modes); /api/clinical-v2/search',
      answer: 'synthesis context (labelled reference material); clinicalKnowledge panel only for units linked to an answer sentence or titled on the question’s topic; /academy/clinical (51 topics, 962 units)',
      tiers: { public: true, internal: true },
      excluded: 'Package train/validation files are not imported (scripts/import-clinical-v2.mjs). No clinical validation of the content has been performed; it is labelled as reference material.',
    },
    {
      id: 'clinical-rules-master-v1',
      name: 'GMAI Clinical Rules Master v1 (107 თემა / 5,464 წესი)',
      owner: 'წარმოებულია UpToDate 2022-დან (Wolters Kluwer) — მესამე მხარის საავტორო მასალა',
      permission:
        'პაკეტის საკუთარი მეტამონაცემები: rights_status RESTRICTED_INTERNAL_REFERENCE, public_republication=false. მფლობელის ნებართვა ფარავს მის საკუთარ მასალას; Wolters Kluwer-ის უფლებებს ვერ გადასცემს. ამიტომ საჯარო ჩართვა BLOCKED.',
      sourceFiles: ['GMAI_Clinical_Rules_Master_v1.zip', 'GMAI_Clinical_Rules_Master_v1.json', 'GMAI_UpToDate_L1_L3_Batch_*.zip', 'GMAI_UpToDate_2022_FHIR_R4_Single_Document_Bundle.json'],
      sourceVersion: 'UpToDate 2022 snapshot',
      normalized: null,
      counts: { topics: 107, rules: 5464, note: 'counts from the audit restore report (restore-report.json), not from files in this repository' },
      active: 'internal tier only, after the owner runs npm run kb:import with his own copy; never shipped, never in a release archive',
      indexed: 'SQLite FTS5 + hash n-gram vectors (data/gmai-kb.sqlite, internal)',
      retrieved: 'retrieveRules(kinds: clinical_rule) — internal tier; public tier returns KB_UNAVAILABLE by design',
      answer: 'internal tier agents only',
      tiers: { public: false, internal: 'owner-imported only' },
      excluded: 'Third-party copyrighted content (verbatim clinical_statement_internal fields). Excluded from the public tier, the repository and the release archives.',
    },
    {
      id: 'medication-identity',
      name: 'მედიკამენტების იდენტობის ინდექსი (FDA label/NDC + MIS კატალოგი)',
      owner: 'GMAI_Medication_L5_Vercel_Lite (მფლობელის პაკეტი); openFDA — საჯარო; MIS — საჯარო რეესტრი',
      permission: 'openFDA public domain; MIS public catalogue; package provided by the owner.',
      sourceFiles: ['GMAI_Medication_L5_Vercel_Lite.zip', 'GMAI_Medication_L5_Vercel_Lite/'],
      sourceVersion: `FDA snapshot ${medManifest.snapshot}`,
      normalized: treeDigest('knowledge/medications/data'),
      counts: { fdaRecords: 401216, labelIds: 262897, ndcIds: 138319, misNames: 29591, curatedMappings: Array.isArray(curated.entries) ? curated.entries.length : 0, note: 'FDA/NDC records are product records, not distinct substances' },
      active: 'knowledge/medications/store.mjs via src/server/medications/identity.ts',
      indexed: 'exact normalized-name shards (no fuzzy matching)',
      retrieved: '/api/medications/*, agent gate (A07), polypharmacy',
      answer: 'product selection → server receipt → label text fetched live from openFDA by source ID',
      tiers: { public: true, internal: true },
      excluded: 'No clinical text is bundled; labels are fetched live. curated-map.json holds owner-reviewed MIS→FDA mappings only.',
    },
    {
      id: 'ema-product-information',
      name: 'EMA — ევროპული პროდუქტის ინფორმაცია (SmPC)',
      owner: 'European Medicines Agency — საჯარო ფაილები',
      permission: 'EMA public data (reuse permitted with attribution).',
      sourceFiles: [emaManifest.sources.medicines, emaManifest.sources.documents],
      sourceVersion: `EMA files of ${emaManifest.generated_at}`,
      normalized: treeDigest('knowledge/medications/ema'),
      counts: emaManifest.counts,
      active: 'src/server/medications/ema.ts',
      indexed: 'exact name/substance index',
      retrieved: '/api/medications/search|preview|confirm|context (EMA records), agent gate',
      answer: 'confirmed EU product; SmPC fetched live from www.ema.europa.eu and verified',
      tiers: { public: true, internal: true },
      excluded: 'Centrally authorised medicines only.',
    },
    {
      id: 'curated-registries',
      name: 'კურირებული რეესტრები (კოდში)',
      owner: 'აპლიკაციის ავტორები; წყაროები თითოეულ ჩანაწერშია',
      permission: 'n/a (application code)',
      sourceFiles: [],
      sourceVersion: 'repository',
      normalized: ['src/knowledge/sources.ts', 'src/knowledge/drugs.ts', 'src/knowledge/low-value-meds.ts', 'src/lib/calculators.ts', 'src/knowledge/georgian-context.ts', 'src/kb/lexicon.ts'].map(fileEntry),
      counts: { registrySources: REGISTRY.length, drugMonographs: DRUGS.length, lowValueMeds: (LOW_VALUE_MEDS as unknown[]).length, calculators: CALCULATORS.length, georgianTerms: GEORGIAN_TERMS.length, georgianContextNotes: GEORGIAN_CONTEXT_NOTES.length },
      active: 'imported directly by agents',
      indexed: 'src/services/retrieval.ts (lexical + keywords; specific-term requirement)',
      retrieved: 'A05/A06/A07/A09/A15',
      answer: 'sources listed only when an answer sentence is linked to them (claim-support.ts)',
      tiers: { public: true, internal: true },
      excluded: '',
    },
  ];

  const owner: { file: string; bytes: number; sha256: string }[] = [];
  if (SOURCES && fs.existsSync(SOURCES)) {
    for (const f of fs.readdirSync(SOURCES)) {
      const p = path.join(SOURCES, f);
      if (!fs.statSync(p).isFile()) continue;
      owner.push({ file: f, bytes: fs.statSync(p).size, sha256: sha(p) });
    }
  }

  const out = { generatedAt: new Date().toISOString(), collections, ownerSourceFiles: owner };
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT, 'corpus-inventory.json'), JSON.stringify(out, null, 2) + '\n');
  const md = [
    '# ცოდნის კოლექციების ინვენტარი',
    '',
    `გენერირებულია: ${out.generatedAt} — \`npx tsx scripts/corpus-inventory.ts\`. რიცხვები და hash-ები გამოთვლილია ფაილებიდან.`,
    '',
    ...collections.flatMap((c) => [
      `## ${c.name}`,
      '',
      `- **ID:** \`${c.id}\``,
      `- **მფლობელი / წარმომავლობა:** ${c.owner}`,
      `- **ნებართვა:** ${c.permission}`,
      `- **წყაროს ფაილები:** ${c.sourceFiles.map((x) => `\`${x}\``).join(', ') || '—'}`,
      `- **ვერსია:** ${c.sourceVersion}`,
      `- **ნორმალიზებული (repo):** ${c.normalized ? '`' + JSON.stringify(c.normalized) + '`' : '— (repository-ში არ არის)'}`,
      `- **რაოდენობები:** \`${JSON.stringify(c.counts)}\``,
      `- **აქტიური (runtime):** ${c.active}`,
      `- **ინდექსი:** ${c.indexed}`,
      `- **მოძიება:** ${c.retrieved}`,
      `- **პასუხში:** ${c.answer}`,
      `- **tier:** public=${String(c.tiers.public)}, internal=${String(c.tiers.internal)}`,
      `- **გამორიცხვა / შეზღუდვა:** ${c.excluded || '—'}`,
      '',
    ]),
    owner.length ? '## მფლობელის საწყისი ფაილები (hash)\n\n| ფაილი | ბაიტი | SHA-256 |\n|---|---:|---|\n' + owner.map((o) => `| ${o.file} | ${o.bytes} | \`${o.sha256}\` |`).join('\n') : '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, OUT, 'CORPUS_INVENTORY.md'), md + '\n');
  process.stdout.write(`wrote ${OUT}/corpus-inventory.json and ${OUT}/CORPUS_INVENTORY.md (${collections.length} collections)\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n');
  process.exit(1);
});
