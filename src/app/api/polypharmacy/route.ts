import { NextResponse } from 'next/server';
import { checkLimit } from '@/services/rate-limit';
import { z } from 'zod';
import {
  CATEGORY_KA,
  GRADE_KA,
  GRADE_TONE,
  LOW_VALUE_MEDS,
  LOW_VALUE_STATS,
  TIER_KA,
  screenMedicationList,
  taperFor,
} from '@/knowledge/low-value-meds';
import { classifyNames } from '@/server/medications/agent-gate';
import { findDrug, interactionsFor } from '@/knowledge/drugs';
import { resolveDrugName } from '@/services/drug-naming';
import { ageWarningsFor } from '@/knowledge/age-restrictions';
import { EVIDENCE_TIER_KA, citationText, searchDrugEvidence } from '@/services/literature';

export const runtime = 'nodejs';
export const maxDuration = 45;

const Body = z.object({
  medications: z.string().trim().min(1),
  age: z.number().int().min(0).max(120).optional(),
  withLabels: z.boolean().optional(),
  withLiterature: z.boolean().optional(),
});

/** Registry contents — so the UI can state real coverage, not a slogan. */
export async function GET() {
  return NextResponse.json({
    stats: LOW_VALUE_STATS,
    gradeLabelsKa: GRADE_KA,
    categoryLabelsKa: CATEGORY_KA,
    tiersKa: TIER_KA,
    entries: LOW_VALUE_MEDS.map((e) => ({
      id: e.id,
      inn: e.inn,
      nameKa: e.nameKa,
      brandsGe: e.brandsGe,
      category: e.category,
      categoryKa: CATEGORY_KA[e.category],
      grade: e.grade,
      gradeKa: GRADE_KA[e.grade],
      tone: GRADE_TONE[e.grade],
      tier: e.tier,
      tierKa: TIER_KA[e.tier].labelKa,
      approval: e.approval,
      claimedKa: e.claimedKa,
      evidenceKa: e.evidenceKa,
      keyReference: e.keyReference,
      harmsKa: e.harmsKa,
      insteadKa: e.insteadKa,
    })),
  });
}

/** Splits a free-text medication list into individual drug names. */
function splitMeds(text: string): string[] {
  const UNIT = '(?:mg|მგ|mcg|მკგ|µg|g|გრ|გ|ml|მლ|iu|ერთ|%)';
  return text
    .split(/[\n,;·•]+/)
    .map((line) =>
      line
        // strip a leading list marker or ordinal
        .replace(/^[\s\-–•*]*\d*[.)]?\s*/, '')
        // strip "20 მგ", "10მლ ×3", "400 mg bid" and everything after
        .replace(new RegExp(`\\d+(?:[.,]\\d+)?\\s*${UNIT}[\\s\\S]*$`, 'iu'), '')
        // strip a bare trailing dose/frequency number
        .replace(/[\s]*\d+(?:[.,]\d+)?\s*(?:[×x*]\s*\d+)?\s*$/u, '')
        .trim(),
    )
    .filter((l) => l.length >= 3 && l.length <= 60);
}

