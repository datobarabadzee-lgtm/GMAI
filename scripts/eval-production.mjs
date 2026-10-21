#!/usr/bin/env node
/**
 * PRODUCTION REGRESSION SUITE
 *
 *   node scripts/eval-production.mjs [baseUrl]
 *
 * Sends realistic, fully synthetic cases (no patient data) to the deployed
 * /api/orchestrate and checks each answer against what the deterministic
 * engines must produce. Paced under the per-IP limit (12/min). Exit code 1 if
 * any hard check fails. Writes eval-report.json next to the working directory.
 *
 * Hard checks (fail the run): agent status/content, dose rules, safety flags,
 * no fabricated rule IDs, no foreign script in the published bottom line.
 * Soft checks (reported only): model numbers verified, synthesis used.
 */

const BASE = process.argv[2] ?? 'https://gmai-public.vercel.app';
const CONSENT = { 'x-consent-version': '2026-10-17.1' };
const FOREIGN = /[԰-֏Ѐ-ӿͰ-Ͽ֐-׿؀-ۿ一-鿿぀-ヿ가-힯]/;
const PACE_MS = 5500;

const med = (drug, dose = '', frequency = '') => ({ id: drug, drug, dose, frequency, route: '', indication: '', startDate: '', status: 'active' });
const lab = (analyte, value, unit = '') => ({ id: analyte, analyte, value, unit, date: '' });

const agent = (d, id) => d.agentResults?.find((a) => a.agentId === id);
const text = (a) => (a ? [a.summary, a.note, ...a.sections.flatMap((s) => [s.titleKa, s.body, ...s.bullets])].join('\n') : '');
const ok = (d, id) => agent(d, id)?.status === 'ok';

