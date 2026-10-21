import { ok, skipped, type AgentContext, type AgentImpl } from './context';
import { retrieveText } from '@/services/retrieval';
import { CALCULATORS, suggestCalculators } from '@/lib/calculators';
import { interpretLabs } from '@/lib/labs';
import { withoutNegatedRequests } from '@/services/intent-text';
import { reviewMedications } from '@/lib/medication-review';
import { findDrug, DRUGS } from '@/knowledge/drugs';
import { georgianContextFor, termLookup } from '@/knowledge/georgian-context';
import { findComparisonTopics, GUIDELINE_BODIES } from '@/knowledge/guidelines';
import { ASSESSMENT_QUESTIONS, CAUSE_CATEGORIES, suggestDefectClasses } from '@/knowledge/defect-classifier';
import { qualityProfile, ruleLine } from './quality-profile';
import { EVIDENCE_TIER_KA, citationText, searchLiterature } from '@/services/literature';
import { englishSearchTerms, englishSynonyms, withCeiling } from '@/services/search-terms';
import { GRADE_KA, TIER_KA, screenMedicationList, taperFor } from '@/knowledge/low-value-meds';
import { buildMedicationGate, EMPTY_GATE, mentionLine, type MedicationGate } from '@/server/medications/agent-gate';
import { AGE_BANDS, ageWarningsFor, parseAgeYears, type AgeBand, type AgeWarning } from '@/knowledge/age-restrictions';
import { DEFECT_MODE_KA } from '@/schemas/quality';
import { sourcesByIds } from '@/knowledge/sources';
import { academyAgent, documentationAgent, imagingAgent, patientAgent } from './phase2';
import { evaluateDoac } from '@/lib/doac-dosing';

const patientLine = (c: AgentContext) => {
  const p = c.patient;
  const bits: string[] = [];
  if (p.age !== null) bits.push(`${p.age} წ.`);
  if (p.sex !== 'unspecified') bits.push(p.sex === 'male' ? 'მამრობითი' : 'მდედრობითი');
  if (p.pregnant === 'yes') bits.push('ორსულობა');
  if (p.egfr) bits.push(`eGFR ${p.egfr}`);
  if (p.problems.length) bits.push(p.problems.slice(0, 3).join(', '));
  return bits.join(' · ') || 'პაციენტის კონტექსტი არ არის მოწოდებული';
};

// Agents read the request without the subjects the user excluded (audit F09).
const textOf = (c: AgentContext) => withoutNegatedRequests([c.question, c.plan, c.patient.narrative, c.patient.problems.join(' ')].join(' '));

/** A05 — Evidence retrieval. Runs first; other agents reuse ctx.hits. */
const evidenceAgent: AgentImpl = async (c) => {
  const hits = c.hits.length ? c.hits : retrieveText(textOf(c), 8);

  // Live literature from Europe PMC, searched on controlled English terms
  // derived from the question without an extra model call. Bounded in time so
  // a slow upstream never holds the whole answer hostage.
  const terms = englishSearchTerms(textOf(c));
  const live = terms.length
    ? await withCeiling(
        searchLiterature({
          text: terms.join(' '),
          limit: 5,
          openAccessOnly: false,
          fromYear: new Date().getFullYear() - 10,
          tiers: ['guideline', 'systematic_review', 'rct'],
        }),
        8000,
        null,
      )
    : null;
  const citations = live?.citations ?? [];

  if (!hits.length && !citations.length) {
    return skipped('A05', 'რელევანტური წყარო ვერ მოიძებნა — არც რეესტრში, არც ღია ლიტერატურაში.');
  }

  return ok('A05', {
    summary: `რეესტრი: ${hits.length} წყარო · ღია ლიტერატურა: ${citations.length} პუბლიკაცია${terms.length ? ` (ძიება: ${terms.join(', ')})` : ''}.`,
    sections: [
      ...(hits.length
        ? [{
            titleKa: 'კურირებული წყაროები',
            titleEn: 'Curated sources',
            bullets: hits.map((h) => `${h.source.title} — ${h.source.publisher}, ${h.source.year} · ${h.source.source_type} · სიახლე: ${h.source.freshness}`),
            body: '',
          }]
        : []),
      ...(citations.length
        ? [{
            titleKa: 'მიმდინარე ლიტერატურა (Europe PMC)',
            titleEn: 'Current literature',
            bullets: citations.map((x) => `[${EVIDENCE_TIER_KA[x.evidenceTier]}] ${citationText(x)} — ${x.url}`),
            body: 'გაიდლაინები და სისტემური მიმოხილვები რანჟირებულია ზემოთ. ყოველი ჩანაწერი იხსნება და გადამოწმებადია.',
          }]
        : []),
    ],
    sourceIds: hits.map((h) => h.source.source_id),
    data: { hits, literature: citations, searchTerms: terms },
  });
};

/** A01 — Clinical reasoning. */
const reasoningAgent: AgentImpl = (c) => {
  const p = c.patient;
  const q = c.question.trim();
  if (!q && !p.narrative) return skipped('A01', 'კლინიკური კითხვა ან ქეისის აღწერა არ არის მოწოდებული.');

  const positives: string[] = [];
  const negatives: string[] = [];
  if (p.narrative) positives.push(`ანამნეზი: ${p.narrative.slice(0, 220)}${p.narrative.length > 220 ? '…' : ''}`);
  p.problems.forEach((pr) => positives.push(`აქტიური პრობლემა: ${pr}`));
  if (p.allergies.length) positives.push(`ალერგიები: ${p.allergies.join(', ')}`);
  if (!p.allergies.length) negatives.push('ალერგიები დოკუმენტირებული არ არის');
  if (p.creatinineMgDl === null && p.egfr === null) negatives.push('თირკმლის ფუნქცია შეფასებული არ არის');
  if (p.sex === 'female' && p.pregnant === 'unknown') negatives.push('ორსულობის სტატუსი დაუზუსტებელია');

  const timeline = p.timeline.length ? p.timeline.map((t) => `${t.date || '—'} · ${t.title}${t.detail ? ` — ${t.detail}` : ''}`) : ['ქრონოლოგია არ არის შევსებული'];

  const temporal = /უეცრად|მოულოდნელ|მწვავე|acute|sudden/i.test(textOf(c))
    ? 'მწვავე / უეცარი დაწყება'
    : /თანდათან|ქრონიკ|თვე|წელი/i.test(textOf(c))
      ? 'ქვემწვავე / ქრონიკული, თანდათანობითი'
      : 'ტემპორალური პატერნი მონაცემებიდან ცალსახად არ იკვეთება';

  const missing: string[] = [];
  if (p.age === null) missing.push('ასაკი');
  if (p.weightKg === null) missing.push('წონა');
  if (p.creatinineMgDl === null && p.egfr === null) missing.push('თირკმლის ფუნქცია');
  if (!p.medications.length) missing.push('მიმდინარე მედიკამენტები');
  if (!p.labs.length) missing.push('ლაბორატორიული მონაცემები');

  const redFlags = detectRedFlags(textOf(c));

  return ok('A01', {
    summary: `Problem representation: ${patientLine(c)} — ${q || 'ქეისის ანალიზი'}.`,
    sections: [
      { titleKa: 'პრობლემის რეპრეზენტაცია', titleEn: 'Problem representation', body: `${patientLine(c)}. ${q}`, bullets: [] },
      { titleKa: 'ტემპორალური პატერნი', titleEn: 'Temporal pattern', body: temporal, bullets: [] },
      { titleKa: 'ძირითადი დადებითი ნიშნები', titleEn: 'Key positive findings', bullets: positives.length ? positives : ['სტრუქტურირებული დადებითი ნიშნები არ არის შეყვანილი'], body: '' },
      { titleKa: 'ძირითადი უარყოფითი / გამოტოვებული', titleEn: 'Key negative findings', bullets: negatives.length ? negatives : ['მნიშვნელოვანი უარყოფითი ნიშნები არ არის აღნიშნული'], body: '' },
      { titleKa: 'ქრონოლოგია', titleEn: 'Timeline', bullets: timeline, body: '' },
      { titleKa: 'გამოტოვებული ინფორმაცია', titleEn: 'Missing information', bullets: missing.length ? missing : ['კრიტიკული მონაცემები შევსებულია'], body: '' },
    ],
    claims: [],
    sourceIds: c.hits.slice(0, 3).map((h) => h.source.source_id),
    data: { temporal, missing, redFlags },
    humanReviewRequired: c.risk === 'R4' || c.risk === 'R5',
  });
};

