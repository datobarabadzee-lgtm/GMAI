import type { PatientContext } from '@/schemas/clinical';
import type { DeprescribingItem, Drug, MedicationFinding } from '@/schemas/drug';
import { findDrug, interactionsFor } from '@/knowledge/drugs';
import { CALCULATORS } from '@/lib/calculators';

/**
 * MEDICATION RECONCILIATION & DEPRESCRIBING ENGINE — deterministic rules engine.
 * This is clinician decision support. It never prescribes autonomously.
 */

export type ResolvedMedication = {
  raw: { id: string; drug: string; dose: string; frequency: string; indication: string; status: string };
  drug?: Drug;
};

export type MedicationReview = {
  resolved: ResolvedMedication[];
  unresolved: string[];
  findings: MedicationFinding[];
  burdens: { anticholinergic: number; sedative: number; bleeding: number; qt: number; serotonergic: number; fallRisk: number };
  crcl: number | null;
  deprescribing: DeprescribingItem[];
  sourceIds: string[];
};

const uid = (p: string, i: number) => `${p}-${i}`;

function computeCrCl(p: PatientContext): number | null {
  if (!p.age || !p.weightKg || !p.creatinineMgDl) return null;
  const calc = CALCULATORS.find((c) => c.id === 'crcl');
  if (!calc) return null;
  const r = calc.compute({ age: p.age, weight: p.weightKg, creat: p.creatinineMgDl, female: p.sex === 'female' });
  return r.value;
}

