#!/usr/bin/env node
/**
 * Builds the compact, server-only EMA index used by
 * src/server/medications/ema.ts.
 *
 * Source (public, updated twice a day by EMA):
 *   medicines: https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json
 *   documents: https://www.ema.europa.eu/en/documents/report/documents-output-json-report_en.json
 *
 * Only human medicines are kept. For each: EMA product number, medicine name,
 * active substance, INN, status, marketing-authorisation holder, ATC code, the
 * EPAR page and the URL of its "product-information" document (the SmPC PDF).
 * The product-information document is linked by the EMA product number written
 * in EMA's own documents file — not by a name match.
 *
 *   node scripts/build-ema-index.mjs [medicines.json documents.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const MED_URL = 'https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json';
const DOC_URL = 'https://www.ema.europa.eu/en/documents/report/documents-output-json-report_en.json';
const OUT = path.join(process.cwd(), 'knowledge', 'medications', 'ema');

async function load(arg, url) {
  if (arg) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  const r = await fetch(url, { redirect: 'error' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

const [medArg, docArg] = process.argv.slice(2);
const meds = (await load(medArg, MED_URL)).data;
const docs = (await load(docArg, DOC_URL)).data;
const PNUM = /^EMEA\/H\/C\/(\d{6})$/;
const PI_PATH = /^https:\/\/www\.ema\.europa\.eu\/en\/documents\/product-information\/[a-z0-9-]+_en\.pdf$/;

// product number → product-information PDF (only exactly one valid PDF counts)
const pi = new Map();
for (const d of docs) {
  if (d.type !== 'product-information' || !PNUM.test(d.ema_product_number) || !PI_PATH.test(d.document_url)) continue;
  const prev = pi.get(d.ema_product_number);
  if (prev === undefined) pi.set(d.ema_product_number, { url: d.document_url, updated: (d.last_updated_date || '').slice(0, 10) });
  else if (prev && prev.url !== d.document_url) pi.set(d.ema_product_number, null); // ambiguous → none
}

const rows = [];
const stat = { human: 0, with_pi: 0, authorised: 0, authorised_with_pi: 0, ambiguous_pi: 0 };
for (const m of meds) {
  if (m.category !== 'Human') continue;
  const mm = PNUM.exec(m.ema_product_number);
  if (!mm) continue;
  stat.human++;
  const p = pi.get(m.ema_product_number);
  if (p === null) stat.ambiguous_pi++;
  if (p) stat.with_pi++;
  if (m.medicine_status === 'Authorised') {
    stat.authorised++;
    if (p) stat.authorised_with_pi++;
  }
  const medUrl = /^https:\/\/www\.ema\.europa\.eu\/en\/medicines\/human\//.test(m.medicine_url) ? m.medicine_url : '';
  rows.push([
    Number(mm[1]),
    m.name_of_medicine.trim(),
    (m.active_substance || '').trim(),
    (m.international_non_proprietary_name_common_name || '').trim(),
    m.medicine_status || '',
    (m.marketing_authorisation_developer_applicant_holder || '').trim(),
    (m.atc_code_human || '').trim(),
    p ? p.url : '',
    p ? p.updated : '',
    medUrl,
    m.generic === 'Yes' ? 1 : 0,
    m.biosimilar === 'Yes' ? 1 : 0,
  ]);
}
rows.sort((a, b) => a[0] - b[0]);

const payload = {
  version: 1,
  fields: ['num', 'name', 'active_substance', 'inn', 'status', 'mah', 'atc', 'pi_url', 'pi_updated', 'medicine_url', 'generic', 'biosimilar'],
  rows,
};
const bytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json.gz'), bytes);
const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  sources: { medicines: MED_URL, documents: DOC_URL },
  file: 'index.json.gz',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  counts: stat,
  note: 'Centrally authorised medicines only (EU). Product information is fetched live from www.ema.europa.eu by the server, verified and hashed on every use.',
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ rows: rows.length, gz_bytes: bytes.length, ...stat }));