const DDX_LIBRARY: { match: RegExp; entries: { dx: string; tier: 'High' | 'Moderate' | 'Low' | 'Very Low'; category: 'most_likely' | 'must_not_miss' | 'mimic' | 'less_likely'; supporting: string; against: string; test: string; urgency: string }[] }[] = [
  {
    match: /tia|გარდამავალი იშემიური|ინსულტ|stroke|ჰემიპარ|დიზართრ/i,
    entries: [
      { dx: 'გარდამავალი იშემიური შეტევა (TIA)', tier: 'High', category: 'most_likely', supporting: 'უეცარი ფოკალური დეფიციტი სრული რეგრესით <24 სთ; ვასკულური რისკ-ფაქტორები', against: 'პროგრესირებადი ან მოციმციმე სიმპტომები; თავის ტკივილი აურით', test: 'გადაუდებელი MRI DWI; კაროტიდული დუპლექსი; ეკგ/ჰოლტერი AF-ის ძიებით', urgency: 'გადაუდებელი — მაღალი ადრეული ინსულტის რისკი' },
      { dx: 'იშემიური ინსულტი მცირე დეფიციტით', tier: 'Moderate', category: 'must_not_miss', supporting: 'ფოკალური დეფიციტი; DWI-დადებითი კერა შესაძლებელია სიმპტომების რეგრესის შემდეგაც', against: 'ნეიროვიზუალიზაცია ცვლილებების გარეშე', test: 'MRI DWI', urgency: 'გადაუდებელი' },
      { dx: 'ჰიპოგლიკემია', tier: 'Moderate', category: 'must_not_miss', supporting: 'დიაბეტი, ჰიპოგლიკემიური თერაპია; სიმპტომების სწრაფი რეგრესი გლუკოზის მიღებაზე', against: 'ნორმოგლიკემია ეპიზოდის დროს', test: 'კაპილარული და შრატის გლუკოზა', urgency: 'დაუყოვნებელი გამორიცხვა' },
      { dx: 'ფოკალური ეპილეფსიური კრუნჩხვა Todd-ის პარეზით', tier: 'Low', category: 'mimic', supporting: 'პოზიტიური სიმპტომები, სტერეოტიპულობა, პოსტიქტალური მდგომარეობა', against: 'წმინდა ნეგატიური დეფიციტი მოულოდნელი დაწყებით', test: 'EEG; MRI', urgency: 'გეგმიური, მაგრამ დროული' },
      { dx: 'მიგრენი აურით', tier: 'Low', category: 'mimic', supporting: 'თანდათანობით გავრცელებადი პოზიტიური სიმპტომები; მიგრენის ანამნეზი', against: 'ასაკი >50 დებიუტისას; ვასკულური რისკის ფონი', test: 'კლინიკური დიაგნოზი გამორიცხვის შემდეგ', urgency: 'გეგმიური' },
      { dx: 'სუბდურული ჰემატომა ან სივრცის დამჭერი პროცესი', tier: 'Very Low', category: 'must_not_miss', supporting: 'ტრავმა, ანტიკოაგულაცია, თანდათანობითი პროგრესირება', against: 'სრული რეგრესი წუთებში', test: 'თავის CT/MRI', urgency: 'გადაუდებელი გამორიცხვა ანტიკოაგულაციის ფონზე' },
    ],
  },
  {
    match: /ფიბრილაცი|fibrillation|\bAF\b|არარეგულარული პულს|გულისცემ/i,
    entries: [
      { dx: 'წინაგულების ფიბრილაცია', tier: 'High', category: 'most_likely', supporting: 'არარეგულარულად არარეგულარული პულსი; ეკგ P-ტალღების გარეშე', against: 'რეგულარული რითმი ეკგ-ზე', test: '12-განხრიანი ეკგ; საჭიროებისას ჰოლტერი', urgency: 'დროული' },
      { dx: 'წინაგულების თრთოლვა', tier: 'Moderate', category: 'mimic', supporting: 'რეგულარული ან რეგულარულად არარეგულარული რითმი; ხერხისებრი ტალღები', against: 'კლასიკური არარეგულარული პატერნი', test: 'ეკგ', urgency: 'დროული' },
      { dx: 'ჰიპერთირეოზი როგორც გამომწვევი', tier: 'Moderate', category: 'must_not_miss', supporting: 'წონის კლება, ტრემორი, სიცხის აუტანლობა', against: 'ნორმალური TSH', test: 'TSH, თავისუფალი T4', urgency: 'დროული' },
      { dx: 'სეფსისი ან სხვა მწვავე პროვოცირებადი მიზეზი', tier: 'Low', category: 'must_not_miss', supporting: 'ცხელება, ინფექციის კერა, ჰიპოტენზია', against: 'სისტემური ანთების ნიშნების არარსებობა', test: 'ანთების მარკერები, კულტურები, ლაქტატი', urgency: 'გადაუდებელი' },
    ],
  },
  {
    match: /ფეხების წვ|ნეიროპათ|დისესთეზ|პარესთეზ/i,
    entries: [
      { dx: 'დისტალური სიმეტრიული დიაბეტური პოლინეიროპათია', tier: 'High', category: 'most_likely', supporting: 'ხანგრძლივი დიაბეტი, არადამაკმაყოფილებელი კონტროლი, დისტალური სიმეტრიული სენსორული სიმპტომები', against: 'ასიმეტრიული ან პროქსიმალური დაწყება; სწრაფი პროგრესირება', test: 'HbA1c; ფეხის ნევროლოგიური გასინჯვა; საჭიროებისას EMG/NCS', urgency: 'გეგმიური' },
      { dx: 'ვიტამინ B12-ის დეფიციტით გამოწვეული ნეიროპათია', tier: 'Moderate', category: 'must_not_miss', supporting: 'ხანგრძლივი მეტფორმინის მიღება; დაბალი B12; უკანა სვეტების ჩართულობა', against: 'ნორმალური B12 და მეთილმალონის მჟავა', test: 'B12, მეთილმალონის მჟავა, ჰომოცისტეინი', urgency: 'დროული — პოტენციურად შექცევადი' },
      { dx: 'ალკოჰოლური ნეიროპათია', tier: 'Moderate', category: 'less_likely', supporting: 'ალკოჰოლის ხანგრძლივი მოხმარება; კვებითი დეფიციტი', against: 'ალკოჰოლის მოხმარების არარსებობა', test: 'კვებითი სტატუსი, თიამინი', urgency: 'გეგმიური' },
      { dx: 'ჰიპოთირეოზი', tier: 'Low', category: 'mimic', supporting: 'დაღლილობა, წონის მატება, ყაბზობა', against: 'ნორმალური TSH', test: 'TSH', urgency: 'გეგმიური' },
      { dx: 'ქრონიკული ანთებითი დემიელინიზებული პოლირადიკულონეიროპათია', tier: 'Very Low', category: 'must_not_miss', supporting: 'მოტორული ჩართულობა, არეფლექსია, პროგრესირება >8 კვირა', against: 'წმინდა სენსორული, ნელა პროგრესირებადი სურათი', test: 'EMG/NCS; ლიქვორი', urgency: 'დროული — მკურნალობადი' },
    ],
  },
  {
    match: /მუცლის ტკივილ|შებერილ|ivf|ოვარიულ|ორსულ/i,
    entries: [
      { dx: 'ოვარიული ჰიპერსტიმულაციის სინდრომი (OHSS)', tier: 'High', category: 'most_likely', supporting: 'ბოლოდროინდელი ოვარიული სტიმულაცია; შებერილობა, წონის მატება, ჰემოკონცენტრაცია, დიურეზის კლება', against: 'სტიმულაციის არარსებობა; ნორმალური ჰემატოკრიტი', test: 'ჰემატოკრიტი, ალბუმინი, ელექტროლიტები, კრეატინინი, მენჯის ულტრასონოგრაფია', urgency: 'გადაუდებელი შეფასება საშუალო-მძიმე ფორმისას' },
      { dx: 'ექტოპიური ორსულობა', tier: 'Moderate', category: 'must_not_miss', supporting: 'მუცლის ტკივილი ადრეულ ორსულობაში; საშვილოსნოსგარე გესტაციური ტომარა', against: 'დადასტურებული საშვილოსნოსშიდა ორსულობა', test: 'ტრანსვაგინალური ულტრასონოგრაფია; β-hCG დინამიკა', urgency: 'გადაუდებელი' },
      { dx: 'საკვერცხის ტორსია', tier: 'Low', category: 'must_not_miss', supporting: 'უეცარი ძლიერი ცალმხრივი ტკივილი; გადიდებული საკვერცხე', against: 'თანდათანობითი ორმხრივი შებერილობა', test: 'დოპლერ-ულტრასონოგრაფია', urgency: 'გადაუდებელი ქირურგიული' },
      { dx: 'ვენური თრომბოემბოლია', tier: 'Low', category: 'must_not_miss', supporting: 'ჰემოკონცენტრაცია და ორსულობა — პროთრომბოზული მდგომარეობა', against: 'სუნთქვის და კიდურის სიმპტომების არარსებობა', test: 'კლინიკური შეფასება; ვიზუალიზაცია ეჭვისას', urgency: 'გადაუდებელი ეჭვისას' },
    ],
  },
  {
    match: /გულმკერდის ტკივილ|chest pain|კარდიალგ/i,
    entries: [
      { dx: 'მწვავე კორონარული სინდრომი', tier: 'High', category: 'must_not_miss', supporting: 'დაწოლითი ტკივილი, ოფლიანობა, ვასკულური რისკ-ფაქტორები, ოჯახური ანამნეზი', against: 'ტიპური პლევრული ან პოზიციური ტკივილი ნორმალური ტროპონინით სერიულ გაზომვაზე', test: 'სერიული ტროპონინი; განმეორებითი ეკგ 15–30 წუთში', urgency: 'გადაუდებელი' },
      { dx: 'ფილტვის არტერიის თრომბოემბოლია', tier: 'Moderate', category: 'must_not_miss', supporting: 'ქოშინი, ტაქიკარდია, იმობილიზაცია, VTE ანამნეზი', against: 'PERC უარყოფითი დაბალი ალბათობისას', test: 'Wells; D-დიმერი; CT ანგიოგრაფია', urgency: 'გადაუდებელი' },
      { dx: 'აორტის დისექცია', tier: 'Very Low', category: 'must_not_miss', supporting: 'მკვეთრი გამხევი ტკივილი ზურგში გასხივებით; წნევის ასიმეტრია', against: 'ტიპური ანგინოზური სურათი', test: 'CT ანგიოგრაფია', urgency: 'გადაუდებელი' },
      { dx: 'გასტროეზოფაგური რეფლუქსი', tier: 'Moderate', category: 'mimic', supporting: 'კავშირი საკვებთან, პოზიციასთან; დამწვრობის შეგრძნება', against: 'ფიზიკურ დატვირთვაზე დამოკიდებული ტკივილი', test: 'კლინიკური; ემპირიული PPI ცდა კარდიალური მიზეზის გამორიცხვის შემდეგ', urgency: 'გეგმიური' },
      { dx: 'კუნთოვან-ჩონჩხოვანი ტკივილი', tier: 'Moderate', category: 'mimic', supporting: 'პალპაციით რეპროდუცირებადი; მოძრაობაზე დამოკიდებული', against: 'ვეგეტატიური თანხლები სიმპტომები', test: 'კლინიკური გასინჯვა', urgency: 'გეგმიური' },
    ],
  },
];

