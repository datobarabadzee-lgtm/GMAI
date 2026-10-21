/**
 * AGE RESTRICTIONS — children and adolescents.
 *
 * „რექსეტინი 11 წლის ბავშვს" must not pass silently. These are regulator-level
 * restrictions (EMA/SmPC, FDA, MHRA), not dosing advice: each rule says WHO
 * should not receive the agent and WHY, and points to the regulator. Doses for
 * children are deliberately absent — they belong to a paediatrician.
 *
 * Pending clinical review (see the review doc). Ages are in years; an infant is
 * age 0 and is covered by any "under 1 / under 2" rule.
 */

export type AgeLevel = 'contraindicated' | 'avoid' | 'restricted' | 'not_established';

export const AGE_LEVEL_KA: Record<AgeLevel, string> = {
  contraindicated: 'უკუნაჩვენებია ამ ასაკში',
  avoid: 'ამ ასაკში არ უნდა დაინიშნოს',
  restricted: 'ამ ასაკში მხოლოდ შეზღუდული ჩვენებით, ექიმის დანიშნულებით',
  not_established: 'ამ ასაკში უსაფრთხოება და ეფექტიანობა დადგენილი არ არის',
};

export type AgeRule = {
  id: string;
  inns: string[];
  /** The rule applies when age < underYears. */
  underYears: number;
  level: AgeLevel;
  textKa: string;
  sourceKa: string;
};

const SSRI_SUICIDALITY =
  'ანტიდეპრესანტები 18 წლამდე ზრდის სუიციდური აზრებისა და ქცევის რისკს (FDA-ს ჩარჩოში ჩასმული გაფრთხილება, EMA). ';

