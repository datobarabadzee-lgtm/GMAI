import 'server-only';
import corpus from '../../authored/gmai_clinical_v2/units.json';

/**
 * COLLECTION gmai_clinical_v2 — emergency medicine and intensive care.
 *
 * Imported by scripts/import-clinical-v2.mjs from the GMAI clinical knowledge
 * package (schema 2.0). Separate from every other knowledge source in the app
 * and versioned by package_id. Reference knowledge: no clinical validation was
 * performed and the content was not updated against current guidelines.
 *
 * Server-side only. The student page loads the light catalog and one topic at
 * a time from /public/clinical-v2; this module is for agents and search.
 */

export const CLINICAL_V2 = 'gmai_clinical_v2' as const;

export type ClinicalSetting = 'emergency' | 'intensive_care';
export type ClinicalType = 'safety' | 'dosing' | 'assessment' | 'criteria' | 'management' | 'clinical_context';

export type ClinicalItem = {
  id: string;
  kind: 'statement' | 'heading' | 'table';
  clinical_type: ClinicalType;
  text: string;
  rows?: string[][];
  media: { kind: 'image' | 'attachment'; path: string; file: string }[];
  numeric_mentions: { literal: string; context: string }[];
};

export type ClinicalUnit = {
  id: string;
  topic_id: string;
  section_id: string;
  order: number;
  title: string;
  setting: ClinicalSetting;
  topic_title: string;
  section_title: string;
  clinical_types: ClinicalType[];
  context_unit_ids: string[];
  items: ClinicalItem[];
  status: 'active' | 'retired';
  content_hash: string;
};

type Corpus = { collection: string; package_id: string; schema_version: string; units: ClinicalUnit[] };
const data = corpus as unknown as Corpus;

export const CLINICAL_V2_PACKAGE = data.package_id;
export const CLINICAL_UNITS: ClinicalUnit[] = data.units.filter((u) => u.status === 'active');
export const UNIT_BY_ID = new Map(CLINICAL_UNITS.map((u) => [u.id, u]));

export const SETTING_KA: Record<ClinicalSetting, string> = { emergency: 'გადაუდებელი მედიცინა', intensive_care: 'ინტენსიური თერაპია' };
export const TYPE_KA: Record<ClinicalType, string> = {
  assessment: 'შეფასება',
  criteria: 'კრიტერიუმები',
  management: 'მართვა',
  dosing: 'დოზირება',
  safety: 'უსაფრთხოება',
  clinical_context: 'კლინიკური კონტექსტი',
};

/** Units of one section, in reading order — the smallest piece ever handed to an agent. */
export function sectionUnits(sectionId: string): ClinicalUnit[] {
  return CLINICAL_UNITS.filter((u) => u.section_id === sectionId).sort((a, b) => a.order - b.order);
}

/** Sections of a topic in order, with titles — the topic outline an agent receives. */
export function topicOutline(topicId: string): { section_id: string; title: string; unit_ids: string[] }[] {
  const out: { section_id: string; title: string; unit_ids: string[] }[] = [];
  for (const u of CLINICAL_UNITS.filter((x) => x.topic_id === topicId).sort((a, b) => a.order - b.order)) {
    const last = out[out.length - 1];
    if (last && last.section_id === u.section_id) last.unit_ids.push(u.id);
    else if (!out.some((s) => s.section_id === u.section_id)) out.push({ section_id: u.section_id, title: u.section_title, unit_ids: [u.id] });
    else out.find((s) => s.section_id === u.section_id)!.unit_ids.push(u.id);
  }
  return out;
}

/** Stable deep link into the student page. */
export const unitHref = (u: Pick<ClinicalUnit, 'topic_id' | 'id'>) => `/academy/clinical/${u.topic_id}?u=${u.id}`;

/** A unit as plain text, tables as rows, images as an explicit unread reference. */
export function unitText(u: ClinicalUnit, opts: { media?: boolean } = {}): string {
  const lines: string[] = [];
  for (const it of u.items) {
    if (it.kind === 'table' && it.rows?.length) lines.push(...it.rows.map((r) => `| ${r.join(' | ')} |`));
    else if (it.kind === 'heading') lines.push(`## ${it.text}`);
    else if (it.text) lines.push(`- ${it.text.replace(/^\s*[-–•·]\s+/, '')}`);
    if (opts.media)
      for (const m of it.media)
        lines.push(
          m.kind === 'image'
            ? `[სურათი ${m.path} — ტექსტად არ არის წაკითხული; მისი შინაარსი არ გამოიყენო დადასტურებულ ფაქტად]`
            : `[დანართი ${m.path}]`,
        );
  }
  return lines.join('\n');
}

/**
 * Topics that exist in both settings (BLS, ACS, difficult airway, stroke…).
 * Matched by shared title words; they are never merged — an agent is told the
 * other version exists so it can point out differences instead of mixing them.
 */
const titleWords = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2)
      .map((w) => w.slice(0, 6)),
  );
const TOPICS = [...new Map(CLINICAL_UNITS.map((u) => [u.topic_id, { id: u.topic_id, title: u.topic_title, setting: u.setting }])).values()];
export const TOPIC_TWINS = new Map<string, { id: string; title: string; setting: ClinicalSetting }[]>();
for (const a of TOPICS) {
  const wa = titleWords(a.title);
  for (const b of TOPICS) {
    if (a.id === b.id || a.setting === b.setting) continue;
    const wb = titleWords(b.title);
    const shared = [...wa].filter((w) => wb.has(w)).length;
    if (shared && shared / Math.min(wa.size, wb.size) >= 0.6) TOPIC_TWINS.set(a.id, [...(TOPIC_TWINS.get(a.id) ?? []), b]);
  }
}