export function reviewMedications(patient: PatientContext): MedicationReview {
  const active = patient.medications.filter((m) => m.status === 'active' || m.status === 'unknown');
  const resolved: ResolvedMedication[] = active.map((m) => ({ raw: m, drug: findDrug(m.drug) }));
  const unresolved = resolved.filter((r) => !r.drug).map((r) => r.raw.drug);
  const known = resolved.filter((r) => r.drug).map((r) => ({ ...r, drug: r.drug as Drug }));
  const findings: MedicationFinding[] = [];
  const sourceIds = new Set<string>();
  let idx = 0;

  // 1. Duplicate therapy / therapeutic overlap
  const byClass = new Map<string, string[]>();
  known.forEach((k) => {
    const cls = k.drug.class;
    byClass.set(cls, [...(byClass.get(cls) ?? []), k.drug.generic_name]);
  });
  byClass.forEach((names, cls) => {
    if (names.length > 1) {
      findings.push({
        id: uid('DUP', idx++),
        category: 'duplicate',
        severity: 'high',
        titleKa: 'თერაპიული დუბლირება',
        detail: `ერთი ფარმაკოლოგიური ჯგუფის (${cls}) რამდენიმე პრეპარატი ერთდროულად: ${names.join(', ')}. შეამოწმეთ, არის თუ არა კომბინაცია განზრახ და დასაბუთებული.`,
        drugs: names,
        action: 'დაადასტურეთ ჩვენება ან შეწყვიტეთ დუბლირებული პრეპარატი',
        sources: [],
      });
    }
  });

  // 2. Drug-drug interactions
  const ids = known.map((k) => k.drug.id);
  const ints = interactionsFor(ids);
  ints.forEach((i) => {
    const a = known.find((k) => k.drug.id === i.a)?.drug.generic_name ?? i.a;
    const bName = known.find((k) => k.drug.id === i.b)?.drug.generic_name ?? i.b;
    i.sources.forEach((s) => sourceIds.add(s));
    findings.push({
      id: uid('INT', idx++),
      category: 'interaction',
      severity: i.severity === 'contraindicated' ? 'critical' : i.severity === 'major' ? 'high' : i.severity === 'moderate' ? 'moderate' : 'low',
      titleKa: `წამლისმიერი ურთიერთქმედება: ${a} + ${bName}`,
      detail: `${i.mechanism}. შედეგი: ${i.effect}.`,
      drugs: [a, bName],
      action: i.management,
      sources: i.sources,
    });
  });

  // 3. Renal dosing
  const crcl = computeCrCl(patient);
  const egfr = patient.egfr ?? null;
  const renalValue = crcl ?? egfr;
  if (renalValue !== null) {
    known.forEach((k) => {
      k.drug.renal_adjustment.forEach((ra) => {
        const numbers = ra.threshold.match(/\d+/g)?.map(Number) ?? [];
        if (!numbers.length) return;
        const hit =
          /</.test(ra.threshold) && numbers.length === 1
            ? renalValue < numbers[0]
            : numbers.length >= 2
              ? renalValue >= Math.min(...numbers) && renalValue <= Math.max(...numbers)
              : false;
        if (hit) {
          k.drug.sources.forEach((s) => sourceIds.add(s));
          findings.push({
            id: uid('REN', idx++),
            category: 'renal',
            severity: /არ არის რეკომენდებული|უკუნაჩვენებია/.test(ra.action) ? 'critical' : 'high',
            titleKa: `თირკმლის ფუნქციაზე დამოკიდებული კორექცია — ${k.drug.generic_name}`,
            detail: `გამოთვლილი თირკმლის ფუნქცია ${renalValue} (${crcl !== null ? 'CrCl მლ/წთ' : 'eGFR მლ/წთ/1.73მ²'}) ხვდება ზღვარში „${ra.threshold}“.`,
            drugs: [k.drug.generic_name],
            action: ra.action,
            sources: k.drug.sources,
          });
        }
      });
    });
  } else {
    findings.push({
      id: uid('REN', idx++),
      category: 'renal',
      severity: 'moderate',
      titleKa: 'თირკმლის ფუნქცია შეუფასებელია',
      detail: 'ასაკი, წონა ან შრატის კრეატინინი არ არის მითითებული, ამიტომ კრეატინინის კლირენსი ვერ გამოითვალა. თირკმლით გამოყოფადი პრეპარატების დოზა ვერ მოწმდება.',
      drugs: [],
      action: 'შეავსეთ ასაკი, წონა და კრეატინინი Clinical Context პანელში',
      sources: [],
    });
  }

  // 4. Hepatic
  if (patient.hepaticImpairment === 'moderate' || patient.hepaticImpairment === 'severe') {
    known
      .filter((k) => k.drug.hepatic_adjustment && !/კორექცია ჩვეულებრივ არ ესაჭიროება|კორექცია არ ესაჭიროება/.test(k.drug.hepatic_adjustment))
      .forEach((k) => {
        findings.push({
          id: uid('HEP', idx++),
          category: 'hepatic',
          severity: patient.hepaticImpairment === 'severe' ? 'high' : 'moderate',
          titleKa: `ღვიძლის ფუნქციაზე დამოკიდებული კორექცია — ${k.drug.generic_name}`,
          detail: k.drug.hepatic_adjustment,
          drugs: [k.drug.generic_name],
          action: 'დოზის გადახედვა ან ალტერნატივა',
          sources: k.drug.sources,
        });
      });
  }

  // 5. Cumulative burdens
  const burdens = { anticholinergic: 0, sedative: 0, bleeding: 0, qt: 0, serotonergic: 0, fallRisk: 0 };
  known.forEach((k) => {
    burdens.anticholinergic += k.drug.properties.anticholinergic;
    burdens.sedative += k.drug.properties.sedative;
    burdens.bleeding += k.drug.properties.bleeding;
    burdens.qt += k.drug.properties.qt;
    burdens.serotonergic += k.drug.properties.serotonergic;
    burdens.fallRisk += k.drug.properties.fallRisk;
  });

  const burdenRules: { key: keyof typeof burdens; cat: MedicationFinding['category']; titleKa: string; threshold: number; detail: string; action: string }[] = [
    {
      key: 'anticholinergic',
      cat: 'anticholinergic',
      titleKa: 'ანტიქოლინერგული ტვირთი',
      threshold: 3,
      detail: 'კუმულაციური ანტიქოლინერგული ეფექტი ასოცირდება კოგნიტურ დაქვეითებასთან, დელირიუმთან, შარდის შეკავებასთან და დაცემასთან, განსაკუთრებით ხანდაზმულებში.',
      action: 'შეამცირეთ ან შეცვალეთ ყველაზე მაღალი ანტიქოლინერგული აქტივობის პრეპარატი',
    },
    {
      key: 'sedative',
      cat: 'sedation',
      titleKa: 'სედაციური ტვირთი',
      threshold: 3,
      detail: 'რამდენიმე ცნს-დამთრგუნველი პრეპარატის კომბინაცია ზრდის დაცემის, რესპირაციული დათრგუნვისა და კოგნიტური დარღვევის რისკს.',
      action: 'გადახედეთ ბენზოდიაზეპინის/ოპიოიდის/სედაციური ანტიდეპრესანტის აუცილებლობას',
    },
    {
      key: 'bleeding',
      cat: 'bleeding',
      titleKa: 'სისხლდენის კუმულაციური რისკი',
      threshold: 4,
      detail: 'ანტიკოაგულანტის, ანტითრომბოციტულის, NSAID-ისა და SSRI-ს კომბინაციები ადიტიურად ზრდიან სისხლდენის რისკს.',
      action: 'გადახედეთ თითოეული კომპონენტის აუცილებლობას; განიხილეთ გასტროპროტექცია',
    },
    { key: 'qt', cat: 'qt', titleKa: 'QT-ის გახანგრძლივების რისკი', threshold: 3, detail: 'რამდენიმე QT-გამახანგრძლივებელი პრეპარატის კომბინაცია ზრდის torsades de pointes-ის რისკს, განსაკუთრებით ელექტროლიტური დარღვევების ფონზე.', action: 'ეკგ და QTc-ის შეფასება; კალიუმისა და მაგნიუმის კორექცია' },
    { key: 'serotonergic', cat: 'serotonergic', titleKa: 'სეროტონინერგული ტვირთი', threshold: 4, detail: 'რამდენიმე სეროტონინერგული პრეპარატი ზრდის სეროტონინული სინდრომის რისკს.', action: 'კომბინაციის გადახედვა და პაციენტის ინფორმირება ადრეულ სიმპტომებზე' },
  ];

  burdenRules.forEach((r) => {
    if (burdens[r.key] >= r.threshold) {
      const contributors = known.filter((k) => (k.drug.properties as Record<string, number>)[r.key] > 0).map((k) => k.drug.generic_name);
      findings.push({
        id: uid('BUR', idx++),
        category: r.cat,
        severity: burdens[r.key] >= r.threshold + 2 ? 'high' : 'moderate',
        titleKa: `${r.titleKa} — ჯამური ქულა ${burdens[r.key]}`,
        detail: `${r.detail} მონაწილე პრეპარატები: ${contributors.join(', ')}.`,
        drugs: contributors,
        action: r.action,
        sources: ['SRC-BEERS-2023'],
      });
      sourceIds.add('SRC-BEERS-2023');
    }
  });

  // 6. Drug–disease interactions
  const problems = patient.problems.map((p) => p.toLowerCase()).join(' ');
  const diseaseRules: { drugId: string; match: RegExp; titleKa: string; detail: string; severity: MedicationFinding['severity']; action: string }[] = [
    { drugId: 'ibuprofen', match: /თირკმ|ckd|უკმარისობ/, titleKa: 'NSAID თირკმლის დაავადების ფონზე', detail: 'NSAID ამცირებს თირკმლის პერფუზიას და შეიძლება დააჩქაროს ფუნქციის დაქვეითება; შარდმდენთან და RAAS-ბლოკატორთან ერთად ქმნის „triple whammy“ კომბინაციას.', severity: 'high', action: 'შეწყვიტეთ NSAID; განიხილეთ ალტერნატიული ანალგეზია', },
    { drugId: 'ibuprofen', match: /გულის უკმარისობ|heart failure/, titleKa: 'NSAID გულის უკმარისობის ფონზე', detail: 'NSAID იწვევს ნატრიუმის შეკავებას და ამძიმებს გულის უკმარისობას.', severity: 'high', action: 'შეწყვეტა' },
    { drugId: 'diazepam', match: /დაცემ|fall|კოგნიტ|დემენცი/, titleKa: 'ბენზოდიაზეპინი დაცემის/კოგნიტური რისკის ფონზე', detail: 'ბენზოდიაზეპინები ხანდაზმულებში ზრდიან დაცემის, მოტეხილობისა და დელირიუმის რისკს (Beers).', severity: 'high', action: 'ეტაპობრივი შემცირება და არაფარმაკოლოგიური ალტერნატივა' },
    { drugId: 'amitriptyline', match: /დაცემ|fall|კოგნიტ|დემენცი|გლაუკომ|პროსტატ/, titleKa: 'ტრიციკლური ანტიდეპრესანტი მაღალი რისკის ფონზე', detail: 'ანტიქოლინერგული ეფექტი ამძიმებს კოგნიტურ ფუნქციას, ზრდის შარდის შეკავებას და დაცემას.', severity: 'high', action: 'გადახედეთ ჩვენებას; განიხილეთ ალტერნატივა' },
    { drugId: 'metformin', match: /თირკმ|ckd/, titleKa: 'მეტფორმინი თირკმლის დაავადების ფონზე', detail: 'eGFR-ის მიხედვით საჭიროა დოზის კორექცია ან შეწყვეტა (eGFR <30 — უკუნაჩვენებია).', severity: 'high', action: 'eGFR-ის შემოწმება და დოზის გადახედვა' },
  ];
  diseaseRules.forEach((r) => {
    const k = known.find((x) => x.drug.id === r.drugId);
    if (k && r.match.test(problems)) {
      findings.push({
        id: uid('DIS', idx++),
        category: 'drug_disease',
        severity: r.severity,
        titleKa: r.titleKa,
        detail: r.detail,
        drugs: [k.drug.generic_name],
        action: r.action,
        sources: k.drug.sources,
      });
      k.drug.sources.forEach((s) => sourceIds.add(s));
    }
  });

  // 7. Missing indication
  known.forEach((k) => {
    const ind = k.raw.indication.trim();
    if (!ind || /ბუნდოვან|unclear|უცნობ/.test(ind.toLowerCase())) {
      findings.push({
        id: uid('IND', idx++),
        category: 'missing_indication',
        severity: 'moderate',
        titleKa: `ჩვენება არ არის დოკუმენტირებული — ${k.drug.generic_name}`,
        detail: 'დანიშნულება ჩვენების მითითების გარეშე დოკუმენტაციური ხარვეზია და დეპრესკრაიბინგის შეფასების საწყისი წერტილია.',
        drugs: [k.drug.generic_name],
        action: 'დააზუსტეთ ორიგინალური ჩვენება და შეაფასეთ მისი აქტუალობა',
        sources: ['SRC-STOPPSTART-V3'],
      });
      sourceIds.add('SRC-STOPPSTART-V3');
    }
  });

  // 8. Prescribing cascade heuristic
  if (ids.includes('amitriptyline') && ids.includes('omeprazole')) {
    findings.push({
      id: uid('CAS', idx++),
      category: 'cascade',
      severity: 'moderate',
      titleKa: 'შესაძლო დანიშნულებათა კასკადი',
      detail: 'ანტიქოლინერგული საშუალების გვერდითი ეფექტი (დისპეფსია, ყაბზობა) შეიძლება მკურნალობდეს ახალი პრეპარატით ნაცვლად პირველადი დანიშნულების გადახედვისა.',
      drugs: ['Amitriptyline', 'Omeprazole'],
      action: 'შეამოწმეთ ქრონოლოგია: რომელი დაინიშნა ჯერ და რატომ',
      sources: ['SRC-STOPPSTART-V3'],
    });
  }

  // 9. Deprescribing candidates
  const deprescribing: DeprescribingItem[] = known
    .filter((k) => ['diazepam', 'amitriptyline', 'omeprazole', 'ibuprofen', 'tramadol', 'digoxin'].includes(k.drug.id))
    .map((k) => {
      const d = k.drug;
      return {
        drug: d.generic_name,
        originalIndication: k.raw.indication || 'დოკუმენტირებული არ არის',
        stillIndicated: k.raw.indication ? 'unclear' : 'likely_no',
        potentialBenefit:
          d.id === 'omeprazole'
            ? 'სარგებელი შენარჩუნებულია მხოლოდ აქტიური ჩვენების არსებობისას (ეროზიული ეზოფაგიტი, ბარეტი, მაღალი რისკის გასტროპროტექცია).'
            : d.id === 'digoxin'
              ? 'სიმპტომური სარგებელი შესაძლოა შენარჩუნებული იყოს; პროგნოზული სარგებელი შეზღუდულია.'
              : 'ხანგრძლივი გამოყენებისას სარგებელი ხშირად მცირდება, ხოლო რისკი მატულობს.',
        currentRisk: d.warnings[0] ?? d.adverse_effects.slice(0, 2).join(', '),
        withdrawalRisk: d.withdrawal || 'მნიშვნელოვანი მოხსნის ფენომენი მოსალოდნელი არ არის.',
        taperNeeded: Boolean(d.taper && !/არ ესაჭიროება/.test(d.taper)),
        taperConcept: d.taper || 'ტიტრაცია არ ესაჭიროება',
        monitoring: d.monitoring.slice(0, 3).join('; '),
        restartCriteria:
          d.id === 'omeprazole'
            ? 'სიმპტომების რეციდივი შემცირებიდან 2–4 კვირაში ან ენდოსკოპიური ჩვენების დადასტურება'
            : 'საწყისი სიმპტომის კლინიკურად მნიშვნელოვანი დაბრუნება ან მდგომარეობის გაუარესება',
      };
    });

  const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 } as const;
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);

  return { resolved, unresolved, findings, burdens, crcl, deprescribing, sourceIds: [...sourceIds] };
}