export const AGE_RULES: AgeRule[] = [
  {
    id: 'paroxetine-u18',
    inns: ['paroxetine'],
    underYears: 18,
    level: 'avoid',
    textKa: `პაროქსეტინი (რექსეტინი, პაქსილი) 18 წლამდე ბავშვებსა და მოზარდებში არ გამოიყენება: კვლევებში ეფექტი დეპრესიაზე არ დადასტურდა, ხოლო სუიციდური ქცევისა და მტრული ქცევის შემთხვევები უფრო ხშირი იყო. ${SSRI_SUICIDALITY}`,
    sourceKa: 'EMA / პაროქსეტინის SmPC, პუნქტი 4.4; FDA boxed warning',
  },
  {
    id: 'ssri-u18',
    inns: ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'fluvoxamine'],
    underYears: 18,
    level: 'restricted',
    textKa: `${SSRI_SUICIDALITY}ბავშვებში ნებადართულია მხოლოდ კონკრეტული პრეპარატები კონკრეტული ჩვენებით (მაგ. ფლუოქსეტინი — დეპრესია 8 წლიდან, სერტრალინი — აკვიატებულ-კომპულსიური აშლილობა 6 წლიდან), ბავშვთა ფსიქიატრის დანიშნულებით და მჭიდრო მეთვალყურეობით.`,
    sourceKa: 'EMA / შესაბამისი SmPC-ები; FDA boxed warning',
  },
  {
    id: 'snri-u18',
    inns: ['venlafaxine', 'mirtazapine', 'trazodone', 'agomelatine', 'vortioxetine'],
    underYears: 18,
    level: 'avoid',
    textKa: `${SSRI_SUICIDALITY}ამ პრეპარატის გამოყენება 18 წლამდე ევროპის ინსტრუქციით რეკომენდებული არ არის.`,
    sourceKa: 'EMA / შესაბამისი SmPC-ები, პუნქტი 4.2–4.4',
  },
  {
    id: 'duloxetine-u18',
    inns: ['duloxetine'],
    underYears: 18,
    level: 'restricted',
    textKa: `${SSRI_SUICIDALITY}ევროპაში დულოქსეტინი 18 წლამდე ნაჩვენები არ არის; აშშ-ში დაშვებულია მხოლოდ გენერალიზებული შფოთვა 7 წლიდან და ფიბრომიალგია 13 წლიდან — ბავშვთა ფსიქიატრის/სპეციალისტის დანიშნულებით. დეპრესიის სამკურნალოდ ბავშვებში ეფექტი არ დადასტურდა.`,
    sourceKa: 'EMA / Cymbalta SmPC 4.2; FDA ეტიკეტი (Pediatric Use)',
  },
  {
    id: 'tca-u18',
    inns: ['amitriptyline', 'clomipramine', 'imipramine'],
    underYears: 18,
    level: 'restricted',
    textKa: `${SSRI_SUICIDALITY}დეპრესიის სამკურნალოდ 18 წლამდე რეკომენდებული არ არის; ზოგ სხვა ჩვენებაზე იყენებს მხოლოდ სპეციალისტი. დოზის გადაჭარბება ბავშვისთვის განსაკუთრებით სახიფათოა (გულის რიტმი).`,
    sourceKa: 'შესაბამისი SmPC-ები; FDA boxed warning',
  },
  {
    id: 'metoclopramide-u1',
    inns: ['metoclopramide'],
    underYears: 1,
    level: 'contraindicated',
    textKa: 'მეტოკლოპრამიდი (ცერუკალი) 1 წლამდე უკუნაჩვენებია — მოძრაობის მძიმე დარღვევის (ექსტრაპირამიდული რეაქციები) და მეტჰემოგლობინემიის რისკის გამო.',
    sourceKa: 'EMA, 2013 (მეტოკლოპრამიდის გადახედვა); SmPC 4.3',
  },
  {
    id: 'metoclopramide-u18',
    inns: ['metoclopramide'],
    underYears: 18,
    level: 'restricted',
    textKa: 'მეტოკლოპრამიდი (ცერუკალი) 1–18 წლამდე მხოლოდ მეორე რიგის საშუალებაა, ორი ჩვენებით (ქიმიოთერაპიის შემდგომი დაგვიანებული ღებინება, ოპერაციის შემდგომი ღებინება), წონაზე გათვლილი დოზით და მაქსიმუმ 5 დღე. ბავშვებში უნებლიე მოძრაობები (კისრის, თვალების, ენის სპაზმი) უფრო ხშირია. ჩვეულებრივი გულისრევის/ღებინების დროს ბავშვს არ ეძლევა.',
    sourceKa: 'EMA, 2013; SmPC 4.2, 4.4',
  },
  {
    id: 'domperidone-u12',
    inns: ['domperidone'],
    underYears: 12,
    level: 'avoid',
    textKa: 'დომპერიდონი (მოტილიუმი) 12 წლამდე და 35 კგ-ზე ნაკლები წონის ბავშვებში აღარ გამოიყენება — კვლევაში ეფექტი არ დადასტურდა; პრეპარატს აქვს გულის რიტმის დარღვევის რისკი.',
    sourceKa: 'EMA / CMDh, 2019',
  },
  {
    id: 'aspirin-u16',
    inns: ['aspirin', 'acetylsalicylic acid', 'bismuth subsalicylate'],
    underYears: 16,
    level: 'avoid',
    textKa: 'ასპირინი (აცეტილსალიცილის მჟავა) და სალიცილატები 16 წლამდე არ ეძლევა — რეის სინდრომის (ღვიძლისა და თავის ტვინის მძიმე დაზიანება) რისკი, განსაკუთრებით ვირუსული ინფექციის დროს. გამონაკლისი მხოლოდ სპეციალისტის დანიშნულებაა (მაგ. კავასაკის დაავადება).',
    sourceKa: 'MHRA / BNFc; FDA',
  },
  {
    id: 'codeine-u12',
    inns: ['codeine'],
    underYears: 12,
    level: 'contraindicated',
    textKa: 'კოდეინი 12 წლამდე უკუნაჩვენებია (ტკივილი და ხველა) — ზოგ ბავშვში სწრაფად გარდაიქმნება მორფინად და იწვევს სუნთქვის სახიფათო დათრგუნვას. 12–18 წლამდე არ გამოიყენება ნუშისებრი ჯირკვლის/ადენოიდის ოპერაციის შემდეგ და სუნთქვის პრობლემის დროს.',
    sourceKa: 'EMA, 2013/2015; FDA, 2017',
  },
  {
    id: 'tramadol-u12',
    inns: ['tramadol'],
    underYears: 12,
    level: 'contraindicated',
    textKa: 'ტრამადოლი 12 წლამდე არ გამოიყენება — სუნთქვის დათრგუნვის რისკი; 18 წლამდე არ გამოიყენება ნუშისებრი ჯირკვლის/ადენოიდის ოპერაციის შემდეგ.',
    sourceKa: 'FDA, 2017; SmPC',
  },
  {
    id: 'nimesulide-u12',
    inns: ['nimesulide'],
    underYears: 12,
    level: 'contraindicated',
    textKa: 'ნიმესულიდი (ნაიზი, ნიმესილი) 12 წლამდე უკუნაჩვენებია — ღვიძლის მძიმე დაზიანების რისკი.',
    sourceKa: 'EMA, 2012; SmPC 4.3',
  },
  {
    id: 'ketorolac-u16',
    inns: ['ketorolac'],
    underYears: 16,
    level: 'avoid',
    textKa: 'კეტოროლაკი (კეტოროლი) 16 წლამდე რეკომენდებული არ არის — სისხლდენისა და თირკმლის დაზიანების რისკი.',
    sourceKa: 'SmPC 4.2–4.3',
  },
  {
    id: 'metamizole-u3m',
    inns: ['metamizole'],
    underYears: 0.25,
    level: 'contraindicated',
    textKa: 'მეტამიზოლი (ანალგინი) 3 თვემდე ან 5 კგ-ზე ნაკლები წონის ჩვილს არ ეძლევა. ნებისმიერ ასაკში შესაძლოა გამოიწვიოს აგრანულოციტოზი (სისხლის თეთრი უჯრედების კრიტიკული დაქვეითება).',
    sourceKa: 'EMA, 2018; SmPC 4.2–4.4',
  },
  {
    id: 'fluoroquinolone-u18',
    inns: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin'],
    underYears: 18,
    level: 'restricted',
    textKa: 'ფტორქინოლონები (ციპროფლოქსაცინი, ლევოფლოქსაცინი და სხვ.) 18 წლამდე რუტინულად არ ინიშნება — სახსრებისა და მყესების დაზიანების რისკი. გამოიყენება მხოლოდ კონკრეტულ მძიმე შემთხვევებში, როცა სხვა ანტიბიოტიკი არ გამოდგება (მოქსიფლოქსაცინი 18 წლამდე უკუნაჩვენებია).',
    sourceKa: 'EMA, 2018–2019; SmPC',
  },
  {
    id: 'tetracycline-u8',
    inns: ['doxycycline', 'tetracycline', 'minocycline'],
    underYears: 8,
    level: 'avoid',
    textKa: 'ტეტრაციკლინები (დოქსიციკლინი და სხვ.) 8 წლამდე არ ინიშნება — კბილების მუდმივი შეფერილობა და მინანქრის დაზიანება. გამონაკლისია სიცოცხლისთვის საშიში ინფექცია, სპეციალისტის გადაწყვეტილებით.',
    sourceKa: 'SmPC 4.3–4.4; AAP Red Book',
  },
  {
    id: 'promethazine-u2',
    inns: ['promethazine'],
    underYears: 2,
    level: 'contraindicated',
    textKa: 'პრომეთაზინი (პიპოლფენი, დიპრაზინი) 2 წლამდე უკუნაჩვენებია — სუნთქვის ფატალური დათრგუნვის შემთხვევები.',
    sourceKa: 'FDA boxed warning; SmPC',
  },
  {
    id: 'loperamide-u2',
    inns: ['loperamide'],
    underYears: 2,
    level: 'contraindicated',
    textKa: 'ლოპერამიდი (იმოდიუმი) 2 წლამდე უკუნაჩვენებია — ნაწლავის დამბლა და გულის რიტმის დარღვევა. 2–12 წლამდე მხოლოდ ექიმის დანიშნულებით; ბავშვის დიარეის დროს მთავარია სითხის აღდგენა (ORS).',
    sourceKa: 'FDA; SmPC 4.3',
  },
  {
    id: 'cough-cold-u6',
    inns: ['dextromethorphan', 'diphenhydramine', 'chlorphenamine', 'chlorpheniramine', 'pseudoephedrine', 'phenylephrine', 'oxymetazoline', 'xylometazoline'],
    underYears: 6,
    level: 'avoid',
    textKa: 'ხველისა და გაციების უნებართვო (OTC) საშუალებები ამ ნივთიერებით 6 წლამდე არ ეძლევა — სარგებელი არ დადასტურდა, ხოლო გვერდითი მოვლენები (აგზნება, ძილიანობა, გულის რიტმი, ზედოზირება) ჩვილებში სახიფათოა. ცხვირის წვეთებისთვის არსებობს ბავშვის ასაკისთვის განკუთვნილი დაბალი კონცენტრაცია — გადაამოწმეთ შეფუთვაზე.',
    sourceKa: 'MHRA, 2009; FDA',
  },
  {
    id: 'glp1-tirzepatide',
    inns: ['tirzepatide'],
    underYears: 18,
    level: 'not_established',
    textKa: 'ტირზეპატიდის (მუნჯარო) უსაფრთხოება და ეფექტიანობა 18 წლამდე დადგენილი არ არის — ბავშვსა და მოზარდს არ ინიშნება.',
    sourceKa: 'EMA / Mounjaro SmPC, 4.2',
  },
  {
    id: 'glp1-semaglutide',
    inns: ['semaglutide'],
    underYears: 12,
    level: 'not_established',
    textKa: 'სემაგლუტიდი 12 წლამდე არ გამოიყენება. 12–18 წლამდე ნებადართულია მხოლოდ სიმსუქნის სამკურნალო ფორმა (Wegovy), ენდოკრინოლოგის დანიშნულებით; Ozempic (დიაბეტი) 18 წლამდე დადგენილი არ არის.',
    sourceKa: 'EMA / Wegovy, Ozempic SmPC',
  },
  {
    id: 'glp1-semaglutide-teen',
    inns: ['semaglutide'],
    underYears: 18,
    level: 'restricted',
    textKa: '12–18 წლამდე სემაგლუტიდი მხოლოდ სიმსუქნის ფორმით (Wegovy) და ენდოკრინოლოგის მეთვალყურეობით; დიაბეტის ფორმა (Ozempic) ამ ასაკისთვის დადგენილი არ არის.',
    sourceKa: 'EMA / Wegovy, Ozempic SmPC',
  },
  {
    id: 'pregabalin-u18',
    inns: ['pregabalin'],
    underYears: 18,
    level: 'not_established',
    textKa: 'პრეგაბალინის (ლირიკა) უსაფრთხოება და ეფექტიანობა 18 წლამდე დადგენილი არ არის.',
    sourceKa: 'EMA / Lyrica SmPC, 4.2',
  },
  {
    id: 'zolpidem-u18',
    inns: ['zolpidem', 'zopiclone'],
    underYears: 18,
    level: 'avoid',
    textKa: 'საძილე საშუალებები (ზოლპიდემი, ზოპიკლონი) 18 წლამდე არ ინიშნება — ეფექტი ბავშვებში არ დადასტურდა, გვერდითი მოვლენები (თავბრუსხვევა, ჰალუცინაცია) ხშირია.',
    sourceKa: 'SmPC 4.2; FDA',
  },
];