/** A02 — Differential diagnosis. */
const ddxAgent: AgentImpl = (c) => {
  const t = textOf(c);
  const lib = DDX_LIBRARY.find((l) => l.match.test(t));
  if (!lib) {
    return ok('A02', {
      status: 'ok',
      // Deliberately empty: a "no match" result must never become the Bottom Line.
      summary: '',
      sections: [
        {
          titleKa: 'DDx ჩარჩო',
          titleEn: 'Differential framework',
          bullets: [
            'ამ რეესტრში ამ სინდრომისთვის წინასწარ დამუშავებული DDx ნაკრები არ მოიძებნა.',
            'გამოიყენე სისტემური ჩარჩო: ვასკულური, ინფექციური, ნეოპლაზიური, დეგენერაციული, იატროგენული/წამლისმიერი, მეტაბოლური, აუტოიმუნური, ტრავმული, თანდაყოლილი.',
            'თითოეულ ვარიანტს მიაწერე: მხარდამჭერი ნიშნები, საწინააღმდეგო ნიშნები, დიფერენცირებადი კვლევა, გადაუდებლობა.',
          ],
          body: '',
        },
      ],
      data: { rows: [] },
      note: 'DDx ბიბლიოთეკაში შესაბამისი სინდრომი ვერ მოიძებნა.',
    });
  }
  const rows = lib.entries;
  const group = (cat: string) => rows.filter((r) => r.category === cat);
  return ok('A02', {
    summary: `დიფერენციული დიაგნოზი: ${rows.length} ვარიანტი, მათ შორის ${group('must_not_miss').length} must-not-miss.`,
    sections: [
      { titleKa: 'ყველაზე სავარაუდო', titleEn: 'Most likely', bullets: group('most_likely').map((r) => `${r.dx} (${r.tier}) — ${r.supporting}`), body: '' },
      { titleKa: 'არ უნდა გამოგვრჩეს (must not miss)', titleEn: 'Must not miss', bullets: group('must_not_miss').map((r) => `${r.dx} — ${r.urgency}; დიფერენცირება: ${r.test}`), body: '' },
      { titleKa: 'მიმიკები', titleEn: 'Mimics', bullets: group('mimic').map((r) => `${r.dx} — ${r.supporting}`), body: '' },
      { titleKa: 'ნაკლებად სავარაუდო, მაგრამ მნიშვნელოვანი', titleEn: 'Less likely but important', bullets: group('less_likely').map((r) => `${r.dx} — ${r.test}`), body: '' },
    ],
    claims: rows.filter((r) => r.category === 'must_not_miss').map((r) => `${r.dx} უნდა გამოირიცხოს ამ კლინიკურ სურათში`),
    sourceIds: c.hits.slice(0, 4).map((h) => h.source.source_id),
    data: { rows },
    humanReviewRequired: true,
  });
};

function detectRedFlags(text: string): string[] {
  const t = text.toLowerCase();
  const flags: { re: RegExp; msg: string }[] = [
    { re: /გულმკერდის ტკივილ|chest pain/, msg: 'გულმკერდის ტკივილი — გამორიცხე მწვავე კორონარული სინდრომი, PE და აორტის დისექცია' },
    { re: /უეცარი.*(სისუსტ|მეტყველებ)|ჰემიპარ|დიზართრ|ინსულტ|stroke|tia/, msg: 'მწვავე ფოკალური ნევროლოგიური დეფიციტი — დროზე დამოკიდებული ინსულტის გზა' },
    { re: /სუნთქვის გაძნელებ|ქოშინ|dyspnea|სატურაცი/, msg: 'რესპირატორული დისტრესი — შეაფასე სატურაცია და სუნთქვის სიხშირე დაუყოვნებლივ' },
    { re: /ცნობიერებ|კომა|გონების დაკარგვ/, msg: 'ცნობიერების დარღვევა — გლუკოზა, GCS, სასუნთქი გზები' },
    { re: /სეფსის|sepsis|ცხელება.*ჰიპოტენზი|ლაქტატ/, msg: 'სეფსისის ეჭვი — დროზე დამოკიდებული ანტიბიოტიკოთერაპია და ლაქტატი' },
    { re: /სისხლდენ|hemorrhage|მელენა|ჰემატემეზ/, msg: 'აქტიური სისხლდენა — ჰემოდინამიკა, ჰემოგლობინი, ანტიკოაგულაციის სტატუსი' },
    { re: /ორსულ.*(სისხლდენ|ტკივილ)|ექტოპიურ/, msg: 'ორსულობა ტკივილით ან სისხლდენით — გამორიცხე ექტოპიური ორსულობა' },
    { re: /სუიციდ|თვითმკვლელ/, msg: 'თვითდაზიანების რისკი — საჭიროა დაუყოვნებელი პროფესიული შეფასება' },
    { re: /ohss|ჰიპერსტიმულაცი/, msg: 'OHSS-ის ეჭვი — ჰემოკონცენტრაცია, დიურეზი, ასციტი' },
  ];
  return flags.filter((f) => f.re.test(t)).map((f) => f.msg);
}

/** A03 — What am I missing? */
const missingAgent: AgentImpl = (c) => {
  const p = c.patient;
  const items: { omission: string; why: string; urgency: 'გადაუდებელი' | 'დროული' | 'გეგმიური'; resolve: string; sources: string[] }[] = [];

  if (p.age === null) items.push({ omission: 'ასაკი არ არის მითითებული', why: 'ასაკი განსაზღვრავს დოზირებას, რისკის ქულებსა და დიფერენციულ დიაგნოზს.', urgency: 'დროული', resolve: 'შეავსე ასაკი Clinical Context პანელში', sources: [] });
  if (p.weightKg === null) items.push({ omission: 'წონა არ არის მითითებული', why: 'წონის გარეშე ვერ გამოითვლება კრეატინინის კლირენსი და წონაზე დამოკიდებული დოზები.', urgency: 'დროული', resolve: 'შეავსე წონა', sources: [] });
  if (p.creatinineMgDl === null && p.egfr === null) items.push({ omission: 'თირკმლის ფუნქცია შეფასებული არ არის', why: 'თირკმლით გამოყოფადი წამლების უსაფრთხოება ვერ მოწმდება.', urgency: 'დროული', resolve: 'შეიყვანე კრეატინინი ან eGFR', sources: ['SRC-COCKCROFT-1976'] });
  if (!p.allergies.length) items.push({ omission: 'ალერგიული ანამნეზი დოკუმენტირებული არ არის', why: 'ალერგიის ჩაუწერლობა უსაფრთხოებისა და დოკუმენტაციის დეფექტია.', urgency: 'დროული', resolve: 'ჩაიწერე ალერგია ან „უარყოფს“', sources: [] });
  if (p.sex === 'female' && p.age !== null && p.age >= 12 && p.age <= 55 && p.pregnant === 'unknown')
    items.push({ omission: 'ორსულობის სტატუსი დაუზუსტებელია', why: 'რეპროდუქციული ასაკის პაციენტში ეს ცვლის დიაგნოსტიკურ და თერაპიულ არჩევანს.', urgency: 'გადაუდებელი', resolve: 'დააზუსტე ორსულობა და საჭიროებისას ჩაატარე β-hCG', sources: [] });
  if (!p.medications.length) items.push({ omission: 'მედიკამენტების სია არ არის შევსებული', why: 'წამლისმიერი მიზეზები და ურთიერთქმედებები ვერ ფასდება; ეს ასევე შეჯერების (reconciliation) ხარვეზია.', urgency: 'დროული', resolve: 'შეავსე მიმდინარე მედიკამენტები, მათ შორის ურეცეპტოდ მიღებულები', sources: ['SRC-STOPPSTART-V3'] });
  if (!p.labs.length) items.push({ omission: 'ლაბორატორიული მონაცემები არ არის', why: 'ბევრი გადაუდებელი მდგომარეობა მხოლოდ ლაბორატორიულად გამოირიცხება.', urgency: 'დროული', resolve: 'დაამატე საბაზისო პანელი', sources: [] });
  if (!p.timeline.length) items.push({ omission: 'მოვლენების ქრონოლოგია არ არის აღწერილი', why: 'ქრონოლოგიის გარეშე ვერ ფასდება დროზე დამოკიდებული გადაწყვეტილებები და ვერ ტარდება ხარისხის აუდიტი.', urgency: 'დროული', resolve: 'შეავსე Timeline ჩანართი', sources: [] });

  const rf = detectRedFlags(textOf(c));
  rf.forEach((f) => items.push({ omission: `წითელი ალამი: ${f}`, why: 'წითელი ალმის დოკუმენტირებული გამორიცხვა სავალდებულოა.', urgency: 'გადაუდებელი', resolve: 'დააფიქსირე გამორიცხვის საფუძველი ჩანაწერში', sources: [] }));

  const med = reviewMedications(p);
  med.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 4).forEach((f) => items.push({ omission: f.titleKa, why: f.detail, urgency: f.severity === 'critical' ? 'გადაუდებელი' : 'დროული', resolve: f.action, sources: f.sources }));

  const defects = suggestDefectClasses(textOf(c));
  defects.slice(0, 2).forEach((d) => items.push({ omission: `დოკუმენტაციური/ხარისხის რისკი: ${d.cls.nameKa}`, why: d.cls.definitionKa, urgency: 'გეგმიური', resolve: d.cls.assessmentCriteria[0], sources: [] }));

  if (!items.length) return ok('A03', { summary: 'კრიტიკული გამოტოვება ავტომატურ შემოწმებაში არ გამოვლინდა.', sections: [] });

  const order = { გადაუდებელი: 0, დროული: 1, გეგმიური: 2 } as const;
  items.sort((a, b) => order[a.urgency] - order[b.urgency]);

  return ok('A03', {
    summary: `გამოვლენილია ${items.length} პოტენციური გამოტოვება, მათ შორის ${items.filter((i) => i.urgency === 'გადაუდებელი').length} გადაუდებელი.`,
    sections: [{ titleKa: 'პოტენციური გამოტოვებები', titleEn: 'Potential omissions', bullets: items.map((i) => `[${i.urgency}] ${i.omission} — ${i.why} → ${i.resolve}`), body: '' }],
    sourceIds: [...new Set(items.flatMap((i) => i.sources))],
    data: { items },
    humanReviewRequired: items.some((i) => i.urgency === 'გადაუდებელი'),
  });
};

