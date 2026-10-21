#!/usr/bin/env node
/**
 * npm run med:coverage — medication coverage report (audit F10).
 * Writes docs/MEDICATION_COVERAGE.json and docs/MEDICATION_COVERAGE.md.
 *
 * Every Georgian catalog (MIS) entity is placed in exactly one coverage class,
 * from what the shipped data actually links — no fuzzy matching:
 *   curated_approved   a named curator approved the link to an exact FDA name
 *   curated_rejected   a curator decided there is no equivalent
 *   fda_name_match     identical English name exists in the FDA index (unapproved
 *                      crosswalk). The Georgian name alone shows no product (the
 *                      crosswalk is not product equivalence); searching the English
 *                      name, or a curator approval, leads to US products to confirm
 *   ema_name_match     identical English name of an EU centrally authorised product
 *                      or its active substance
 *   catalog_only       Georgian name pair only: no instruction can be shown
 *   placeholder        catalog row without a usable name
 * A confirmed label is never stored: it exists only per session after the user
 * confirms a product, and the label text is fetched live from FDA/EMA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MED = path.join(ROOT, 'knowledge', 'medications');
const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(MED, f))).toString('utf8'));

export function coverage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(MED, 'manifest.json'), 'utf8'));
  const mis = gz('data/mis.json.gz');
  const cw = gz('data/unapproved-crosswalk.json.gz');
  const ema = gz('ema/index.json.gz');
  const emaMan = JSON.parse(fs.readFileSync(path.join(MED, 'ema', 'manifest.json'), 'utf8'));
  const curated = JSON.parse(fs.readFileSync(path.join(MED, 'curated-map.json'), 'utf8'));
  const f = Object.fromEntries(ema.fields.map((k, i) => [k, i]));
  const emaNames = new Map();
  for (const r of ema.rows) for (const n of [r[f.name], r[f.active_substance], r[f.inn]]) if (n) emaNames.set(String(n).trim().toLowerCase(), r[f.status]);
  const dec = new Map((curated.entries ?? []).map((e) => [e.mis_id, e.decision]));

  const classes = { curated_approved: 0, curated_rejected: 0, fda_name_match: 0, ema_name_match: 0, catalog_only: 0, placeholder: 0 };
  const byKind = {};
  const emaAuthorised = { authorised: 0, not_authorised: 0 };
  for (const [id, e] of Object.entries(mis)) {
    let c;
    if (e.is_placeholder) c = 'placeholder';
    else if (dec.get(id) === 'approved') c = 'curated_approved';
    else if (dec.get(id) === 'rejected') c = 'curated_rejected';
    else if (cw[id]?.length) c = 'fda_name_match';
    else if (e.name_en && emaNames.has(e.name_en.trim().toLowerCase())) {
      c = 'ema_name_match';
      emaAuthorised[emaNames.get(e.name_en.trim().toLowerCase()) === 'Authorised' ? 'authorised' : 'not_authorised'] += 1;
    } else c = 'catalog_only';
    classes[c] += 1;
    byKind[e.kind] ??= { ...Object.fromEntries(Object.keys(classes).map((k) => [k, 0])) };
    byKind[e.kind][c] += 1;
  }
  const emaStatus = {};
  for (const r of ema.rows) emaStatus[r[f.status]] = (emaStatus[r[f.status]] ?? 0) + 1;
  return {
    generated_at: new Date().toISOString(),
    snapshots: { fda_mis_package: manifest.snapshot, ema_index: emaMan.generated_at.slice(0, 10) },
    mis_entities: Object.keys(mis).length,
    classes,
    by_kind: byKind,
    ema_name_match_status: emaAuthorised,
    fda: { label_records: manifest.counts.label, ndc_records: manifest.counts.ndc, unnamed_label_records: manifest.unnamed_label_records, clinical_text_bundled: manifest.clinical_text_bundled },
    ema: { products: ema.rows.length, with_product_information: emaMan.counts.with_pi, status: emaStatus },
    curation: { revision: curated.revision ?? 0, entries: (curated.entries ?? []).length, entries_sha256: curated.entries_sha256 ?? null },
    retired: 'MIS snapshot carries no withdrawal status: retired Georgian products cannot be identified from it. EMA statuses (Withdrawn, Lapsed, Revoked …) are listed above.',
    confirmed_labels_persisted: 0,
  };
}

// pathToFileURL: a path with spaces (e.g. „georgian expert AI“) is percent-encoded in import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = coverage();
  fs.writeFileSync(path.join(ROOT, 'docs', 'MEDICATION_COVERAGE.json'), JSON.stringify(r, null, 2) + '\n');
  const pct = (n) => `${((n / r.mis_entities) * 100).toFixed(1)}%`;
  const md = [
    '# მედიკამენტების დაფარვა (F10)',
    '',
    `გენერირებულია: ${r.generated_at.slice(0, 10)} · FDA/MIS snapshot: ${r.snapshots.fda_mis_package} · EMA ინდექსი: ${r.snapshots.ema_index} · ბრძანება: \`npm run med:coverage\``,
    '',
    `MIS ქართული კატალოგის ერთეული: **${r.mis_entities}** (სახელები და სავაჭრო სახელები; არ არის განსხვავებული აქტიური ნივთიერებების რაოდენობა).`,
    '',
    '| კლასი | რაოდენობა | წილი | რას ნიშნავს მომხმარებლისთვის |',
    '|---|---:|---:|---|',
    `| curated_approved | ${r.classes.curated_approved} | ${pct(r.classes.curated_approved)} | კურატორმა დაადასტურა კავშირი ზუსტ FDA სახელთან; პროდუქტი მაინც დასადასტურებელია |`,
    `| curated_rejected | ${r.classes.curated_rejected} | ${pct(r.classes.curated_rejected)} | კურატორის გადაწყვეტილება: ეკვივალენტი არ არის |`,
    `| fda_name_match | ${r.classes.fda_name_match} | ${pct(r.classes.fda_name_match)} | იდენტური ინგლისური სახელი FDA ინდექსში (დაუმტკიცებელი კავშირი). ქართული სახელით ძიება პროდუქტს არ აჩვენებს; ინგლისური სახელით ან კურატორის დადასტურების შემდეგ — აშშ-ის პროდუქტის არჩევა და დადასტურება, ინსტრუქცია ონლაინ. **კურაციის მთავარი რიგი.** |`,
    `| ema_name_match | ${r.classes.ema_name_match} | ${pct(r.classes.ema_name_match)} | იდენტური სახელი EU ცენტრალიზებულ პროდუქტთან ან ნივთიერებასთან (${r.ema_name_match_status.authorised} ავტორიზებული, ${r.ema_name_match_status.not_authorised} არა); ქართული სახელით ავტომატურად არ უკავშირდება |`,
    `| catalog_only | ${r.classes.catalog_only} | ${pct(r.classes.catalog_only)} | მხოლოდ ქართული/ინგლისური სახელი — ინსტრუქცია ვერ გამოჩნდება |`,
    `| placeholder | ${r.classes.placeholder} | ${pct(r.classes.placeholder)} | კატალოგის ჩანაწერი გამოსაყენებელი სახელის გარეშე |`,
    '',
    `FDA: ${r.fda.label_records} label + ${r.fda.ndc_records} NDC ჩანაწერი, მათგან ${r.fda.unnamed_label_records} ინდექსირებული სახელის გარეშე; კლინიკური ტექსტი პაკეტში არ არის (ონლაინ). EMA: ${r.ema.products} პროდუქტი, ${r.ema.with_product_information} ინსტრუქციით.`,
    '',
    `კურაცია: revision ${r.curation.revision}, ჩანაწერი ${r.curation.entries}${r.curation.entries_sha256 ? `, sha256 ${r.curation.entries_sha256}` : ''}.`,
    '',
    `შეჩერებული/გაუქმებული: ${r.retired}`,
    '',
    'დადასტურებული ინსტრუქცია არ ინახება: ის არსებობს მხოლოდ სესიაში, მას შემდეგ რაც მომხმარებელი კონკრეტულ პროდუქტს დაადასტურებს.',
    '',
    '## კურაციის პროცესი',
    '',
    '1. `/curation` (internal, OPERATOR_TOKEN) — კურატორი ირჩევს ქართულ სახელს, ამოწმებს ზუსტ FDA სახელს (`/api/curation/check`).',
    '2. დადასტურებისთვის სავალდებულოა: მოქმედი ნივთიერება (+მარილი), მტკიცებულების ბმული, კურატორის სახელი, თარიღი; არასავალდებულო: ფორმა, სიძლიერე, გზა, რეგისტრაციის ნომერი.',
    '3. ჩაწერა ზრდის `revision`-ს, ინახავს `entries_sha256`-ს და `curated-map.changelog.jsonl`-ში წერს before/after hash-ს და დამატებულ/შეცვლილ id-ებს.',
    '4. ორი ვერსიის შედარება: `npm run med:curation-diff -- old.json new.json`.',
    '5. ყოველი ჩატვირთვისას ჩანაწერი ხელახლა მოწმდება კატალოგთან და FDA ინდექსთან; შეუსაბამო ჩანაწერი იგნორირდება და ჩანს `/api/curation/map`-ში.',
    '6. ცარიელი კავშირი fuzzy ჩანაცვლებით არ ივსება.',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'docs', 'MEDICATION_COVERAGE.md'), md + '\n');
  console.log(JSON.stringify(r.classes));
}