export type AgeWarning = {
  ruleId: string;
  inn: string;
  level: AgeLevel;
  levelKa: string;
  textKa: string;
  sourceKa: string;
  ageKa: string;
};

export type AgeBand = { lo: number; hi: number; ageKa: string };

/** Intake buttons → an age band. The band's lowest age is checked (conservative). */
export const AGE_BANDS: Record<string, AgeBand> = {
  u1: { lo: 0, hi: 1, ageKa: '1 წლამდე' },
  '1-5': { lo: 1, hi: 6, ageKa: '1–5 წლის' },
  '6-11': { lo: 6, hi: 12, ageKa: '6–11 წლის' },
  '12-17': { lo: 12, hi: 18, ageKa: '12–17 წლის' },
  child: { lo: 0, hi: 18, ageKa: '18 წლამდე' },
};

const underKa = (y: number) => (y < 1 ? `${Math.round(y * 12)} თვემდე` : `${y} წლამდე`);

/** Applicable rules for one INN at a given age; the strictest age band first. */
export function ageWarningsFor(inn: string, ageYears: number | null | undefined, label?: string, band?: AgeBand): AgeWarning[] {
  if (ageYears === null || ageYears === undefined || !Number.isFinite(ageYears)) return [];
  const parts = inn.toLowerCase().split(/\s*[/+]\s*/);
  const hits = AGE_RULES.filter((r) => ageYears < r.underYears && r.inns.some((x) => parts.includes(x)));
  // When two bands match (metoclopramide <1 and <18), the narrower band is the
  // one that describes this child.
  hits.sort((a, b) => a.underYears - b.underYears);
  const SEVERITY: Record<AgeLevel, number> = { contraindicated: 0, avoid: 1, restricted: 2, not_established: 3 };
  const seen = new Set<string>();
  return hits
    .filter((r) => {
      const key = r.inns.join();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => {
      // The rule's cut-off falls inside the band: it applies only to part of it.
      const partial = band && r.underYears > band.lo && r.underYears < band.hi;
      return {
        ruleId: r.id,
        inn: label ?? inn,
        level: r.level,
        levelKa: partial ? `${underKa(r.underYears)} — ${AGE_LEVEL_KA[r.level]} (დააზუსტეთ ზუსტი ასაკი)` : AGE_LEVEL_KA[r.level],
        textKa: r.textKa,
        sourceKa: r.sourceKa,
        ageKa: band ? band.ageKa : ageYears < 1 ? '1 წლამდე' : Number.isInteger(ageYears) ? `${ageYears} წლის` : underKa(Math.ceil(ageYears)),
      };
    })
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);
}

