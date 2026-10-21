/**
 * QUESTION FOCUS ON CONFIRMED PRODUCTS
 *
 * When the user asks about one part of an instruction („რა უკუჩვენებები
 * აქვს?") and one or two products are confirmed (US openFDA, EU EMA), that
 * part is put in front of the synthesis model by itself, per source. If the
 * model still answers that the information "is not given" while a source does
 * give it, the answer is retried once and, failing that, replaced by a
 * deterministic statement built from the source text. Observed 2026-10-20:
 * with Avastin US („None") + EU (hypersensitivity, CHO, pregnancy) the model
 * wrote that no contraindications were listed at all.
 */

export type FocusSource = { source: string; label: Record<string, unknown> | null };
export type Focus = { key: string; ka: string; parts: { region: 'US' | 'EU'; text: string; none: boolean }[] };

const TOPICS: [RegExp, string, string][] = [
  [/უკუჩვენ|contraindicat/i, 'contraindications', 'უკუჩვენებები'],
  [/ურთიერთქმედ|interact/i, 'drug_interactions', 'წამალთაშორისი ურთიერთქმედება'],
  [/ორსულ|ლაქტაც|ძუძუთი|pregnan|lactat/i, 'pregnancy', 'ორსულობა და ლაქტაცია'],
  [/გვერდით|არასასურველ|adverse|side effect/i, 'adverse_reactions', 'არასასურველი რეაქციები'],
  [/გაფრთხილ|სიფრთხილ|warning|precaution/i, 'warnings_and_cautions', 'გაფრთხილებები'],
  [/დოზ|posolog|\bdose|dosing/i, 'dosage_and_administration', 'დოზირება'],
  [/ჩვენებ|indicat|რისთვის|რას მკურნალობ/i, 'indications_and_usage', 'ჩვენებები'],
];

const textOf = (label: Record<string, unknown> | null, k: string) => (label && Array.isArray(label[k]) ? String((label[k] as unknown[])[0] ?? '').replace(/\s+/g, ' ').trim() : '');

/** „4 CONTRAINDICATIONS None. None ( 4 )" — a section that lists nothing. */
function listsNothing(t: string): boolean {
  const rest = t
    .replace(/contraindications?/gi, ' ')
    .replace(/\(\s*[\d.]+\s*\)/g, ' ')
    .replace(/^\s*[\d.]+/, ' ')
    .replace(/[.:;,\s]+/g, ' ')
    .trim()
    .toLowerCase();
  return rest.length > 0 && rest.split(' ').every((w) => w === 'none');
}

export function focusFor(question: string, confirmed: FocusSource[]): Focus | null {
  if (!confirmed.length) return null;
  const topic = TOPICS.find(([re]) => re.test(question));
  if (!topic) return null;
  const [, key, ka] = topic;
  const parts = confirmed
    .map((c) => ({ region: (c.source === 'ema' ? 'EU' : 'US') as 'US' | 'EU', text: textOf(c.label, key) }))
    .filter((p) => p.text)
    .map((p) => ({ ...p, none: listsNothing(p.text) }));
  return parts.length ? { key, ka, parts } : null;
}

const REGION_KA = { US: 'აშშ (FDA)', EU: 'ევროპა (EMA)' } as const;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

export function focusContext(f: Focus): string {
  return [
    `კითხვის ფოკუსი: „${f.ka}“. დადასტურებული პროდუქტ(ებ)ის წყაროს ტექსტი ამ ნაწილზე (ინგლისურად):`,
    ...f.parts.map((p) => `${REGION_KA[p.region]}: ${p.none ? 'ჩამოთვლილი არ არის (ორიგინალი: None)' : clip(p.text, 1800)}`),
    f.parts.length > 1
      ? 'უპასუხე ამ ტექსტით, ორივე წყარო ცალ-ცალკე და მონიშნული; ჩამონათვალი ქართულად თარგმნე. ის, რაც აქ წერია, არ თქვა, რომ „მითითებული არ არის“.'
      : 'უპასუხე ამ ტექსტით და ჩამონათვალი ქართულად თარგმნე. ის, რაც აქ წერია, არ თქვა, რომ „მითითებული არ არის“.',
  ].join('\n');
}

const DENIAL = /(მითითებული|მოცემული|აღნიშნული|ნახსენები) არ არის|ჩამოთვლა[^.]*შეუძლებელია|ამონარიდ|ვერ მოიძებნა|ინფორმაცია არ (?:არის|გვაქვს)/;

/** True when the answer denies or omits a source text that exists. */
export function focusMissed(answer: string, f: Focus): boolean {
  const withText = f.parts.filter((p) => !p.none);
  if (!withText.length) return false;
  if (f.parts.length > 1 && !(/FDA|აშშ/.test(answer) && /EMA|ევროპ/.test(answer))) return true;
  // A denial is acceptable only for the US „None"; it must not cover the source that lists something.
  if (DENIAL.test(answer)) {
    const sentences = answer.split(/(?<=[.!?])\s+/).filter((s) => DENIAL.test(s));
    return sentences.some((s) => !(f.parts.some((p) => p.none) && /FDA|აშშ/.test(s) && !/EMA|ევროპ/.test(s)));
  }
  return false;
}

export const FOCUS_CORRECTION =
  'შესწორება: წინა ვერსიაში ეწერა, რომ ეს ინფორმაცია არ არის მოცემული ან ერთ-ერთი წყარო გამოტოვებული იყო — ეს არასწორია. „კითხვის ფოკუსში“ მოცემული ტექსტი გამოიყენე: თითოეული წყარო ცალკე, მონიშნული, ჩამონათვალი ქართულად.';

/** Deterministic answer from the source text, used only when the model twice denied it. */
export function focusFallback(f: Focus): string {
  return `${f.ka} — ${f.parts
    .map((p) => `${REGION_KA[p.region]}: ${p.none ? 'ინსტრუქციაში ჩამოთვლილი არ არის' : `წყაროს ტექსტი (ინგლისურად): ${clip(p.text, 700)}`}`)
    .join(' · ')}. ქართული შეჯამება და სრული ტექსტი — მედიკამენტის ბარათში ქვემოთ.`;
}