export async function POST(req: Request) {
  // These call free upstream APIs, but an open endpoint is still ours to
  // protect: unthrottled use would get the platform blocked by the upstream.
  const limited = checkLimit(req);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', messageKa: limited.messageKa },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSec) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'BAD_REQUEST', messageKa: 'მედიკამენტების სია ცარიელია.' }, { status: 400 });
  }

  const { medications, age, withLabels = true, withLiterature = true } = parsed.data;
  const names = splitMeds(medications);

  // Prose rather than a list: if the registry still recognises an agent in the
  // raw text, screen that rather than refusing. A clinician who pasted a
  // sentence should get the finding, not a lecture about formatting.
  const prosedHits = names.length ? [] : screenMedicationList(medications);
  if (!names.length && !prosedHits.length) {
    return NextResponse.json(
      {
        error: 'NEEDS_DETAIL',
        messageKa: 'ვერ ამოვიცანი პრეპარატის სახელები. ჩამოწერეთ თითო პრეპარატი ახალ ხაზზე — სასურველია მოქმედი ნივთიერების სახელით.',
      },
      { status: 422 },
    );
  }
  const parsedFromProse = !names.length;

  // 0. How each typed name was understood — brand, typo, or unknown — and
  // whether the agent is restricted at this age. Shown first: a child given a
  // drug that must not be used at that age is the most urgent finding here.
  const resolutions = names.map((n) => resolveDrugName(n));
  const SEVERITY: Record<string, number> = { contraindicated: 0, avoid: 1, restricted: 2, not_established: 3 };
  const ageWarnings = resolutions
    .flatMap((r) => (r.inn ? ageWarningsFor(r.inn, age ?? null, r.input) : []))
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);

  // 1. Low-value screen against the registry.
  const lowValue = screenMedicationList(medications).map(({ entry, matched }) => ({
    id: entry.id,
    matched,
    inn: entry.inn,
    nameKa: entry.nameKa,
    categoryKa: CATEGORY_KA[entry.category],
    grade: entry.grade,
    gradeKa: GRADE_KA[entry.grade],
    tone: GRADE_TONE[entry.grade],
    tier: entry.tier,
    tierKa: TIER_KA[entry.tier].labelKa,
    tierActionKa: TIER_KA[entry.tier].actionKa,
    approval: entry.approval,
    claimedKa: entry.claimedKa,
    evidenceKa: entry.evidenceKa,
    keyReference: entry.keyReference,
    harmsKa: entry.harmsKa,
    insteadKa: entry.insteadKa,
    liveQuery: entry.liveQuery,
    evidenceTerm: entry.evidenceTerm,
  }));

  // 2. Tapering plans from the author's programme.
  const tapers = taperFor(medications);

  // 3. Identity of every listed name, through the medication identity
  // service. No label is fetched by name: a label is shown only for a product
  // the user picks and confirms on the medication page. (Earlier this screen
  // took the first openFDA label carrying the name — the Colomycin error.)
  void withLabels;
  const identities = await classifyNames(names).catch(() => []);

  // Interactions: the curated pairwise rules, only between substances named
  // exactly. Label-text cross-screening needs confirmed products and is off.
  type Inter = { a: string; b: string; via: 'name' | 'class'; evidenceKa: string; matchedTerm: string; excerpt: string; severityHint: 'boxed' | 'interaction' };
  const exactIds = names.map((n) => ({ n, d: findDrug(n) })).filter((x): x is { n: string; d: NonNullable<ReturnType<typeof findDrug>> } => Boolean(x.d));
  let interactions: Inter[] = interactionsFor(exactIds.map((x) => x.d.id)).map((i) => ({
    a: exactIds.find((x) => x.d.id === i.a)?.n ?? i.a,
    b: exactIds.find((x) => x.d.id === i.b)?.n ?? i.b,
    via: 'name',
    evidenceKa: `${i.effect}. მექანიზმი: ${i.mechanism}. მართვა: ${i.management}`,
    matchedTerm: i.id,
    excerpt: '',
    severityHint: i.severity === 'major' || i.severity === 'contraindicated' ? 'boxed' : 'interaction',
  }));

  // 4. Live evidence for the single highest-priority low-value finding.
  let literature: { forEntry: string; citations: unknown[]; tierLabelsKa: typeof EVIDENCE_TIER_KA } | null = null;
  if (withLiterature && lowValue.length) {
    const top = lowValue[0];
    try {
      // Reviews and guidelines answer "does this work"; a cohort paper that
      // merely mentions the drug does not. Fall back only if none exist.
      // Anchored on the drug name so the result answers "does THIS work",
      // not "what is highly cited in this disease area".
      const res = await searchDrugEvidence(top.evidenceTerm, 5);
      literature = {
        forEntry: top.nameKa,
        citations: res.citations.map((c) => ({ ...c, citationText: citationText(c) })),
        tierLabelsKa: EVIDENCE_TIER_KA,
      };
    } catch {
      literature = null;
    }
  }

  // Registry-level interactions the US labels cannot know about: a Georgian
  // combination product never has an openFDA label, but its ingredients do
  // interact (5-HTP / St John's wort with antidepressants, ginkgo with
  // anticoagulants).
  const inns = resolutions.map((r) => (r.inn ?? '').toLowerCase());
  const SEROTONERGIC = ['sertraline', 'fluoxetine', 'paroxetine', 'escitalopram', 'citalopram', 'fluvoxamine', 'venlafaxine', 'duloxetine', 'tramadol', 'trazodone', 'amitriptyline', 'clomipramine'];
  const BLEEDING = ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'aspirin', 'clopidogrel', 'ticagrelor', 'acetylsalicylic acid'];
  // Georgian case endings: „დულოქსეტინი" → „დულოქსეტინთან", „ვარფარინის".
  const ka = (name: string, suffix: 'თან' | 'ის') => (/[ა-ჰ]ი$/.test(name) ? `${name.slice(0, -1)}${suffix}` : /[ა-ჰ]$/.test(name) ? `${name}${suffix}` : `${name}-${suffix}`);
  const nameOf = (inn: string) => resolutions.find((r) => (r.inn ?? '').toLowerCase() === inn)?.input ?? inn;
  const registryInteractions: Inter[] = [];
  for (const lv of lowValue) {
    if (lv.id === 'cerebrovin' || lv.id === 'novopassit') {
      for (const inn of inns.filter((i) => SEROTONERGIC.includes(i))) {
        registryInteractions.push({
          a: lv.nameKa,
          b: nameOf(inn),
          via: 'class',
          matchedTerm: lv.id === 'cerebrovin' ? '5-HTP' : "St John's wort",
          evidenceKa: lv.id === 'cerebrovin'
            ? `${lv.nameKa} შეიცავს 5-HTP-ს (სეროტონინის წინამორბედი). ${ka(nameOf(inn), 'თან')} ერთად იზრდება სეროტონინის სინდრომის რისკი: აგზნება, ოფლიანობა, კანკალი, ცხელება, გულის აჩქარება.`
            : `${lv.nameKa} შეიცავს კრაზანას (St John's wort). ${ka(nameOf(inn), 'თან')} ერთად იზრდება სეროტონინის სინდრომის რისკი: აგზნება, ოფლიანობა, კანკალი, ცხელება, გულის აჩქარება.`,
          excerpt: '',
          severityHint: 'boxed',
        });
      }
    }
    if (lv.id === 'cerebrovin' || lv.id === 'ginkgo') {
      for (const inn of inns.filter((i) => BLEEDING.includes(i))) {
        registryInteractions.push({ a: lv.nameKa, b: nameOf(inn), via: 'class', matchedTerm: 'Ginkgo', evidenceKa: `გინკგო ${ka(nameOf(inn), 'თან')} ერთად ზრდის სისხლდენის რისკს.`, excerpt: '', severityHint: 'interaction' });
      }
    }
    if (lv.id === 'novopassit') {
      for (const inn of inns.filter((i) => i === 'warfarin' || i === 'cyclosporine' || i === 'ciclosporin')) {
        registryInteractions.push({ a: lv.nameKa, b: nameOf(inn), via: 'class', matchedTerm: "St John's wort", evidenceKa: `კრაზანა ასუსტებს ${ka(nameOf(inn), 'ის')} მოქმედებას — შეიძლება დაიკარგოს მკურნალობის ეფექტი.`, excerpt: '', severityHint: 'boxed' });
      }
    }
  }
  interactions = [...registryInteractions, ...interactions];

  // A product the registry already assessed is not "not found"; what is left
  // is named honestly as unknown to us — not as "not registered in the US".
  const assessed = new Set(lowValue.flatMap((l) => [l.matched.toLowerCase()]));
  const unresolved = identities.filter((m) => m.kind === 'unknown').map((m) => m.input).filter((n) => !lowValue.some((l) => l.matched && n.toLowerCase().includes(l.matched.toLowerCase())) && !assessed.has(n.toLowerCase()));

  const countsByTier = lowValue.reduce<Record<string, number>>((acc, e) => {
    acc[e.tier] = (acc[e.tier] ?? 0) + 1;
    return acc;
  }, {});

  const polypharmacy = names.length >= 5;
  const elderly = typeof age === 'number' && age >= 65;

  return NextResponse.json({
    resolutions,
    ageWarnings,
    child: typeof age === 'number' && age < 18,
    parsedCount: names.length,
    parsedNames: names,
    parsedFromProse,
    parsedNoteKa: parsedFromProse
      ? 'სია ვერ ამოვიცანი, მაგრამ ტექსტში რეესტრის პრეპარატი მოიძებნა და შევამოწმე. სრული სკრინინგისთვის ჩამოწერეთ თითო პრეპარატი ახალ ხაზზე.'
      : '',
    polypharmacy,
    polypharmacyNoteKa: polypharmacy
      ? `${names.length} რუტინული პრეპარატი — აკმაყოფილებს პოლიფარმაციის განმარტებას (≥5).`
      : '',
    elderlyNoteKa: elderly
      ? 'ასაკი ≥65 — გაითვალისწინეთ თირკმლის კლირენსი, ანტიქოლინერგული და სედაციური ტვირთი, დაცემის რისკი.'
      : '',
    lowValue,
    countsByTier,
    tapers,
    labels: null,
    identities: identities.map((m) => ({ input: m.input, kind: m.kind, href: m.href, noteKa: m.noteKa, catalog: m.catalog, selectableTotal: m.selectableTotal })),
    unresolved,
    identityNoteKa: 'ინსტრუქცია და დოზა ჩანს მხოლოდ კონკრეტული პროდუქტის არჩევისა და დადასტურების შემდეგ (ბმული თითო პრეპარატთან). ურთიერთქმედებები — მხოლოდ ზუსტად დასახელებულ ნივთიერებებს შორის კურირებული წესებით და რეესტრით.',
    interactions,
    literature,
    disclaimerKa:
      'ეს არის სკრინინგი და არა დანიშნულება. არც ერთი პრეპარატი არ უნდა შეწყდეს ექიმთან კონსულტაციის გარეშე — ნაწილი მათგან საჭიროებს ეტაპობრივ შემცირებას და მოხსნის სინდრომის კონტროლს. გრადაცია „სარგებელი არ დადასტურდა“ ეხება ჩვენებას და არა კონკრეტულ პაციენტს.',
    registryNoteKa:
      'რეესტრი აფასებს მტკიცებულებას და რეგულატორულ სტატუსს. სადაც საერთაშორისო შეფასება არ არსებობს, ეს პირდაპირ წერია — მტკიცებულების არარსებობა არ არის უეფექტურობის დადასტურება.',
  });
}