/**
 * Age stated in free text: „11 წლის", „6 თვის", "age 11", "11 y". Returns years
 * (fractional for months) or null. Only a number explicitly tied to an age
 * unit is read — a dose („11 მგ") never becomes an age.
 */
export function parseAgeYears(text: string): number | null {
  const t = text.toLowerCase();
  const months = t.match(/(\d{1,2})\s*(?:თვის|თვე|თვეს|month|months|mo)(?![ა-ჰa-z])/);
  if (months) return Number(months[1]) / 12;
  // „12 წლამდე" means under 12 — read as just below it, so a <12 rule applies.
  // A range („6–11 წელი") is read by its lower end — the stricter check.
  const range = t.match(/(\d{1,2})\s*[–-]\s*\d{1,2}\s*(?:წლის|წელი|წ\.)/);
  if (range) return Number(range[1]);
  const under = t.match(/(\d{1,2})\s*წლამდე/);
  if (under) return Math.max(0, Number(under[1]) - 0.5);
  const years = t.match(/(\d{1,3})\s*(?:წლის|წელი|წლით|წ\.|year|years|y\.?o\.?|yo)(?![ა-ჰa-z])/) ?? t.match(/(?:ასაკი|age)[:\s]*(\d{1,3})(?!\d)/);
  if (years) {
    const n = Number(years[1]);
    if (n <= 120) return n;
  }
  return null;
}

