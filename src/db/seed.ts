/**
 * SEED — writes the shipped knowledge modules into SQL.
 *
 * Usage:  DATABASE_URL=postgres://... npm run seed
 *
 * Without DATABASE_URL the script prints the seed payload as SQL to stdout so it
 * can be piped into psql. The application itself does not require a database.
 */
import { SOURCES } from '@/knowledge/sources';
import { DRUGS, INTERACTIONS } from '@/knowledge/drugs';
import { GEORGIAN_TERMS } from '@/knowledge/georgian-context';
import { DEFECT_CLASSES } from '@/knowledge/defect-classifier';

const esc = (v: unknown) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

function statements(): string[] {
  const out: string[] = [];

  SOURCES.forEach((s) => {
    out.push(
      `INSERT INTO sources (source_id,title,publisher,year,publication_date,source_type,specialty,jurisdiction,rights_status,version,last_checked,url,citation_text,evidence_rank,freshness,is_current,superseded_by,population,key_finding,applicability,keywords,fulltext_public,excerpt) VALUES (${[
        s.source_id, s.title, s.publisher, s.year, s.publication_date, s.source_type, s.specialty, s.jurisdiction, s.rights_status, s.version, s.last_checked, s.url, s.citation_text, s.evidence_rank, s.freshness, s.is_current, s.superseded_by, s.population, s.key_finding, s.applicability, s.keywords, s.fulltext_public, s.excerpt,
      ]
        .map(esc)
        .join(',')}) ON CONFLICT (source_id) DO NOTHING;`,
    );
  });

  DRUGS.forEach((d) => {
    out.push(`INSERT INTO drugs (id,generic_name,generic_ka,brand_names,atc,class,payload) VALUES (${[d.id, d.generic_name, d.generic_ka, d.brand_names, d.atc, d.class, d].map(esc).join(',')}) ON CONFLICT (id) DO NOTHING;`);
  });

  INTERACTIONS.forEach((i) => {
    out.push(`INSERT INTO interactions (id,drug_a,drug_b,severity,mechanism,effect,management,sources) VALUES (${[i.id, i.a, i.b, i.severity, i.mechanism, i.effect, i.management, i.sources].map(esc).join(',')}) ON CONFLICT (id) DO NOTHING;`);
  });

  GEORGIAN_TERMS.forEach((t) => {
    out.push(`INSERT INTO terms (preferred_ka,english,synonyms_ka,deprecated_ka,abbreviation,specialty,icd10,atc,loinc,definition_ka,version,status) VALUES (${[t.preferred_ka, t.english, t.synonyms_ka, t.deprecated_ka, t.abbreviation, t.specialty, t.icd10 ?? null, t.atc ?? null, t.loinc ?? null, t.definition_ka, t.version, t.status].map(esc).join(',')});`);
  });

  DEFECT_CLASSES.forEach((c) => {
    out.push(`INSERT INTO defect_classes (code,roman,name_ka,name_en,definition_ka,payload) VALUES (${[c.code, c.roman, c.nameKa, c.nameEn, c.definitionKa, c].map(esc).join(',')}) ON CONFLICT (code) DO NOTHING;`);
  });

  return out;
}

async function main() {
  const sql = statements();
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stdout.write(`-- DATABASE_URL is not set; printing ${sql.length} statements.\n`);
    process.stdout.write(sql.join('\n') + '\n');
    return;
  }
  // `pg` is an optional peer dependency — only needed when DATABASE_URL is set.
  const pgModule = (await import(/* webpackIgnore: true */ 'pg' as string)) as unknown as {
    Client: new (c: { connectionString: string }) => { connect(): Promise<void>; query(q: string): Promise<unknown>; end(): Promise<void> };
  };
  const { Client } = pgModule;
  const client = new Client({ connectionString: url });
  await client.connect();
  for (const s of sql) await client.query(s);
  await client.end();
  process.stdout.write(`Seeded ${sql.length} rows.\n`);
}

void main();