/** A04 — Challenge my plan. */
const challengeAgent: AgentImpl = (c) => {
  if (!c.plan.trim()) return skipped('A04', 'შემოთავაზებული გეგმა არ არის შეყვანილი — ჩაწერე შენი გეგმა კრიტიკული შემოწმებისთვის.');
  const med = reviewMedications(c.patient);
  const hits = c.hits.slice(0, 4);
  const supports = [
    'გეგმა ეხმიანება ქეისში აღწერილ ძირითად პრობლემას.',
    ...(hits.length ? [`რეესტრში მოიძებნა ${hits.length} რელევანტური წყარო, რომელიც მსგავს კლინიკურ სიტუაციას ეხება.`] : []),
    ...(c.patient.problems.length ? ['გეგმა შეიძლება შეესაბამებოდეს დოკუმენტირებულ აქტიურ პრობლემებს.'] : []),
  ];
  const risks: string[] = [];
  const assumptions: string[] = [];
  const contraindications: string[] = [];

  med.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').forEach((f) => contraindications.push(`${f.titleKa}: ${f.detail} → ${f.action}`));
  if (c.patient.creatinineMgDl === null && c.patient.egfr === null) assumptions.push('იგულისხმება ნორმალური თირკმლის ფუნქცია — ეს დადასტურებული არ არის.');
  if (!c.patient.allergies.length) assumptions.push('იგულისხმება ალერგიის არარსებობა — დოკუმენტირებული არ არის.');
  if (c.patient.sex === 'female' && c.patient.pregnant === 'unknown') assumptions.push('ორსულობის სტატუსი დაუზუსტებელია, თუმცა გეგმა მას გავლენას ახდენს.');
  if (!/მონიტორინგ|კონტროლ|განმეორებ|follow/i.test(c.plan)) risks.push('გეგმაში არ ჩანს მონიტორინგის ან განმეორებითი შეფასების კომპონენტი.');
  if (!/ალტერნატივ|განვიხილე/i.test(c.plan)) risks.push('ალტერნატიული მიდგომის განხილვა დოკუმენტირებული არ არის — ეს ექსპერტიზაში ტიპური შენიშვნაა.');
  const rf = detectRedFlags(textOf(c));
  rf.forEach((f) => risks.push(`წითელი ალამი, რომელიც გეგმაში ცალსახად არ არის დახურული: ${f}`));

  return ok('A04', {
    summary: 'გეგმის სტრუქტურირებული კრიტიკული შემოწმება დასრულებულია.',
    sections: [
      { titleKa: 'რა ამყარებს შენს გეგმას', titleEn: 'What supports your plan', bullets: supports, body: '' },
      { titleKa: 'რა შეიძლება იყოს არასწორი', titleEn: 'What could be wrong', bullets: risks.length ? risks : ['ავტომატურ შემოწმებაში მნიშვნელოვანი ხარვეზი არ გამოვლინდა.'], body: '' },
      { titleKa: 'ფარული დაშვებები', titleEn: 'Hidden assumptions', bullets: assumptions.length ? assumptions : ['მკაფიო დაუდასტურებელი დაშვება არ იკვეთება.'], body: '' },
      { titleKa: 'უკუჩვენებები და უსაფრთხოება', titleEn: 'Contraindications', bullets: contraindications.length ? contraindications : ['მედიკამენტურ შემოწმებაში მაღალი რისკის უკუჩვენება არ გამოვლინდა.'], body: '' },
      { titleKa: 'ალტერნატიული მიდგომა', titleEn: 'Alternative approach', bullets: ['განიხილე ეტაპობრივი სტრატეგია დიაგნოსტიკური გაურკვევლობის შემცირებით, სანამ დეფინიტიურ თერაპიას დაიწყებ.', 'დააფიქსირე, რა შედეგი შეცვლიდა მართვას — ეს ამცირებს anchoring bias-ს.'], body: '' },
      { titleKa: 'რა ინფორმაცია შეცვლიდა მართვას', titleEn: 'What would change management', bullets: (missingAgent(c) as { data: { items?: { omission: string }[] } }).data?.items?.slice(0, 5).map((i) => i.omission) ?? [], body: '' },
    ],
    sourceIds: [...new Set([...med.sourceIds, ...hits.map((h) => h.source.source_id)])],
    data: { supports, risks, assumptions, contraindications },
    humanReviewRequired: true,
  });
};

/** A06 — Guideline comparator. */
const guidelineAgent: AgentImpl = (c) => {
  const topics = findComparisonTopics(c.question || textOf(c));
  if (!topics.length) return skipped('A06', 'ამ კითხვაზე შედარებადი გაიდლაინების ნაკრები რეესტრში ვერ მოიძებნა.');
  const t = topics[0];
  return ok('A06', {
    summary: `გაიდლაინების შედარება: ${t.questionKa}`,
    sections: [
      { titleKa: 'პოზიციები', titleEn: 'Positions', bullets: t.bodies.map((b) => `${GUIDELINE_BODIES.find((g) => g.id === b)?.shortName ?? b}: ${t.positions[b]}`), body: '' },
      { titleKa: 'კონსენსუსი', titleEn: 'Consensus', bullets: t.consensus, body: '' },
      { titleKa: 'განსხვავებები', titleEn: 'Differences', bullets: t.differences, body: '' },
      { titleKa: 'განსხვავების მიზეზი', titleEn: 'Reason for disagreement', body: t.reasonForDisagreement, bullets: [] },
      { titleKa: 'ვისზე ვრცელდება', titleEn: 'Applicable groups', body: t.applicableGroups, bullets: [] },
      { titleKa: 'უახლესი განახლება', titleEn: 'Newest update', body: t.newestUpdate, bullets: [] },
    ],
    claims: t.consensus,
    sourceIds: t.bodies.map((b) => GUIDELINE_BODIES.find((g) => g.id === b)?.sourceId ?? '').filter(Boolean),
    data: { topic: t },
  });
};

/** Age the request is about: the structured field, a stated age, or the intake bucket. */
export function requestAge(c: AgentContext): { years: number; band?: AgeBand } | null {
  if (c.patient.age !== null) return { years: c.patient.age };
  // The intake button is structured; the same answer also arrives as text
  // („ასაკი 6–11 წელი"), which must not be read as „11 years".
  const bucket = (c.extras.intake as { answers?: { age?: string } } | undefined)?.answers?.age;
  const band = bucket ? AGE_BANDS[bucket] : undefined;
  if (band) return { years: band.lo, band };
  const stated = parseAgeYears(textOf(c));
  return stated !== null ? { years: stated } : null;
}

/**
 * A07 — Drug safety & dosing, behind the medication identity gate.
 *
 * The agent never resolves a drug name itself. It reads the gate built
 * server-side (src/server/medications/agent-gate.ts):
 *   · a product the user confirmed on the server → that product's own label;
 *   · a substance typed exactly → curated substance-level rules, labelled as
 *     such (the product — form, strength, maker — is not confirmed);
 *   · a trade name, catalog-only name, several candidates or an unknown name →
 *     no dose, no indication, no label text: what is needed and a link to the
 *     product selection page.
 * Age restrictions are reported first. For a trade name the substance is only
 * an unverified hint, so the warning is stated conditionally.
 */
async function gateOf(c: AgentContext): Promise<MedicationGate> {
  if (c.medication) return c.medication;
  return buildMedicationGate({
    text: textOf(c),
    explicit: typeof c.extras.drug === 'string' ? (c.extras.drug as string) : '',
    medicationNames: c.patient.medications.map((m) => m.drug),
    session: null,
  });
}

const drugAgent: AgentImpl = async (c) => {
  const gate = await gateOf(c);
  const result = await drugAgentCore({ ...c, medication: gate });
  const age = requestAge(c);
  if (age === null) return result;
  const warnings: AgeWarning[] = [];
  for (const m of gate.mentions) {
    if (!m.substance) continue;
    const label = m.kind === 'brand_curated' ? `${m.input} (თუ მოქმედი ნივთიერებაა ${m.substance} — შესაბამისობა დაუდასტურებელია)` : m.input.toLowerCase() !== m.substance ? `${m.input} (${m.substance})` : m.substance;
    warnings.push(...ageWarningsFor(m.substance, age.years, label, age.band));
  }
  for (const conf of gate.confirmedAll?.length ? gate.confirmedAll : gate.confirmed ? [gate.confirmed] : []) {
    for (const ing of conf.identity.ingredients) warnings.push(...ageWarningsFor(ing.name.toLowerCase().split(' ')[0], age.years, ing.name, age.band));
  }
  const seen = new Set<string>();
  const unique = warnings.filter((w) => (seen.has(w.ruleId) ? false : (seen.add(w.ruleId), true)));
  if (!unique.length) return result;
  const rank: Record<string, number> = { contraindicated: 0, avoid: 1, restricted: 2, not_established: 3 };
  unique.sort((a, b) => rank[a.level] - rank[b.level]);
  const section = {
    titleKa: `⚠ ასაკობრივი შეზღუდვა — ${unique[0].ageKa}`,
    titleEn: 'Age restriction',
    body: '',
    bullets: unique.map((w) => `${w.inn}: ${w.levelKa}. ${w.textKa} (წყარო: ${w.sourceKa})`),
  };
  const base = result.status === 'ok' ? result : { ...result, status: 'ok' as const, summary: '', sections: [], claims: [] };
  return {
    ...base,
    summary: `⚠ ${unique[0].inn} — ${unique[0].ageKa}: ${unique[0].levelKa}. ${base.summary}`.trim(),
    sections: [section, ...base.sections],
    claims: [...unique.map((w) => `${w.inn}: ${w.levelKa} (${w.ageKa})`), ...base.claims],
    data: { ...base.data, ageWarnings: unique, ageYears: age.years },
    humanReviewRequired: true,
  };
};

const LABEL_KEYS: [string, string][] = [
  ['boxed_warning', 'ჩარჩოში ჩასმული გაფრთხილება'],
  ['indications_and_usage', 'ჩვენებები'],
  ['dosage_and_administration', 'დოზირება და მიღება'],
  ['dosage_forms_and_strengths', 'ფორმები და სიძლიერე'],
  ['contraindications', 'უკუჩვენებები'],
  ['warnings_and_cautions', 'გაფრთხილებები და სიფრთხილე'],
  ['warnings', 'გაფრთხილებები'],
  ['drug_interactions', 'წამალთაშორისი ურთიერთქმედება'],
];

/** „4 CONTRAINDICATIONS None. None ( 4 )" — a section that lists nothing. */
export function noneListed(t: string): boolean {
  const rest = t
    .replace(/contraindications?/gi, ' ')
    .replace(/\(\s*[\d.]+\s*\)/g, ' ')
    .replace(/^\s*[\d.]+/, ' ')
    .replace(/[.:;,\s]+/g, ' ')
    .trim()
    .toLowerCase();
  return rest.length > 0 && rest.split(' ').every((w) => w === 'none');
}

type Confirmed = MedicationGate['confirmedAll'][number];
const SRC_KA = (c: Confirmed) => (c.source === 'ema' ? 'ევროპა (EMA)' : 'აშშ (FDA)');