/** Each case: name, body, headers?, expectStatus?, checks: [label, (d) => boolean] */
const CASES = [
  { name: 'consent required in patient mode', body: { question: 'ჰემოგლობინი 9.1 — რას ნიშნავს?', mode: 'patient' }, noConsent: true, expectStatus: 451, checks: [] },

  { name: 'A16 patient: AF, cerebrolysin, Hb in prose', headers: CONSENT, body: { question: 'მაქვს წინაგულების ფიბრილაცია, ვიღებ ცერებროლიზინს და ვარფარინს. ჰემოგლობინი 9.1', mode: 'patient' },
    checks: [['A16 ok', (d) => ok(d, 'A16')], ['explains AF', (d) => /გულის რიტმის დარღვევა/.test(text(agent(d, 'A16')))], ['Hb low', (d) => /ჰემოგლობინი: 9\.1.*ნორმაზე დაბალია/.test(text(agent(d, 'A16')))], ['unproven med flagged', (d) => /ცერებროლიზინ/.test(text(agent(d, 'A16'))) && /ნუ შეწყვეტთ/.test(text(agent(d, 'A16')))], ['bleeding red flag', (d) => /შავი (\(ფისისებრი\) )?განავალი/.test(text(agent(d, 'A16')))]] },
  { name: 'A16 patient: nothing recognised → no invented glossary', headers: CONSENT, body: { question: 'როგორ ვიგრძნო თავი უკეთ?', mode: 'patient' },
    checks: [['no glossary section', (d) => !agent(d, 'A16')?.sections.some((s) => s.titleKa === 'რას ნიშნავს ეს')]] },

  { name: 'A07 patient: Rexetin for 11-year-old → age warning first', headers: CONSENT, body: { question: 'რექსეტინი 11 წლის ბავშვს შეიძლება?', mode: 'patient' },
    checks: [['A07 ok', (d) => ok(d, 'A07')], ['age gate', (d) => (agent(d, 'A07')?.data?.ageWarnings ?? []).some((w) => w.ruleId === 'paroxetine-u18')], ['bottom line leads with it', (d) => /რექსეტინ|პაროქსეტინ|paroxetine/i.test(d.answer.bottomLine.slice(0, 220))], ['not an emergency', (d) => !d.answer.emergency]] },
  { name: 'A07 brand ცერუკალი, child 1–5 band → restricted', headers: CONSENT, body: { question: 'ცერუკალი შეიძლება?', mode: 'patient', extras: { intake: { answers: { age: '1-5' } } } },
    checks: [['metoclopramide', (d) => (agent(d, 'A07')?.data?.ageWarnings ?? []).some((w) => w.ruleId === 'metoclopramide-u18')]] },
  { name: 'A07 typo მუხჯარო → no substitution, product selection required', body: { question: 'მუხჯარო რა არის?', mode: 'quick' },
    checks: [['no tirzepatide label', (d) => !/tirzepatide/i.test(JSON.stringify(agent(d, 'A07')?.data ?? {}))], ['no confirmed product', (d) => !agent(d, 'A07')?.data?.confirmedProduct]] },
  { name: 'A07 კოლომიცინი → never colchicine', body: { question: 'კოლომიცინი რა დოზით ინიშნება?', mode: 'quick' },
    checks: [['no colchicine', (d) => !/colchicine|კოლხიცინ/i.test(JSON.stringify(agent(d, 'A07') ?? {}) + d.answer.bottomLine)], ['identity required', (d) => (agent(d, 'A07')?.data?.identityRequired ?? []).length > 0]] },
  { name: 'A07 Colobreathe (EU-only name) → product selection, not "not found", never colchicine', body: { question: 'Colobreathe რა დოზით ინიშნება?', mode: 'quick' },
    checks: [['not unknown', (d) => (agent(d, 'A07')?.data?.identityRequired ?? []).some((m) => m.kind !== 'unknown')], ['no not-found prefix', (d) => !/ზუსტი დასახელებით ვერ მოიძებნა — მის შესახებ/.test(d.answer.bottomLine)], ['no colchicine', (d) => !/colchicine|კოლხიცინ/i.test(d.answer.bottomLine)], ['no confirmed product', (d) => !agent(d, 'A07')?.data?.confirmedProduct]] },
  { name: 'A07 apixaban 81y/58kg/Cr1.6 → 2.5 mg BID', body: { question: 'რა დოზით დავნიშნო აპიქსაბანი?', mode: 'quick', patient: { age: 81, weightKg: 58, creatinineMgDl: 1.6, problems: ['წინაგულების ფიბრილაცია'] } },
    checks: [['A07 dose', (d) => /2\.5 მგ ორჯერ დღეში/.test(text(agent(d, 'A07')))], ['3/3', (d) => /3\/3/.test(text(agent(d, 'A07')))], ['no false "no adjustment"', (d) => !/კორექციის საჭიროება ავტომატურ შემოწმებაში არ გამოვლინდა/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 apixaban 70y/80kg/Cr1.0 male → 5 mg BID', body: { question: 'აპიქსაბანის დოზა', mode: 'quick', patient: { age: 70, sex: 'male', weightKg: 80, creatinineMgDl: 1.0 }, extras: { drug: 'apixaban' } },
    checks: [['5 mg', (d) => /პაციენტის მონაცემებით \(AF\): 5 მგ ორჯერ დღეში/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 apixaban age only → not settled', body: { question: 'აპიქსაბანის დოზა', mode: 'quick', patient: { age: 84 }, extras: { drug: 'apixaban' } },
    checks: [['not settled', (d) => /დოზა ვერ დადგინდება|დამოკიდებულია უცნობ კრიტერიუმზე/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 rivaroxaban CrCl≈40 → 15 mg', body: { question: 'რივაროქსაბანის დოზა', mode: 'quick', patient: { age: 78, sex: 'male', weightKg: 70, creatinineMgDl: 1.5 }, extras: { drug: 'rivaroxaban' } },
    checks: [['15 mg', (d) => /15 მგ დღეში ერთხელ/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 cerebrolysin → low-value registry', body: { question: 'ცერებროლიზინი ინსულტის შემდეგ ეფექტურია?', mode: 'quick', extras: { drug: 'ცერებროლიზინი' } },
    checks: [['A07 ok', (d) => ok(d, 'A07')], ['not approved', (d) => /არ არის დამტკიცებული/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 uncurated drug → product selection, no name-matched label', body: { question: 'მეტოპროლოლის დოზირება', mode: 'quick', extras: { drug: 'metoprolol' } },
    checks: [['A07 ok', (d) => ok(d, 'A07')], ['no label without confirmation', (d) => !agent(d, 'A07')?.data?.label && !/openFDA ეტიკეტი/.test(text(agent(d, 'A07')))]] },
  { name: 'A07 dabigatran 82y → 110 mg BID (extended registry)', body: { question: 'დაბიგატრანის დოზა', mode: 'quick', patient: { age: 82, sex: 'male', weightKg: 70, creatinineMgDl: 1.1 }, extras: { drug: 'დაბიგატრანი' } },
    checks: [['110 mg', (d) => /110 მგ ორჯერ დღეში/.test(text(agent(d, 'A07')))]] },
  { name: 'A08 polypharmacy elderly', body: { question: 'გადახედე მედიკამენტებს, პოლიფარმაცია', mode: 'deep', patient: { age: 82, medications: [med('ამიტრიპტილინი'), med('დიაზეპამი'), med('ომეპრაზოლი'), med('ცერებროლიზინი'), med('ვარფარინი'), med('იბუპროფენი')] } },
    checks: [['A08 ok', (d) => ok(d, 'A08')], ['low-value or interaction found', (d) => /ცერებროლიზინ|ვარფარინ.*იბუპროფენ|იბუპროფენ.*ვარფარინ|NSAID/i.test(text(agent(d, 'A08')))]] },
  { name: 'A10 labs Na 124, K 6.2', body: { question: 'ანალიზების ინტერპრეტაცია', mode: 'deep', patient: { age: 70, labs: [lab('sodium', 124, 'mmol/L'), lab('potassium', 6.2, 'mmol/L')] } },
    checks: [['A10 ok', (d) => ok(d, 'A10')], ['critical potassium', (d) => /კალიუმი/.test(text(agent(d, 'A10')))]] },
  { name: 'A09 CHA2DS2-VASc', body: { question: 'გამოთვალე CHA2DS2-VASc', mode: 'quick', patient: { age: 76, sex: 'female', problems: ['არტერიული ჰიპერტენზია', 'შაქრიანი დიაბეტი', 'წინაგულების ფიბრილაცია'] } },
    checks: [['A09 ok', (d) => ok(d, 'A09')]] },
  { name: 'A06 guideline comparison', body: { question: 'რას ამბობს ESC და AHA გაიდლაინი ანტიკოაგულაციაზე წინაგულების ფიბრილაციისას?', mode: 'evidence' },
    checks: [['A06 ok', (d) => ok(d, 'A06')]] },
  { name: 'A02/A03 deep TIA case', body: { question: '68 წლის მამაკაცს 40 წუთით ჰქონდა მარჯვენა კიდურების სისუსტე და დიზართრია, გაიარა. რა გამოგვრჩა?', mode: 'deep', patient: { age: 68, sex: 'male', problems: ['არტერიული ჰიპერტენზია'] } },
    checks: [['A02 ok', (d) => ok(d, 'A02')], ['A03 ok', (d) => ok(d, 'A03')], ['emergency flagged', (d) => d.answer.emergency === true]] },
  { name: 'A04 challenge plan', body: { question: 'შეამოწმე ჩემი გეგმა', mode: 'challenge', plan: 'დავიწყოთ ასპირინი და კლოპიდოგრელი 21 დღით, შემდეგ სტატინი.', patient: { age: 66, problems: ['მცირე იშემიური ინსულტი'] } },
    checks: [['A04 ok', (d) => ok(d, 'A04')]] },
  { name: 'A05 evidence AF anticoagulation CKD', body: { question: 'წინაგულების ფიბრილაცია ანტიკოაგულაცია თირკმლის უკმარისობა', mode: 'evidence' },
    checks: [['A05 ok', (d) => ok(d, 'A05')], ['registry ESC 2024', (d) => /2024 ESC/.test(text(agent(d, 'A05')))]] },

  { name: 'A11 CT: nodule + hedged PE + contrast at eGFR 25', body: { question: 'გაანალიზე კტ დასკვნა', mode: 'quick', patient: { age: 62, sex: 'male', egfr: 25 }, extras: { reportText: 'გულმკერდის კტ კონტრასტით.\nაღწერა: მარჯვენა ფილტვის ზედა წილში აღინიშნება მყარი კვანძი 7 მმ ზომის. პნევმოთორაქსი არ ვლინდება.\nფილტვის არტერიის თრომბოემბოლია არ გამოირიცხება სეგმენტურ დონეზე.\nდასკვნა: ფილტვის კვანძი 7 მმ. რეკომენდებულია განმეორებითი კტ ანგიოგრაფია.' } },
    checks: [['suspected critical', (d) => /კრიტიკული მიგნების ეჭვი/.test(agent(d, 'A11')?.summary ?? '')], ['Fleischner 6–8', (d) => /6–8 მმ — კტ 6–12 თვეში/.test(text(agent(d, 'A11')))], ['contrast warning', (d) => /eGFR 25/.test(text(agent(d, 'A11')))], ['pneumothorax negative', (d) => /ცალსახად უარყოფითი[\s\S]*პნევმოთორაქს/.test(text(agent(d, 'A11')))]] },
  { name: 'A11 CT head: subdural + midline shift', body: { question: 'კტ დასკვნა', mode: 'quick', extras: { reportText: 'თავის ტვინის კტ: მარცხენა ჰემისფეროში სუბდურული ჰემატომა 12 მმ, შუა ხაზის ცდომა 6 მმ.' } },
    checks: [['critical', (d) => /^კრიტიკული მიგნება:/.test(agent(d, 'A11')?.summary ?? '')]] },
  { name: 'A11 thyroid 12 mm at age 30 → US', body: { question: 'კისრის კტ დასკვნა', mode: 'quick', patient: { age: 30, sex: 'female' }, extras: { reportText: 'კისრის კტ: ფარისებრი ჯირკვლის მარჯვენა წილში კვანძი 12 მმ.' } },
    checks: [['US indicated', (d) => /≥ 10 მმ — ნაჩვენებია/.test(text(agent(d, 'A11')))]] },

  { name: 'A12 Form 100 pre-fill + ICD + gaps', body: { question: 'მომიმზადე ფორმა 100', mode: 'quick', plan: 'გაგრძელდეს აპიქსაბანი, კონტროლი 1 თვეში.', patient: { age: 78, sex: 'female', narrative: 'პაციენტი შემოვიდა გულის ფრიალის ჩივილით, ეკგ-ზე წინაგულების ფიბრილაცია.', problems: ['წინაგულების ფიბრილაცია'], medications: [med('აპიქსაბანი', '5 მგ', '')] } },
    checks: [['A12 ok', (d) => ok(d, 'A12')], ['ICD I48 suggested', (d) => /I48/.test(JSON.stringify(agent(d, 'A12')?.data ?? {}))], ['allergy gap', (d) => /ალერგიის სტატუსი/.test(text(agent(d, 'A12')))], ['frequency gap', (d) => /დოზა ან სიხშირე აკლია/.test(text(agent(d, 'A12')))], ['no case vignettes cited', (d) => !/QDR-\d+ · [^:]+: ქეისი:/.test(text(agent(d, 'A12')))], ['bottom line from A12', (d) => /ფორმა|შევსებულია|სექცი/.test(d.answer.bottomLine)]] },
  { name: 'A12 discharge with vague return criteria', body: { question: 'მომიმზადე ეპიკრიზი', mode: 'quick', plan: 'გაწერა სახლში, გაუარესებისას მომართოს.', patient: { age: 60, narrative: 'ჰოსპიტალიზებული იყო პნევმონიით.', problems: ['პნევმონია'] } },
    checks: [['vague criteria flagged', (d) => /„გაუარესებისას“ დაბრუნების კრიტერიუმად საკმარისი არ არის/.test(text(agent(d, 'A12')))]] },

  { name: 'A13/A14 quality: consent + delay', body: { question: 'ჩაატარე ხარისხის მიმოხილვა', mode: 'quality', patient: { narrative: 'ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია. დიაგნოზი დაგვიანდა 48 საათით.' }, extras: { caseNarrative: 'ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია. დიაგნოზი დაგვიანდა 48 საათით.' } },
    checks: [['A13 ok', (d) => ok(d, 'A13')], ['A14 ok', (d) => ok(d, 'A14')], ['consent class D07', (d) => /D07/.test(text(agent(d, 'A13')))], ['KB covered', (d) => d.kb.coverage === 'COVERED' && d.kb.hitCount > 0], ['IDs verified', (d) => d.verification.citations.checks.length > 0]] },
  { name: 'A14 defect: claim', body: { question: 'იყო თუ არა ეს სამედიცინო დეფექტი?', mode: 'quality', extras: { caseNarrative: 'პაციენტს ჰქონდა ცნობილი ალერგია პენიცილინზე, ჩანაწერში ასახული იყო, მაგრამ დაენიშნა ამოქსიცილინი და განვითარდა ანაფილაქსია.', claim: 'ალერგია იგნორირებული იყო' } },
    checks: [['A14 ok', (d) => ok(d, 'A14')]] },

  { name: 'A17 academy AF (curated unit, GP level)', body: { question: 'მასწავლე ანტიკოაგულაცია წინაგულების ფიბრილაციის დროს', mode: 'quick', academyLevel: 'gp', extras: { topic: 'ანტიკოაგულაცია წინაგულების ფიბრილაციის დროს' } },
    checks: [['A17 ok', (d) => ok(d, 'A17')], ['GP-level text', (d) => /ამბულატორიულ პრაქტიკაში/.test(text(agent(d, 'A17')))], ['quiz with answer', (d) => /პასუხი: [A-D]/.test(text(agent(d, 'A17')))]] },
  { name: 'A17 topic-only stroke teaching → not emergency', body: { question: 'მასწავლე ინსულტის მეორადი პრევენცია', mode: 'quick', academyLevel: 'specialist', extras: { topic: 'ინსულტის მეორადი პრევენცია' } },
    checks: [['not emergency', (d) => d.answer.emergency === false], ['live reviews', (d) => /სისტემური მიმოხილვა/.test(text(agent(d, 'A17')))]] },

  { name: 'A18 PICO deprescribing / falls', body: { question: 'ამცირებს თუ არა დეპრესკრაიბინგი დაცემებს ხანდაზმულებში', mode: 'evidence', extras: { researchQuestion: 'დეპრესკრაიბინგი და დაცემები', pico: { p: 'ხანდაზმული', i: 'ბენზოდიაზეპინი', o: 'დაცემა' } } },
    checks: [['A18 ok', (d) => ok(d, 'A18')], ['English OR strategy', (d) => /TITLE_ABS:"benzodiazepine/.test(text(agent(d, 'A18')))], ['≥50 records', (d) => Number((agent(d, 'A18')?.summary.match(/მოძიებულია (\d+)/) ?? [])[1] ?? 0) >= 50]] },
  { name: 'A18 untranslatable PICO element is dropped, not sent', body: { question: 'კვლევითი კითხვა', mode: 'evidence', extras: { researchQuestion: 'ტესტი', pico: { p: 'ხანდაზმული', i: 'ზზზზზზზ', o: 'დაცემა' } } },
    checks: [['dropped reported', (d) => /ძიებიდან ამოღებულია/.test(text(agent(d, 'A18')))], ['no Georgian in query', (d) => !/Europe PMC სტრიქონი:.*[ა-ჰ]/.test(text(agent(d, 'A18')))]] },

  { name: 'Patient: leeches for pain → no unrelated source (Cockcroft-Gault)', headers: CONSENT, body: { question: 'წურბელებით მკურნალობა ტკივილისთვის გამოსადეგია?', mode: 'patient' },
    checks: [['no Cockcroft', (d) => !(d.sources ?? []).some((s) => /cockcroft/i.test(s.citation_text))]] },
  { name: 'A15 Georgian context', body: { question: 'ფორმა 100 და ინფორმირებული თანხმობა საქართველოში', mode: 'quick' },
    checks: [['A15 ok', (d) => ok(d, 'A15')]] },
  { name: 'Emergency: chest pain', body: { question: 'პაციენტს აქვს ძლიერი გულმკერდის ტკივილი 30 წუთია და ოფლიანობა', mode: 'quick', patient: { age: 58, sex: 'male' } },
    checks: [['emergency', (d) => d.answer.emergency === true]] },
  { name: 'Out-of-domain question stays honest', body: { question: 'ფეხბურთის მატჩის შედეგი', mode: 'quick' },
    checks: [['no fabricated IDs', (d) => d.verification.citations.fabricated.length === 0]] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const results = [];
  let hardFail = 0;
  for (const [i, c] of CASES.entries()) {
    if (i) await sleep(PACE_MS);
    const started = Date.now();
    let status = 0;
    let d = null;
    try {
      const res = await fetch(`${BASE}/api/orchestrate`, { method: 'POST', headers: { 'content-type': 'application/json', ...(c.noConsent ? {} : c.headers ?? {}) }, body: JSON.stringify(c.body) });
      status = res.status;
      d = await res.json().catch(() => null);
    } catch (e) {
      status = -1;
    }
    const checks = [];
    const want = c.expectStatus ?? 200;
    checks.push({ label: `HTTP ${want}`, pass: status === want, hard: true });
    if (status === 200 && d?.answer) {
      for (const [label, fn] of c.checks) {
        let pass = false;
        try { pass = Boolean(fn(d)); } catch { pass = false; }
        checks.push({ label, pass, hard: true });
      }
      // Global invariants on every published answer.
      checks.push({ label: 'no foreign script in bottom line', pass: !FOREIGN.test(d.answer.bottomLine), hard: true });
      checks.push({ label: 'no fabricated rule IDs', pass: (d.verification?.citations?.fabricated ?? []).length === 0, hard: true });
      checks.push({ label: 'no unretrieved reference published', pass: !(d.verification?.references ?? []).some((r) => r.status === 'NOT_RETRIEVED' && d.answer.bottomLine.includes(r.ref)), hard: true });
      checks.push({ label: 'model numbers verified (soft)', pass: !(d.verification?.numerics ?? []).some((n) => n.status === 'UNVERIFIED'), hard: false });
      checks.push({ label: 'synthesis used (soft)', pass: d.usage?.model !== 'deterministic' && (d.usage?.outputTokens ?? 0) > 0, hard: false });
    } else if (status === 200) {
      checks.push({ label: 'answer present', pass: false, hard: true });
    }
    const failed = checks.filter((x) => x.hard && !x.pass);
    hardFail += failed.length ? 1 : 0;
    results.push({
      name: c.name,
      status,
      ms: Date.now() - started,
      passed: failed.length === 0,
      failed: failed.map((x) => x.label),
      soft: checks.filter((x) => !x.hard && !x.pass).map((x) => x.label),
      scriptRejections: d?.usage?.scriptRejections ?? null,
      costUsd: d?.usage?.estimatedCostUsd ?? 0,
    });
    console.log(`${failed.length ? 'FAIL' : 'ok  '} ${c.name}${failed.length ? `  → ${failed.map((x) => x.label).join('; ')}` : ''}`);
  }
  const summary = {
    base: BASE,
    at: new Date().toISOString(),
    cases: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: hardFail,
    driftAttempts: results.reduce((a, r) => a + (r.scriptRejections ?? 0), 0),
    totalCostUsd: +results.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(5),
    results,
  };
  const { writeFileSync } = await import('node:fs');
  writeFileSync('eval-report.json', JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.cases} passed · drift retries ${summary.driftAttempts} · cost $${summary.totalCostUsd}`);
  process.exit(hardFail ? 1 : 0);
}

run();