function identityBulletsOf(conf: Confirmed): string[] {
  const id = conf.identity;
  const src =
    conf.source === 'ema'
      ? `წყარო: EMA — ევროპული ინსტრუქცია (SmPC) ${id.source_id} · განახლება ${id.effective} · ${id.linked.noteKa}`
      : `წყარო: openFDA ${id.source === 'label' ? 'label' : 'NDC'} ${id.source_id} · თარიღი ${id.effective} · ${id.linked.noteKa}`;
  return [
    `დასახელება: ${[...id.brand_names, ...id.generic_names].join(' / ') || '—'}`,
    `მოქმედი ნივთიერება და სიძლიერე: ${id.ingredients.map((i) => `${i.name} ${i.strength}`).join('; ')}`,
    `ფორმა: ${id.dosage_forms.join('; ')}`,
    ...(id.routes.length ? [`შეყვანის გზა: ${id.routes.join(', ')}`] : []),
    `${conf.source === 'ema' ? 'რეგისტრაციის მფლობელი' : 'მწარმოებელი'}: ${id.manufacturer ?? '—'}`,
    src,
  ];
}

/**
 * One confirmed product, or a US (openFDA) and an EU (EMA) product side by
 * side. The two are separate products from separate regulators: each text is
 * labelled with its source and nothing is merged or reconciled.
 */
function confirmedOutput(confs: Confirmed[]) {
  const text = (c: Confirmed, k: string) => (c.label && Array.isArray(c.label[k]) ? String((c.label[k] as unknown[])[0] ?? '').replace(/\s+/g, ' ').trim() : '');
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}… (სრული ტექსტი — მედიკამენტის გვერდზე)` : t);
  const both = confs.length > 1;
  const hasEu = confs.some((c) => c.source === 'ema');
  const nameOf = (c: Confirmed) => c.identity.brand_names[0] ?? c.identity.generic_names[0] ?? c.query;
  const keys: [string, string][] = [...LABEL_KEYS, ['pregnancy', 'ორსულობა და ლაქტაცია']];
  const sections = keys.flatMap(([k, ka]) => {
    const parts = confs.map((c) => ({ c, t: text(c, k) })).filter((p) => p.t);
    if (!parts.length) return [];
    const lines = parts.map(({ c, t }) => {
      // A US label may list no contraindications at all („4 CONTRAINDICATIONS
      // None."). Say so plainly instead of passing a bare „None" on.
      if (k === 'contraindications' && noneListed(t)) return `${SRC_KA(c)}: აბსოლუტური უკუჩვენება ჩამოთვლილი არ არის (ორიგინალი: „${t}“). შეზღუდვები, შეწყვეტისა და გადადების კრიტერიუმები გაფრთხილებებშია.`;
      return both ? `${SRC_KA(c)}: ${clip(t, 1800)}` : clip(t, 2400);
    });
    const noneUs = k === 'contraindications' && parts.some(({ c, t }) => c.source !== 'ema' && noneListed(t));
    if (noneUs && !hasEu) {
      lines.push('ეს არ ნიშნავს, რომ პრეპარატი ყველასთვის უსაფრთხოა. ევროპული ინსტრუქცია (EMA) შეიძლება უკუჩვენებებს ჩამოთვლიდეს — მედიკამენტის გვერდზე შეგიძლიათ აირჩიოთ და დაადასტუროთ ევროპული პროდუქტიც და ორივე ერთად ნახოთ.');
    }
    if (!both && parts.length === 1 && !(k === 'contraindications' && noneListed(parts[0].t))) {
      return [{ titleKa: `${ka} (წყაროს ტექსტი, ინგლისურად · ${SRC_KA(parts[0].c)})`, titleEn: k, body: lines[0], bullets: [] as string[] }];
    }
    return [{ titleKa: both ? `${ka} — ${confs.map(SRC_KA).join(' · ')} (წყაროს ტექსტი, ინგლისურად)` : ka, titleEn: k, body: lines.join('\n\n'), bullets: [] as string[] }];
  });
  const first = confs[0];
  return ok('A07', {
    summary: both
      ? `${confs.map((c) => `${nameOf(c)} (${SRC_KA(c)})`).join(' და ')} — ორი დადასტურებული პროდუქტი; ინსტრუქციები ცალ-ცალკე, თითოეული თავისი წყაროდან.`
      : `${nameOf(first)} — დადასტურებული პროდუქტი; ინსტრუქცია მისივე წყაროდან (${first.source === 'ema' ? 'EMA, ევროპა' : 'openFDA, აშშ'}).`,
    sections: [
      ...confs.map((c) => ({ titleKa: `დადასტურებული პროდუქტი — ${SRC_KA(c)}`, titleEn: 'Confirmed product identity', body: 'იდენტობა დადასტურებულია სერვერზე (წყაროს ID, დასახელება, მოქმედი ნივთიერება, შიგთავსის hash). ეს არ არის კლინიკური დანიშნულების დამტკიცება.', bullets: identityBulletsOf(c) })),
      ...(both ? [{ titleKa: 'ორი წყარო', titleEn: 'Two regulators', body: 'აშშ-ისა (FDA) და ევროპის (EMA) ინსტრუქციები სხვადასხვა მარეგულირებლისაა და შეიძლება განსხვავდებოდეს (ჩვენებები, უკუჩვენებები, დოზირება). ორივე ნაჩვენებია ცალ-ცალკე; ერთმანეთით არ ჩანაცვლდება.', bullets: [] as string[] }] : []),
      ...sections,
    ],
    claims: [],
    data: {
      confirmedProduct: { identity: first.identity, token: first.token, query: first.query, recordId: first.record_id },
      confirmedProducts: confs.map((c) => ({ identity: c.identity, token: c.token, query: c.query, recordId: c.record_id, region: c.source === 'ema' ? 'EU' : 'US' })),
      label: first.label ? { query: first.query, genericNames: first.identity.generic_names, brandNames: first.identity.brand_names, confirmed: true } : null,
    },
    humanReviewRequired: true,
    note: `წყარო: ${confs.map((c) => (c.source === 'ema' ? 'EMA — ევროპული SmPC, EMA-ს პროდუქტის ნომრით' : 'openFDA — აშშ-ის ეტიკეტი, არჩეული პროდუქტის ID-ით')).join('; ')}. საქართველოში რეგისტრირებული ფორმის ინსტრუქცია შეიძლება განსხვავდებოდეს.`,
  });
}

const drugAgentCore: AgentImpl = async (c) => {
  const gate = c.medication ?? EMPTY_GATE;
  if (gate.confirmedAll?.length) return confirmedOutput(gate.confirmedAll);
  if (gate.confirmed) return confirmedOutput([gate.confirmed]);

  const explicit = (c.extras.drug as string) ?? '';
  const exact = gate.mentions.find((m) => m.kind === 'substance_exact' && m.substance && findDrug(m.substance));
  const drug = (explicit ? findDrug(explicit) : undefined) ?? (exact ? findDrug(exact.substance!) : undefined);
  const gateNote = gate.confirmError ? 'პროდუქტის დადასტურება ვერ გადამოწმდა ან ვადა გაუვიდა — ინსტრუქცია არ გამოიყენება; დაადასტურეთ ხელახლა.' : '';

  if (!drug) {
    // Low-value registry: evidence status of a named product, no dosing.
    const text = explicit || textOf(c);
    const lowValue = screenMedicationList(text)[0]?.entry;
    if (lowValue) {
      return ok('A07', {
        summary: `${lowValue.nameKa} — ${GRADE_KA[lowValue.grade]}. FDA: ${lowValue.approval.fda ? 'დამტკიცებულია' : 'არ არის დამტკიცებული'} · EMA: ${lowValue.approval.ema ? 'დამტკიცებულია' : 'არ არის დამტკიცებული'}.`,
        sections: [
          { titleKa: 'მტკიცებულების სტატუსი', titleEn: 'Evidence status', body: lowValue.evidenceKa, bullets: lowValue.keyReference ? [`${lowValue.keyReference.citation} (${lowValue.keyReference.year}) — ${lowValue.keyReference.url}`] : [] },
          { titleKa: 'რეგულატორული სტატუსი', titleEn: 'Regulatory status', body: lowValue.approval.noteKa ?? '', bullets: [] },
          { titleKa: 'რისკი და ტვირთი', titleEn: 'Harms', bullets: lowValue.harmsKa, body: '' },
          { titleKa: 'რას აქვს მტკიცებულება', titleEn: 'Evidence-based alternatives', bullets: lowValue.insteadKa, body: '' },
          { titleKa: 'რეკომენდებული მოქმედება', titleEn: 'Recommended action', body: `${TIER_KA[lowValue.tier].labelKa}: ${TIER_KA[lowValue.tier].actionKa}`, bullets: [] },
        ],
        claims: [`${lowValue.nameKa}: ${GRADE_KA[lowValue.grade]}`],
        data: { lowValue: lowValue.id },
        humanReviewRequired: true,
      });
    }

    // Named, but no dose-eligible identity: say exactly what is needed.
    if (gate.mentions.length) {
      return ok('A07', {
        summary: `პრეპარატის იდენტობა დადასტურებული არ არის — ინსტრუქცია და დოზა არ გაიცემა, სანამ კონკრეტული პროდუქტი არ შეირჩევა.`,
        sections: [
          {
            titleKa: 'პრეპარატის იდენტობა',
            titleEn: 'Medication identity required',
            body: [gateNote, 'სახელის მსგავსებით წამალს არ ვარჩევთ და სხვა პრეპარატით არ ვცვლით. ინსტრუქციისთვის აირჩიეთ ზუსტი პროდუქტი (ფორმა, სიძლიერე, გზა) და დაადასტურეთ.'].filter(Boolean).join(' '),
            bullets: gate.mentions.map(mentionLine),
          },
        ],
        claims: [],
        data: { identityRequired: gate.mentions.map((m) => ({ input: m.input, kind: m.kind, href: m.href, catalog: m.catalog, selectableTotal: m.selectableTotal, emaTotal: m.emaTotal })) },
        humanReviewRequired: true,
      });
    }
    return skipped('A07', gateNote || 'კონკრეტული მედიკამენტი კითხვიდან ვერ იდენტიფიცირდა.');
  }

  const p = c.patient;
  const notes: string[] = [];
  const crcl = reviewMedications({ ...p, medications: [{ id: 'x', drug: drug.generic_name, dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' }] }).crcl;
  if (crcl !== null) {
    drug.renal_adjustment.forEach((ra) => {
      const nums = ra.threshold.match(/\d+/g)?.map(Number) ?? [];
      const hit = /</.test(ra.threshold) && nums.length === 1 ? crcl < nums[0] : nums.length >= 2 ? crcl >= Math.min(...nums) && crcl <= Math.max(...nums) : false;
      if (hit) notes.push(`თირკმლის კორექცია (CrCl ${crcl} მლ/წთ): ${ra.action}`);
    });
  } else {
    notes.push('თირკმლის ფუნქცია ვერ გამოითვალა — დოზა ვერ დადასტურდა პაციენტისთვის.');
  }
  if (p.pregnant === 'yes') notes.push(`ორსულობა: ${drug.pregnancy}`);
  if (p.breastfeeding) notes.push(`ლაქტაცია: ${drug.lactation}`);
  if (p.hepaticImpairment === 'moderate' || p.hepaticImpairment === 'severe') notes.push(`ღვიძლის კორექცია: ${drug.hepatic_adjustment}`);
  p.allergies.forEach((a) => {
    if (drug.generic_name.toLowerCase().includes(a.toLowerCase().split(' ')[0])) notes.push(`ალერგიის გაფრთხილება: პაციენტს აღენიშნება ალერგია „${a}“.`);
  });

  // DOACs: apply the SmPC dose-reduction criteria to THIS patient.
  const doac = evaluateDoac(drug.generic_name, p);
  if (doac) {
    notes.unshift(
      doac.doseKa
        ? `პაციენტის მონაცემებით (AF): ${doac.doseKa}${doac.settled ? '' : ' — წინასწარი, იხ. დასაზუსტებელი'}.`
        : doac.settled
          ? `პაციენტის მონაცემებით: ${doac.warningsKa[doac.warningsKa.length - 1] ?? 'არ არის რეკომენდებული'}`
          : 'დოზა ვერ დადგინდება — აკლია გადამწყვეტი მონაცემი.',
    );
  }

  return ok('A07', {
    summary: `${drug.generic_ka || drug.generic_name} — ნივთიერების დონის კურირებული წესები: დოზირება, უსაფრთხოება, მონიტორინგი.`,
    sections: [
      {
        titleKa: 'იდენტობა',
        titleEn: 'Identity level',
        body: `მოქმედი ნივთიერება ზუსტად დასახელებულია (${drug.generic_name}). ეს არის ნივთიერების დონის კურირებული წესი და არა კონკრეტული პროდუქტის ინსტრუქცია — ფორმა, სიძლიერე და მწარმოებელი დადასტურებული არ არის.`,
        bullets: [],
      },
      { titleKa: 'დოზა (მოზრდილები) — ნივთიერების დონე', titleEn: 'Adult dose', body: drug.adult_dose, bullets: [] },
      { titleKa: 'პაციენტ-სპეციფიკური ფაქტორები', titleEn: 'Patient-specific modifiers', bullets: notes.length ? notes : ['პაციენტ-სპეციფიკური კორექციის საჭიროება ავტომატურ შემოწმებაში არ გამოვლინდა.'], body: '' },
      ...(doac
        ? [{ titleKa: 'დოზის კრიტერიუმები პაციენტზე', titleEn: 'Dose criteria applied', body: doac.sourceKa, bullets: [...doac.criteriaKa, ...doac.warningsKa, ...doac.missingKa.map((m) => `დასაზუსტებელი: ${m}`)] }]
        : []),
      { titleKa: 'უკუჩვენებები', titleEn: 'Contraindications', bullets: drug.contraindications, body: '' },
      { titleKa: 'გაფრთხილებები', titleEn: 'Warnings', bullets: drug.warnings, body: '' },
      { titleKa: 'მონიტორინგი', titleEn: 'Monitoring', bullets: drug.monitoring, body: '' },
      { titleKa: 'შეწყვეტა და ტიტრაცია', titleEn: 'Withdrawal & taper', bullets: [drug.withdrawal, drug.taper].filter(Boolean), body: '' },
      { titleKa: 'ხელმისაწვდომობა საქართველოში', titleEn: 'Availability in Georgia', body: drug.georgia_availability, bullets: [] },
    ],
    claims: [`${drug.generic_name}-ის მოზრდილთა დოზირება: ${drug.adult_dose}`],
    sourceIds: drug.sources,
    data: { drug, crcl, doac },
    humanReviewRequired: true,
  });
};

/** A08 — Medication reconciliation & deprescribing. */
const medRecAgent: AgentImpl = (c) => {
  if (!c.patient.medications.length) return skipped('A08', 'მედიკამენტების სია ცარიელია.');
  const r = reviewMedications(c.patient);

  // The programme's purpose — removing what does not work — runs over every
  // medication, including those the curated interaction engine does not know.
  const medText = c.patient.medications.map((m) => `${m.drug} ${m.dose}`).join('\n');
  const lowValue = screenMedicationList(medText);
  const tapers = taperFor(medText);
  const count = c.patient.medications.filter((m) => m.status === 'active').length;

  return ok('A08', {
    summary: `შეჯერება: ${r.findings.length} მიგნება · ${lowValue.length} დაბალი ღირებულების პრეპარატი · ${tapers.length} ტიტრაციის სქემა${count >= 5 ? ` · პოლიფარმაცია (${count} აქტიური)` : ''}.`,
    sections: [
      ...(lowValue.length
        ? [{
            titleKa: 'დაბალი ღირებულების პრეპარატები',
            titleEn: 'Low-value medications',
            bullets: lowValue.map(({ entry }) => `${entry.nameKa} — ${GRADE_KA[entry.grade]} · ${TIER_KA[entry.tier].labelKa}`),
            body: 'გრადაცია აფასებს ჩვენებას და არა კონკრეტულ პაციენტს. შეწყვეტა ხდება ექიმის კონტროლით.',
          }]
        : []),
      { titleKa: 'მიგნებები', titleEn: 'Findings', bullets: r.findings.map((f) => `[${f.severity}] ${f.titleKa} — ${f.detail} → ${f.action}`), body: '' },
      { titleKa: 'კუმულაციური ტვირთები', titleEn: 'Cumulative burdens', bullets: Object.entries(r.burdens).map(([k, v]) => `${k}: ${v}`), body: '' },
      { titleKa: 'დეპრესკრაიბინგის კანდიდატები', titleEn: 'Deprescribing candidates', bullets: r.deprescribing.map((d) => `${d.drug} — ჩვენება: ${d.originalIndication}; ტიტრაცია: ${d.taperNeeded ? d.taperConcept : 'არ ესაჭიროება'}; მონიტორინგი: ${d.monitoring}`), body: '' },
      ...(tapers.length
        ? [{
            titleKa: 'ტიტრაციის სქემები',
            titleEn: 'Taper schedules',
            bullets: tapers.map((t) => `${t.groupKa}: ${t.rateKa}, ${t.durationKa}. ${t.noteKa}`),
            body: 'პოლიფარმაციის მართვის პროგრამის სქემები.',
          }]
        : []),
      ...(r.unresolved.length ? [{ titleKa: 'კურირებულ რეესტრში ვერ მოიძებნა', titleEn: 'Unresolved medications', bullets: r.unresolved, body: 'ამ პრეპარატებზე ურთიერთქმედება შემოწმდება „წამლების შემოწმების“ მოდულში ღია ეტიკეტებით.' }] : []),
    ],
    claims: [
      ...r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => f.titleKa),
      ...lowValue.filter(({ entry }) => entry.tier === 'I_stop_now').map(({ entry }) => `${entry.nameKa}: ${GRADE_KA[entry.grade]}`),
    ],
    sourceIds: r.sourceIds,
    data: { review: r, lowValue: lowValue.map(({ entry }) => entry.id), tapers: tapers.map((t) => t.groupKa) },
    humanReviewRequired: true,
  });
};

/** A09 — Calculators. */
const calcAgent: AgentImpl = (c) => {
  const suggestions = suggestCalculators(textOf(c));
  const computed: { id: string; nameKa: string; display: string; interpretationKa: string; severity: string; formulaKa: string; sourceIds: string[] }[] = [];
  const p = c.patient;

  const tryCalc = (id: string, input: Record<string, number | boolean | string>) => {
    const calc = CALCULATORS.find((x) => x.id === id);
    if (!calc) return;
    const r = calc.compute(input);
    computed.push({ id: calc.id, nameKa: calc.nameKa, display: `${r.display}${r.unit ? ` ${r.unit}` : ''}`, interpretationKa: r.interpretationKa, severity: r.severity, formulaKa: calc.formulaKa, sourceIds: calc.sourceIds });
  };

  if (p.age !== null && p.weightKg !== null && p.creatinineMgDl !== null) tryCalc('crcl', { age: p.age, weight: p.weightKg, creat: p.creatinineMgDl, female: p.sex === 'female' });
  if (p.age !== null && p.creatinineMgDl !== null) tryCalc('egfr', { age: p.age, creat: p.creatinineMgDl, female: p.sex === 'female' });
  if (p.weightKg !== null && p.heightCm !== null) tryCalc('bmi', { weight: p.weightKg, height: p.heightCm });
  if (p.age !== null && /ფიბრილაცი|fibrillation|ანტიკოაგულ/i.test(textOf(c)))
    tryCalc('cha2ds2-vasc', {
      age: p.age,
      female: p.sex === 'female',
      chf: /გულის უკმარისობ/.test(p.problems.join(' ')),
      htn: /ჰიპერტენზ/.test(p.problems.join(' ')),
      dm: /დიაბეტ/.test(p.problems.join(' ')),
      stroke: /ინსულტ|tia|გარდამავალი იშემიური/i.test(textOf(c)),
      vascular: /სისხლძარღვ|ინფარქტ|პერიფერიულ/i.test(p.problems.join(' ')),
    });

  if (!computed.length && !suggestions.length) return skipped('A09', 'ქეისიდან რელევანტური ვალიდირებული ქულა ავტომატურად ვერ შეირჩა.');

  return ok('A09', {
    summary: computed.length ? `გამოთვლილია ${computed.length} ქულა დეტერმინისტული კოდით.` : 'შემოთავაზებულია რელევანტური კალკულატორები.',
    sections: [
      ...(computed.length ? [{ titleKa: 'გამოთვლილი ქულები', titleEn: 'Computed scores', bullets: computed.map((x) => `${x.nameKa}: ${x.display} — ${x.interpretationKa}`), body: '' }] : []),
      ...(suggestions.length ? [{ titleKa: 'რელევანტური კალკულატორები', titleEn: 'Relevant calculators', bullets: suggestions.map((s) => `${s.nameKa} — ${s.purposeKa}`), body: '' }] : []),
    ],
    // A suggested calculator is not evidence for the answer: only a value that
    // was actually computed carries its formula's source (audit F04).
    sourceIds: [...new Set(computed.flatMap((x) => x.sourceIds))],
    data: { computed, suggested: suggestions.map((s) => ({ id: s.id, nameKa: s.nameKa })) },
  });
};

/** A10 — Laboratory intelligence. */
const labAgent: AgentImpl = (c) => {
  const labs = (c.extras.labs as typeof c.patient.labs) ?? c.patient.labs;
  if (!labs.length) return skipped('A10', 'ლაბორატორიული მონაცემები არ არის მოწოდებული.');
  const a = interpretLabs(labs, c.patient);
  return ok('A10', {
    summary: `${a.results.length} მაჩვენებელი, მათ შორის ${a.abnormal.length} პათოლოგიური და ${a.critical.length} კრიტიკული.`,
    sections: [
      { titleKa: 'პათოლოგიური მნიშვნელობები', titleEn: 'Abnormal values', bullets: a.abnormal.map((r) => `${r.labelKa}: ${r.value} ${r.unit} (რეფ. ${r.refText}) — ${r.noteKa}`), body: '' },
      { titleKa: 'პატერნები', titleEn: 'Patterns', bullets: a.patterns.map((p) => `[${p.severity}] ${p.titleKa} — ${p.detailKa}`), body: '' },
      { titleKa: 'დინამიკა', titleEn: 'Trends', bullets: a.trends.map((t) => `${t.labelKa}: ${t.direction} (${t.deltaPct > 0 ? '+' : ''}${t.deltaPct}%)`), body: '' },
      { titleKa: 'წამლისმიერი ცვლილებები', titleEn: 'Medication-related', bullets: a.medicationRelated.map((m) => `${m.titleKa} — ${m.detailKa}`), body: '' },
      { titleKa: 'გადაუდებელი ყურადღება', titleEn: 'Requires urgent attention', bullets: a.urgent, body: '' },
    ],
    claims: a.critical.map((r) => `${r.labelKa} ${r.value} ${r.unit} კრიტიკულ ზღვარს სცდება`),
    data: { analysis: a },
    humanReviewRequired: a.critical.length > 0,
  });
};

/** A15 — Georgian medical context. */
const georgianAgent: AgentImpl = (c) => {
  const notes = georgianContextFor(textOf(c));
  const terms = termLookup(c.question).slice(0, 4);
  // No matching note → nothing to say, and no source to attach: the patient-rights
  // and data-protection laws are cited only under a note that is about them
  // (audit F04: they were attached to a definition of hypertension).
  if (!notes.length && !terms.length) return skipped('A15', 'ამ კითხვისთვის ქართული კონტექსტის შენიშვნა ან ტერმინი არ მოიძებნა.');
  const legal = notes.some((n) => n.category === 'legal' || n.category === 'documentation');
  return ok('A15', {
    summary: 'ქართული კლინიკური კონტექსტი (ცალკე ბლოკი, გლობალურ მტკიცებულებასთან შერევის გარეშე).',
    sections: [
      ...(notes.length ? [{ titleKa: 'ლოკალური კონტექსტი', titleEn: 'Georgian context', bullets: notes.map((n) => `${n.topic}: ${n.note}`), body: '' }] : []),
      ...(terms.length ? [{ titleKa: 'ტერმინოლოგია', titleEn: 'Terminology', bullets: terms.map((t) => `${t.preferred_ka} (${t.english})${t.deprecated_ka.length ? ` — მოძველებული: ${t.deprecated_ka.join(', ')}` : ''}`), body: '' }] : []),
    ],
    sourceIds: legal ? ['SRC-GE-PATIENT-RIGHTS', 'SRC-GE-DATA-PROTECTION'] : [],
    data: { notes, terms },
  });
};

/** A13 — Quality & patient safety audit. */
const qualityAgent: AgentImpl = (c) => {
  const narrative = (c.extras.caseNarrative as string) || c.patient.narrative || c.question;
  if (!narrative.trim()) return skipped('A13', 'ქეისის აღწერა ხარისხის აუდიტისთვის არ არის მოწოდებული.');

  const fullText = `${narrative} ${c.patient.timeline.map((t) => `${t.title} ${t.detail}`).join(' ')}`;
  const profile = qualityProfile(fullText);
  const timeline = c.patient.timeline.length
    ? c.patient.timeline.map((t) => `${t.date || '—'} · ${t.title}${t.detail ? ` — ${t.detail}` : ''}`)
    : ['ქრონოლოგია აღდგენილი არ არის — ეს თავისთავად დოკუმენტაციური ხარვეზია.'];

  const top = profile.classes.slice(0, 4);
  const defects = top.map((cs, i) => ({
    id: `DEF-${i + 1}`,
    domain: cs.cls.code,
    code: cs.code,
    classKa: `${cs.cls.roman}. ${cs.cls.nameKa}`,
    support: cs.support,
    ruleIds: cs.ruleIds,
    expectedStandard: cs.cls.assessmentCriteria.join('; '),
    deviation:
      cs.keywordHits.length || cs.ruleIds.length
        ? `მიმანიშნებელი: ${[...cs.keywordHits, ...cs.ruleIds.slice(0, 3)].join(', ')}`
        : '',
    deviationJustified: 'cannot_determine' as const,
    potentialHarm: 'cannot_determine' as const,
    severity: cs.support >= 4 ? 'high' : cs.support >= 2 ? 'moderate' : 'low',
    confidence: cs.support >= 4 ? 'moderate' : 'low',
    correctiveAction: cs.cls.controlMechanism.join('; '),
    preventiveAction: `პროცესის განახლება; პასუხისმგებელი: ${cs.cls.responsible.join(', ')}.`,
  }));

  const ruleBullets = profile.rules.slice(0, 8).map(({ rule }) => ruleLine(rule));

  return ok('A13', {
    summary: defects.length
      ? `${defects.length} პოტენციური დეფექტის კლასი; ${profile.rules.length} კრიტერიუმი სახელმძღვანელოს კორპუსიდან. საჭიროებს ექსპერტულ მიმოხილვას.`
      : 'ავტომატურ სკრინინგში დეფექტის მიმანიშნებელი ელემენტი ვერ გამოვლინდა. ეს არ ნიშნავს დეფექტის არარსებობას.',
    sections: [
      { titleKa: '1. ქრონოლოგიის აღდგენა', titleEn: 'Timeline reconstruction', bullets: timeline, body: '' },
      {
        titleKa: '2. სავარაუდო დეფექტის კლასები',
        titleEn: 'Candidate defect classes',
        bullets: defects.map((d) => `${d.code} ${d.classKa} — მხარდაჭერა: ${d.support}${d.deviation ? ` · ${d.deviation}` : ''}`),
        body: defects.length ? 'რანჟირებულია მხარდამჭერი ნიშნებისა და წესების რიცხვით — არა ალბათობით.' : '',
      },
      {
        titleKa: '3. მოსალოდნელი სტანდარტი — სახელმძღვანელოს კრიტერიუმები',
        titleEn: 'Expected standard — manual criteria',
        bullets: ruleBullets.length ? ruleBullets : defects.map((d) => `${d.classKa}: ${d.expectedStandard}`),
        body: profile.corpusNoteKa,
      },
      {
        titleKa: '4. აუდიტის კითხვები',
        titleEn: 'Audit questions',
        bullets: profile.questions.map((q) => `${q.id} — ${q.questionKa}`),
        body: '',
      },
      {
        titleKa: '5. საჭირო მტკიცებულება',
        titleEn: 'Required evidence',
        bullets: profile.requiredEvidence.map((e) => `${e.labelKa} (${e.ruleCount} წესი)`),
        body: profile.requiredEvidence.length ? 'შეფასება არ არის სრული, სანამ ეს მასალა არ არის განხილული.' : '',
      },
      {
        titleKa: '6. ზიანისა და მიზეზობრიობის სკრინინგი',
        titleEn: 'Harm & causality screen',
        body: [
          profile.gates.causality ? 'მიზეზობრიობა საჭიროებს დამოუკიდებელ შეფასებას.' : '',
          profile.gates.standardComparison ? 'საჭიროა შედარება მოვლენის დროს მოქმედ სტანდარტთან.' : '',
          profile.gates.documentationReview ? 'დოკუმენტაცია ფასდება კლინიკური შესრულებისგან ცალკე.' : '',
          'ზიანი და მიზეზობრივი კავშირი ავტომატურად არ დგინდება.',
        ].filter(Boolean).join(' '),
        bullets: [],
      },
      {
        titleKa: '7. მაკორექტირებელი და პრევენციული ქმედება (CAPA)',
        titleEn: 'Corrective & preventive action',
        bullets: defects.map((d) => `${d.classKa}: ${d.correctiveAction} | ${d.preventiveAction}`),
        body: '',
      },
      {
        titleKa: '8. ადამიანური მიმოხილვა',
        titleEn: 'Human review',
        body: 'ყველა დასკვნა სავალდებულო წესით გადის ექსპერტის ან ხარისხის სამსახურის მიმოხილვას. უარყოფითი შედეგი თავისთავად არ არის დეფექტი და გადახრა თავისთავად არ არის დაუდევრობა.',
        bullets: [],
      },
    ],
    claims: defects.map((d) => `${d.classKa} — პოტენციური გადახვევა საჭიროებს ექსპერტულ შეფასებას`),
    sourceIds: ['SRC-GE-PATIENT-RIGHTS', 'SRC-WHO-SURGICAL-CHECKLIST'],
    data: {
      defects,
      ruleIds: profile.rules.map((r) => r.rule.id),
      questions: profile.questions,
      requiredEvidence: profile.requiredEvidence,
      gates: profile.gates,
      causeCategories: CAUSE_CATEGORIES.map((x) => x.nameKa),
    },
    humanReviewRequired: true,
  });
};

/** A14 — Medico-legal defect analysis. */
const defectAgent: AgentImpl = (c) => {
  const claim = (c.extras.claim as string) ?? '';
  const narrative = (c.extras.caseNarrative as string) || c.patient.narrative || c.question;
  if (!narrative.trim()) return skipped('A14', 'ქეისის ფაქტობრივი აღწერა არ არის მოწოდებული.');

  const profile = qualityProfile(`${claim} ${narrative}`);
  const primary = profile.classes[0];
  const cls = primary?.cls;

  const facts = c.patient.timeline.length
    ? c.patient.timeline.map((t) => `${t.date || '—'} · ${t.title}${t.detail ? ` — ${t.detail}` : ''}`)
    : [];

  // Prefer the manual's own audit questions; the generic list is a fallback
  // only when the corpus has nothing to say about this narrative.
  const questions = profile.questions.length
    ? profile.questions.map((q) => q.questionKa)
    : ASSESSMENT_QUESTIONS;

  return ok('A14', {
    summary: `მედიკო-ლეგალური ანალიზი რეჟიმში „${DEFECT_MODE_KA[c.reviewMode]}“ — ნეიტრალური ჩარჩო, მხარის არჩევის გარეშე. ${profile.rules.length} კრიტერიუმი სახელმძღვანელოს კორპუსიდან.`,
    sections: [
      { titleKa: 'მოთხოვნა / პრეტენზია', titleEn: 'Claim', body: claim || 'პრეტენზია ფორმულირებული არ არის — ანალიზი ტარდება ქეისის ფაქტების საფუძველზე.', bullets: [] },
      { titleKa: 'დოკუმენტირებული ფაქტები', titleEn: 'Documented facts', bullets: facts, body: narrative.slice(0, 400) },
      {
        titleKa: 'განსახილველი დეფექტის კლასები',
        titleEn: 'Classes under consideration',
        bullets: profile.classes.slice(0, 4).map((x) => `${x.code} ${x.cls.roman}. ${x.cls.nameKa} — მხარდაჭერა ${x.support}`),
        body: cls ? '' : 'ავტომატურად კლასი ვერ განისაზღვრა — საჭიროა ექსპერტის პირველადი კვალიფიკაცია.',
      },
      {
        titleKa: 'მოსალოდნელი სტანდარტი',
        titleEn: 'Expected standard',
        bullets: profile.rules.length
          ? profile.rules.slice(0, 6).map(({ rule }) => ruleLine(rule))
          : (cls?.assessmentCriteria ?? []),
        body: profile.corpusNoteKa,
      },
      {
        titleKa: 'გადახვევა და მისი დასაბუთებულობა — კითხვები',
        titleEn: 'Deviation and justification — questions',
        bullets: questions,
        body: 'თითოეულ კითხვაზე პასუხი უნდა ეყრდნობოდეს დოკუმენტს და არა ინტერპრეტაციას.',
      },
      {
        titleKa: 'მტკიცებულება, რომლის გარეშეც დასკვნა არ კეთდება',
        titleEn: 'Evidence required',
        bullets: profile.requiredEvidence.map((e) => e.labelKa),
        body: '',
      },
      {
        titleKa: 'დოკუმენტაციის საკმარისობა',
        titleEn: 'Documentation sufficiency',
        body: 'თუ ჩანაწერი არ ადასტურებს გადაწყვეტილების ლოგიკას, ექსპერტიზაში ეს დამოუკიდებელ ხარვეზად ფასდება მიუხედავად კლინიკური შედეგისა.',
        bullets: [],
      },
      {
        titleKa: 'მიზეზობრიობა და პოტენციური ზიანი',
        titleEn: 'Causation and potential harm',
        body: 'მიზეზობრივი კავშირი ავტომატურად არ დგინდება. საჭიროა: (1) გადახვევის დადასტურება, (2) ზიანის დადასტურება, (3) მათ შორის კავშირის დასაბუთება.',
        bullets: [],
      },
      { titleKa: 'მიზეზების ტიპოლოგია', titleEn: 'Cause typology', bullets: CAUSE_CATEGORIES.map((x) => `${x.nameKa}: ${x.definitionKa}`), body: '' },
      {
        titleKa: 'ქართული სამართლებრივი კონტექსტი',
        titleEn: 'Georgian legal context',
        bullets: [
          'პაციენტის უფლებების შესახებ კანონმდებლობა — ინფორმირებული თანხმობა და დოკუმენტაციაზე წვდომა.',
          '„პერსონალურ მონაცემთა დაცვის შესახებ“ კანონი — ჯანმრთელობის მონაცემი განსაკუთრებული კატეგორიისაა (მუხლი 6).',
          'ზუსტი მუხლობრივი მითითება საჭიროებს მოვლენის დროს მოქმედი რედაქციის გადამოწმებას.',
        ],
        body: '',
      },
      { titleKa: 'გაურკვევლობა და ექსპერტის საჭიროება', titleEn: 'Uncertainty and expert review', body: 'დასკვნა არის სამუშაო ჩარჩო ექსპერტისთვის და არა სამართლებრივი კვალიფიკაცია.', bullets: [] },
    ],
    claims: cls ? [`ქეისში იკვეთება პოტენციური გადახვევა კლასში „${cls.nameKa}“, რომელიც საჭიროებს ექსპერტულ დადასტურებას`] : [],
    sourceIds: ['SRC-GE-PATIENT-RIGHTS', 'SRC-GE-DATA-PROTECTION'],
    data: {
      defectClass: cls?.code ?? null,
      classes: profile.classes.map((x) => ({ code: x.code, nameKa: x.cls.nameKa, support: x.support })),
      ruleIds: profile.rules.map((r) => r.rule.id),
      reviewMode: c.reviewMode,
    },
    humanReviewRequired: true,
  });
};

const orText = (v?: string) => (v ? v.split('|').join(' OR ') : '—');

/** A18 — Research. */
const researchAgent: AgentImpl = async (c) => {
  const rq = (c.extras.researchQuestion as string) ?? c.question;
  if (!rq?.trim()) return skipped('A18', 'კვლევითი კითხვა არ არის ფორმულირებული.');

  const pico = (c.extras.pico as { p?: string; i?: string; c?: string; o?: string } | undefined) ?? undefined;
  const hasPico = Boolean(pico && Object.values(pico).some((v) => (v ?? '').trim().length > 2));

  // PICO elements are frequently entered in Georgian; each is rendered to
  // controlled English terms so the search engine can match them.
  // An element with no controlled English equivalent is DROPPED from the
  // search, not sent as Georgian: a Georgian phrase in an English index
  // matches nothing and silently zeroes the whole AND query.
  const toEn = (v?: string) => (v && v.trim() ? englishSynonyms(v, 4).join('|') : '');
  const enPico = hasPico ? { p: toEn(pico?.p), i: toEn(pico?.i), c: toEn(pico?.c), o: toEn(pico?.o) } : undefined;
  const dropped = hasPico
    ? (['p', 'i', 'c', 'o'] as const).filter((k) => (pico?.[k] ?? '').trim() && !enPico?.[k])
    : [];
  const freeTerms = englishSearchTerms(rq);

  const query = hasPico
    ? { text: '', pico: enPico, limit: 8, openAccessOnly: false, fromYear: new Date().getFullYear() - 10 }
    : { text: freeTerms.join(' '), limit: 8, openAccessOnly: false, fromYear: new Date().getFullYear() - 10 };

  const searchable = (hasPico && Object.values(enPico ?? {}).some((v) => v)) || (!hasPico && freeTerms.length > 0);
  const live = searchable ? await withCeiling(searchLiterature(query), 9000, null) : null;
  const citations = live?.citations ?? [];
  const tiers = live?.tierCounts;

  return ok('A18', {
    summary: searchable
      ? `კვლევითი კითხვა: ${rq.slice(0, 120)} · მოძიებულია ${live?.hitCount ?? 0} ჩანაწერი, ნაჩვენებია ${citations.length}.`
      : `კვლევითი კითხვა: ${rq.slice(0, 120)} · ძიებისთვის ტერმინი ვერ ამოიცნო — დაამატეთ PICO ელემენტები.`,
    sections: [
      {
        titleKa: 'ძიების სტრატეგია',
        titleEn: 'Search strategy',
        body: live?.query ? `Europe PMC სტრიქონი: ${live.query}` : 'ძიების სტრიქონი ვერ აიგო.',
        bullets: hasPico
          ? [
              `P — ${pico?.p || '—'} → ${orText(enPico?.p)}`,
              `I — ${pico?.i || '—'} → ${orText(enPico?.i)}`,
              `C — ${pico?.c || '—'} → ${orText(enPico?.c)}`,
              `O — ${pico?.o || '—'} → ${orText(enPico?.o)}`,
              ...(dropped.length
                ? [`ძიებიდან ამოღებულია (ვერ ითარგმნა კონტროლირებული ტერმინით): ${dropped.map((k) => k.toUpperCase()).join(', ')}. ჩაწერეთ ინგლისურად ან სინონიმით.`]
                : []),
            ]
          : [`საკვანძო ტერმინები: ${freeTerms.join(', ') || '—'}`],
      },
      ...(tiers
        ? [{
            titleKa: 'მტკიცებულების სტრუქტურა',
            titleEn: 'Evidence profile',
            bullets: (Object.keys(tiers) as (keyof typeof tiers)[])
              .filter((k) => tiers[k] > 0)
              .map((k) => `${EVIDENCE_TIER_KA[k]}: ${tiers[k]}`),
            body: '',
          }]
        : []),
      {
        titleKa: 'მოძიებული პუბლიკაციები',
        titleEn: 'Retrieved publications',
        bullets: citations.map((x) => `[${EVIDENCE_TIER_KA[x.evidenceTier]}] ${citationText(x)}`),
        body: citations.length ? '' : 'პუბლიკაცია ვერ მოიძებნა. გააფართოვეთ ტერმინები ან მოხსენით წლის შეზღუდვა.',
      },
      {
        titleKa: 'მეთოდოლოგიური წესი',
        titleEn: 'Rule',
        body: 'ყოველი მითითება მოდის Europe PMC-დან და გადამოწმებადია DOI-ით ან PMID-ით. გამოგონილი ციტირება სტრუქტურულად შეუძლებელია.',
        bullets: [],
      },
    ],
    sourceIds: c.hits.map((h) => h.source.source_id),
    data: { researchQuestion: rq, pico: enPico ?? null, citations, tierCounts: tiers ?? null, query: live?.query ?? null },
  });
};

export const AGENT_IMPLEMENTATIONS: Record<string, AgentImpl> = {
  A01: reasoningAgent,
  A02: ddxAgent,
  A03: missingAgent,
  A04: challengeAgent,
  A05: evidenceAgent,
  A06: guidelineAgent,
  A07: drugAgent,
  A08: medRecAgent,
  A09: calcAgent,
  A10: labAgent,
  A11: imagingAgent,
  A12: documentationAgent,
  A13: qualityAgent,
  A14: defectAgent,
  A15: georgianAgent,
  A16: patientAgent,
  A17: academyAgent,
  A18: researchAgent,
};

export { detectRedFlags, sourcesByIds };
