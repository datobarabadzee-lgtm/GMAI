/**
 * GEORGIAN ↔ ENGLISH CLINICAL LEXICON
 *
 * The internal clinical corpus is English; the product is Georgian-first.
 * Retrieval therefore expands a Georgian query with its English equivalents
 * before hitting the lexical and vector indexes, and vice versa.
 *
 * Every pair is a controlled term, not a free translation: entries are used for
 * query expansion only and never rewrite user-visible text.
 */

export type LexEntry = { ka: string[]; en: string[]; domain?: string };

export const LEXICON: LexEntry[] = [
  // ── cardiology ──
  { ka: ['წინაგულების ფიბრილაცია', 'ფიბრილაცია', 'მოციმციმე არითმია'], en: ['atrial fibrillation', 'afib'], domain: 'cardiology' },
  { ka: ['წინაგულების თრთოლვა'], en: ['atrial flutter'], domain: 'cardiology' },
  { ka: ['ანტიკოაგულაცია', 'ანტიკოაგულანტი'], en: ['anticoagulation', 'anticoagulant'], domain: 'cardiology' },
  { ka: ['ანტითრომბოციტული'], en: ['antiplatelet'], domain: 'cardiology' },
  { ka: ['არტერიული ჰიპერტენზია', 'ჰიპერტენზია', 'წნევა'], en: ['hypertension', 'blood pressure'], domain: 'cardiology' },
  { ka: ['გულის უკმარისობა'], en: ['heart failure'], domain: 'cardiology' },
  { ka: ['მიოკარდიუმის ინფარქტი', 'ინფარქტი'], en: ['myocardial infarction', 'acute coronary syndrome'], domain: 'cardiology' },
  { ka: ['სტენოკარდია', 'გულმკერდის ტკივილი'], en: ['angina', 'chest pain'], domain: 'cardiology' },
  { ka: ['არითმია'], en: ['arrhythmia'], domain: 'cardiology' },
  { ka: ['ბრადიკარდია'], en: ['bradycardia'], domain: 'cardiology' },
  { ka: ['ტაქიკარდია'], en: ['tachycardia'], domain: 'cardiology' },
  { ka: ['დისლიპიდემია', 'ქოლესტერინი'], en: ['dyslipidemia', 'cholesterol', 'lipid'], domain: 'cardiology' },
  { ka: ['სარქველი', 'სარქვლის'], en: ['valve', 'valvular'], domain: 'cardiology' },
  { ka: ['ეკგ'], en: ['electrocardiogram', 'ecg', 'ekg'], domain: 'cardiology' },
  { ka: ['ექოკარდიოგრაფია'], en: ['echocardiography', 'echocardiogram'], domain: 'cardiology' },

  // ── neurology ──
  { ka: ['ინსულტი', 'იშემიური ინსულტი'], en: ['stroke', 'ischemic stroke', 'cerebral infarction'], domain: 'neurology' },
  { ka: ['გარდამავალი იშემიური შეტევა'], en: ['transient ischemic attack', 'tia'], domain: 'neurology' },
  { ka: ['ეპილეფსია', 'კრუნჩხვა'], en: ['epilepsy', 'seizure'], domain: 'neurology' },
  { ka: ['მიგრენი', 'თავის ტკივილი'], en: ['migraine', 'headache'], domain: 'neurology' },
  { ka: ['ნეიროპათია', 'პოლინეიროპათია'], en: ['neuropathy', 'polyneuropathy'], domain: 'neurology' },
  { ka: ['დემენცია', 'კოგნიტური დაქვეითება'], en: ['dementia', 'cognitive impairment'], domain: 'neurology' },
  { ka: ['დელირიუმი'], en: ['delirium'], domain: 'neurology' },
  { ka: ['პარკინსონი'], en: ['parkinson'], domain: 'neurology' },
  { ka: ['გაფანტული სკლეროზი'], en: ['multiple sclerosis'], domain: 'neurology' },
  { ka: ['თავბრუსხვევა'], en: ['dizziness', 'vertigo'], domain: 'neurology' },
  { ka: ['ცნობიერების დარღვევა', 'კომა'], en: ['altered mental status', 'coma', 'consciousness'], domain: 'neurology' },
  { ka: ['დამბლა', 'პარეზი', 'სისუსტე'], en: ['paresis', 'weakness', 'paralysis'], domain: 'neurology' },

  // ── gastroenterology / hepatology ──
  { ka: ['დისპეფსია'], en: ['dyspepsia'], domain: 'gastroenterology' },
  { ka: ['გასტროეზოფაგური რეფლუქსი', 'რეფლუქსი'], en: ['gastroesophageal reflux', 'gerd'], domain: 'gastroenterology' },
  { ka: ['წყლული', 'პეპტიური წყლული'], en: ['peptic ulcer', 'ulcer'], domain: 'gastroenterology' },
  { ka: ['ენდოსკოპია', 'გასტროსკოპია'], en: ['endoscopy', 'upper endoscopy'], domain: 'gastroenterology' },
  { ka: ['კოლონოსკოპია'], en: ['colonoscopy'], domain: 'gastroenterology' },
  { ka: ['ციროზი'], en: ['cirrhosis'], domain: 'hepatology' },
  { ka: ['ჰეპატიტი'], en: ['hepatitis'], domain: 'hepatology' },
  { ka: ['ღვიძლის უკმარისობა', 'ღვიძლი'], en: ['liver failure', 'hepatic', 'liver'], domain: 'hepatology' },
  { ka: ['ასციტი'], en: ['ascites'], domain: 'hepatology' },
  { ka: ['პანკრეატიტი'], en: ['pancreatitis'], domain: 'gastroenterology' },
  { ka: ['დიარეა'], en: ['diarrhea'], domain: 'gastroenterology' },
  { ka: ['ყაბზობა'], en: ['constipation'], domain: 'gastroenterology' },
  { ka: ['მუცლის ტკივილი'], en: ['abdominal pain'], domain: 'gastroenterology' },
  { ka: ['გულისრევა', 'ღებინება'], en: ['nausea', 'vomiting'], domain: 'gastroenterology' },

  // ── nephrology / urology ──
  { ka: ['თირკმლის უკმარისობა', 'თირკმელი', 'თირკმლის'], en: ['renal failure', 'kidney', 'renal'], domain: 'nephrology' },
  { ka: ['ქრონიკული თირკმლის დაავადება'], en: ['chronic kidney disease', 'ckd'], domain: 'nephrology' },
  { ka: ['მწვავე თირკმლის დაზიანება'], en: ['acute kidney injury', 'aki'], domain: 'nephrology' },
  { ka: ['დიალიზი'], en: ['dialysis'], domain: 'nephrology' },
  { ka: ['პროტეინურია'], en: ['proteinuria'], domain: 'nephrology' },
  { ka: ['შარდის შეკავება'], en: ['urinary retention'], domain: 'urology' },
  { ka: ['პიელონეფრიტი'], en: ['pyelonephritis'], domain: 'urology' },
  { ka: ['პროსტატა'], en: ['prostate'], domain: 'urology' },

  // ── endocrinology ──
  { ka: ['შაქრიანი დიაბეტი', 'დიაბეტი'], en: ['diabetes mellitus', 'diabetes'], domain: 'endocrinology' },
  { ka: ['ჰიპოგლიკემია'], en: ['hypoglycemia'], domain: 'endocrinology' },
  { ka: ['ჰიპერგლიკემია'], en: ['hyperglycemia'], domain: 'endocrinology' },
  { ka: ['ჰიპოთირეოზი'], en: ['hypothyroidism'], domain: 'endocrinology' },
  { ka: ['ჰიპერთირეოზი'], en: ['hyperthyroidism', 'thyrotoxicosis'], domain: 'endocrinology' },
  { ka: ['ფარისებრი ჯირკვალი'], en: ['thyroid'], domain: 'endocrinology' },
  { ka: ['ოსტეოპოროზი'], en: ['osteoporosis'], domain: 'endocrinology' },
  { ka: ['სიმსუქნე'], en: ['obesity'], domain: 'endocrinology' },
  { ka: ['თირკმელზედა ჯირკვალი'], en: ['adrenal'], domain: 'endocrinology' },

  // ── respiratory / infectious disease ──
  { ka: ['პნევმონია'], en: ['pneumonia'], domain: 'respiratory' },
  { ka: ['ასთმა'], en: ['asthma'], domain: 'respiratory' },
  { ka: ['ფილტვების ქრონიკული ობსტრუქციული დაავადება'], en: ['copd', 'chronic obstructive pulmonary disease'], domain: 'respiratory' },
  { ka: ['ქოშინი', 'სუნთქვის გაძნელება'], en: ['dyspnea', 'shortness of breath'], domain: 'respiratory' },
  { ka: ['ხველა'], en: ['cough'], domain: 'respiratory' },
  { ka: ['ჰემოპტოე'], en: ['hemoptysis'], domain: 'respiratory' },
  { ka: ['ფილტვის არტერიის თრომბოემბოლია'], en: ['pulmonary embolism'], domain: 'respiratory' },
  { ka: ['ტუბერკულოზი'], en: ['tuberculosis'], domain: 'infectious disease' },
  { ka: ['სეფსისი', 'სეპტიური შოკი'], en: ['sepsis', 'septic shock'], domain: 'infectious disease' },
  { ka: ['ცხელება'], en: ['fever'], domain: 'infectious disease' },
  { ka: ['ანტიბიოტიკი', 'ანტიბიოტიკოთერაპია'], en: ['antibiotic', 'antimicrobial'], domain: 'infectious disease' },
  { ka: ['ინფექცია'], en: ['infection'], domain: 'infectious disease' },
  { ka: ['მენინგიტი'], en: ['meningitis'], domain: 'infectious disease' },
  { ka: ['ჰოსპიტალური ინფექცია'], en: ['healthcare associated infection', 'nosocomial'], domain: 'infection control' },

  // ── haematology / oncology ──
  { ka: ['ანემია'], en: ['anemia'], domain: 'hematology' },
  { ka: ['სისხლდენა'], en: ['bleeding', 'hemorrhage'], domain: 'hematology' },
  { ka: ['თრომბოზი', 'ღრმა ვენების თრომბოზი'], en: ['thrombosis', 'deep vein thrombosis', 'venous thromboembolism'], domain: 'hematology' },
  { ka: ['თრომბოციტოპენია'], en: ['thrombocytopenia'], domain: 'hematology' },
  { ka: ['სიმსივნე', 'ონკოლოგიური'], en: ['cancer', 'malignancy', 'tumor'], domain: 'oncology' },
  { ka: ['ქიმიოთერაპია'], en: ['chemotherapy'], domain: 'oncology' },
  { ka: ['მეტასტაზი'], en: ['metastasis'], domain: 'oncology' },

  // ── obstetrics / reproductive ──
  { ka: ['ორსულობა', 'ორსული'], en: ['pregnancy', 'pregnant'], domain: 'obstetrics' },
  { ka: ['ექტოპიური ორსულობა'], en: ['ectopic pregnancy'], domain: 'obstetrics' },
  { ka: ['პრეეკლამფსია'], en: ['preeclampsia'], domain: 'obstetrics' },
  { ka: ['მშობიარობა'], en: ['labor', 'delivery'], domain: 'obstetrics' },
  { ka: ['ლაქტაცია', 'ძუძუთი კვება'], en: ['lactation', 'breastfeeding'], domain: 'obstetrics' },
  { ka: ['უშვილობა'], en: ['infertility'], domain: 'reproductive medicine' },
  { ka: ['განაყოფიერება', 'ივფ'], en: ['in vitro fertilization', 'ivf', 'assisted reproduction'], domain: 'reproductive medicine' },
  { ka: ['ოვარიული ჰიპერსტიმულაციის სინდრომი'], en: ['ovarian hyperstimulation syndrome', 'ohss'], domain: 'reproductive medicine' },
  { ka: ['საკვერცხე'], en: ['ovary', 'ovarian'], domain: 'reproductive medicine' },
  { ka: ['ენდომეტრიოზი'], en: ['endometriosis'], domain: 'gynecology' },

  // ── psychiatry ──
  { ka: ['დეპრესია'], en: ['depression'], domain: 'psychiatry' },
  { ka: ['შფოთვა'], en: ['anxiety'], domain: 'psychiatry' },
  { ka: ['უძილობა'], en: ['insomnia'], domain: 'psychiatry' },
  { ka: ['ფსიქოზი'], en: ['psychosis'], domain: 'psychiatry' },

  // ── critical care / surgery / anaesthesia ──
  { ka: ['რეანიმაცია', 'ინტენსიური თერაპია'], en: ['resuscitation', 'intensive care', 'icu'], domain: 'critical care' },
  { ka: ['ინტუბაცია'], en: ['intubation'], domain: 'critical care' },
  { ka: ['ანესთეზია'], en: ['anesthesia'], domain: 'anesthesia' },
  { ka: ['ოპერაცია', 'ქირურგიული ჩარევა'], en: ['surgery', 'operation', 'procedure'], domain: 'surgery' },
  { ka: ['პოსტოპერაციული'], en: ['postoperative'], domain: 'surgery' },
  { ka: ['წინასაოპერაციო'], en: ['preoperative'], domain: 'surgery' },
  { ka: ['შოკი'], en: ['shock'], domain: 'critical care' },
  { ka: ['ჰიპოტენზია'], en: ['hypotension'], domain: 'critical care' },
  // Emergency medicine / intensive care (collection gmai_clinical_v2).
  { ka: ['ტრიაჟი', 'რეტრიაჟი'], en: ['triage', 'retriage'], domain: 'critical care' },
  { ka: ['გულის გაჩერება', 'ასისტოლია'], en: ['cardiac arrest', 'asystole'], domain: 'critical care' },
  { ka: ['ეპინეფრინი', 'ადრენალინი'], en: ['epinephrine', 'adrenaline'], domain: 'critical care' },
  { ka: ['ნორეპინეფრინი', 'ნორადრენალინი'], en: ['norepinephrine', 'noradrenaline'], domain: 'critical care' },
  { ka: ['ვაზოპრესორი'], en: ['vasopressor'], domain: 'critical care' },
  { ka: ['ინოტროპი'], en: ['inotrope'], domain: 'critical care' },
  { ka: ['ამიოდარონი'], en: ['amiodarone'], domain: 'critical care' },
  { ka: ['ატროპინი'], en: ['atropine'], domain: 'critical care' },
  { ka: ['დეფიბრილაცია'], en: ['defibrillation'], domain: 'critical care' },
  { ka: ['კარდიოვერსია'], en: ['cardioversion'], domain: 'critical care' },
  { ka: ['სედაცია'], en: ['sedation'], domain: 'critical care' },
  { ka: ['ანალგეზია', 'გაუტკივარება'], en: ['analgesia'], domain: 'critical care' },
  { ka: ['პროპოფოლი'], en: ['propofol'], domain: 'critical care' },
  { ka: ['მიდაზოლამი'], en: ['midazolam'], domain: 'critical care' },
  { ka: ['დექსმედეტომიდინი'], en: ['dexmedetomidine'], domain: 'critical care' },
  { ka: ['კეტამინი'], en: ['ketamine'], domain: 'critical care' },
  { ka: ['ფენტანილი'], en: ['fentanyl'], domain: 'critical care' },
  { ka: ['მორფინი'], en: ['morphine'], domain: 'critical care' },
  { ka: ['მიორელაქსანტი', 'მიორელაქსაცია'], en: ['neuromuscular blocker', 'muscle relaxant'], domain: 'critical care' },
  { ka: ['სწრაფი თანმიმდევრული ინტუბაცია'], en: ['rapid sequence intubation', 'rsi'], domain: 'critical care' },
  { ka: ['ექსტუბაცია'], en: ['extubation'], domain: 'critical care' },
  { ka: ['ლარინგოსკოპია'], en: ['laryngoscopy'], domain: 'critical care' },
  { ka: ['სასუნთქი გზები'], en: ['airway'], domain: 'critical care' },
  { ka: ['მართვითი სუნთქვა', 'ვენტილაცია'], en: ['mechanical ventilation', 'ventilation'], domain: 'critical care' },
  { ka: ['არაინვაზიური ვენტილაცია'], en: ['non-invasive ventilation', 'niv'], domain: 'critical care' },
  { ka: ['ტრაქეოსტომია'], en: ['tracheostomy'], domain: 'critical care' },
  { ka: ['ჟანგბადი', 'ოქსიგენოთერაპია'], en: ['oxygen', 'oxygen therapy'], domain: 'critical care' },
  { ka: ['კაპნოგრაფია'], en: ['capnography'], domain: 'critical care' },
  { ka: ['ტრანსფუზია', 'მასიური ტრანსფუზია'], en: ['transfusion', 'massive transfusion'], domain: 'critical care' },
  { ka: ['ჰემორაგია', 'სისხლჩაქცევა'], en: ['hemorrhage', 'haemorrhage'], domain: 'critical care' },
  { ka: ['თრომბოლიზისი'], en: ['thrombolysis'], domain: 'critical care' },
  { ka: ['ჰეპარინი'], en: ['heparin'], domain: 'critical care' },
  { ka: ['ენოქსაპარინი'], en: ['enoxaparin'], domain: 'critical care' },
  { ka: ['ჰიპოთერმია'], en: ['hypothermia'], domain: 'critical care' },
  { ka: ['ტრავმა'], en: ['trauma'], domain: 'critical care' },
  { ka: ['კათეტერი', 'კათეტერიზაცია'], en: ['catheter', 'catheterization'], domain: 'critical care' },
  { ka: ['ნაწოლი'], en: ['pressure ulcer', 'pressure injury'], domain: 'critical care' },
  { ka: ['ელექტროლიტი'], en: ['electrolyte'], domain: 'critical care' },
  { ka: ['ინფუზია'], en: ['infusion'], domain: 'critical care' },
  { ka: ['დეესკალაცია'], en: ['de-escalation'], domain: 'critical care' },
  { ka: ['ტრანსპორტირება'], en: ['patient transport'], domain: 'critical care' },
  { ka: ['მოხრჩობა', 'ჰეიმლიკის მანევრი'], en: ['choking', 'heimlich'], domain: 'critical care' },

  // ── pharmacology ──
  { ka: ['დოზა', 'დოზირება'], en: ['dose', 'dosing', 'dosage'] },
  { ka: ['გვერდითი ეფექტი'], en: ['adverse effect', 'side effect'] },
  { ka: ['ურთიერთქმედება'], en: ['interaction', 'drug interaction'] },
  { ka: ['უკუჩვენება'], en: ['contraindication'] },
  { ka: ['პოლიფარმაცია'], en: ['polypharmacy'] },
  { ka: ['დეპრესკრაიბინგი'], en: ['deprescribing'] },
  { ka: ['მონიტორინგი'], en: ['monitoring'] },
  { ka: ['ტიტრაცია'], en: ['taper', 'titration'] },
  { ka: ['ალერგია'], en: ['allergy', 'hypersensitivity'] },

  // ── laboratory / imaging ──
  { ka: ['კრეატინინი'], en: ['creatinine'] },
  { ka: ['ჰემოგლობინი'], en: ['hemoglobin'] },
  { ka: ['ნატრიუმი'], en: ['sodium'] },
  { ka: ['კალიუმი'], en: ['potassium'] },
  { ka: ['გლუკოზა'], en: ['glucose'] },
  { ka: ['ტროპონინი'], en: ['troponin'] },
  { ka: ['ლაქტატი'], en: ['lactate'] },
  { ka: ['ბილირუბინი'], en: ['bilirubin'] },
  { ka: ['ალბუმინი'], en: ['albumin'] },
  { ka: ['თრომბოციტები'], en: ['platelets'] },
  { ka: ['ლეიკოციტები'], en: ['leukocytes', 'white blood cell'] },
  { ka: ['კომპიუტერული ტომოგრაფია'], en: ['computed tomography', 'ct scan'] },
  { ka: ['მაგნიტურ-რეზონანსული ტომოგრაფია'], en: ['magnetic resonance imaging', 'mri'] },
  { ka: ['ულტრასონოგრაფია', 'ექოსკოპია'], en: ['ultrasound', 'ultrasonography'] },
  { ka: ['რენტგენი'], en: ['radiography', 'x-ray'] },

  // ── consent, documentation and quality ──
  { ka: ['ინფორმირებული თანხმობა', 'თანხმობა'], en: ['informed consent', 'consent'], domain: 'quality' },
  { ka: ['სამედიცინო დოკუმენტაცია', 'ჩანაწერი', 'დოკუმენტაცია'], en: ['medical documentation', 'medical record', 'documentation'], domain: 'quality' },
  { ka: ['ეპიკრიზი'], en: ['discharge summary'], domain: 'quality' },
  { ka: ['დეფექტი'], en: ['defect'], domain: 'quality' },
  { ka: ['ხარისხის აუდიტი', 'აუდიტი'], en: ['quality audit', 'audit'], domain: 'quality' },
  { ka: ['სტანდარტი', 'პროტოკოლი'], en: ['standard', 'protocol', 'guideline'], domain: 'quality' },
  { ka: ['მიზეზობრიობა'], en: ['causality', 'causation'], domain: 'quality' },
  { ka: ['ზიანი'], en: ['harm', 'adverse outcome'], domain: 'quality' },
  { ka: ['ინციდენტი'], en: ['incident', 'adverse event'], domain: 'quality' },
  { ka: ['ექსპერტიზა'], en: ['expert review', 'forensic review'], domain: 'quality' },
  { ka: ['პაციენტის უსაფრთხოება'], en: ['patient safety'], domain: 'quality' },

  // ── care process / quality ──
  { ka: ['დიაგნოზი'], en: ['diagnosis'] },
  { ka: ['დიფერენციული დიაგნოზი'], en: ['differential diagnosis'] },
  { ka: ['მკურნალობა', 'თერაპია'], en: ['treatment', 'therapy', 'management'] },
  { ka: ['გამოკვლევა', 'კვლევა'], en: ['investigation', 'workup', 'testing'] },
  { ka: ['სკრინინგი'], en: ['screening'] },
  { ka: ['მეორადი პრევენცია', 'მეორადი პროფილაქტიკა'], en: ['secondary prevention'] },
  { ka: ['პირველადი პრევენცია', 'პირველადი პროფილაქტიკა'], en: ['primary prevention'] },
  { ka: ['პროფილაქტიკა', 'პრევენცია'], en: ['prophylaxis', 'prevention'] },
  { ka: ['გადამისამართება'], en: ['referral'] },
  { ka: ['ჰოსპიტალიზაცია'], en: ['hospitalization', 'admission'] },
  { ka: ['გაწერა'], en: ['discharge'] },
  { ka: ['დაკვირვება', 'მეთვალყურეობა'], en: ['follow-up', 'surveillance'] },
  { ka: ['გადაუდებელი'], en: ['emergency', 'urgent'] },
  { ka: ['რისკი'], en: ['risk'] },
  { ka: ['ხანდაზმული'], en: ['elderly', 'older adult'] },
  { ka: ['ბავშვი', 'პედიატრიული'], en: ['pediatric', 'child'] },
  // ── pharmacology: drug classes (search needs the class, not only the INN) ──
  { ka: ['ბენზოდიაზეპინი', 'ბენზოდიაზეპინები'], en: ['benzodiazepines', 'benzodiazepine'], domain: 'pharmacology' },
  { ka: ['ანტიდეპრესანტი', 'ანტიდეპრესანტები'], en: ['antidepressants', 'antidepressant'], domain: 'pharmacology' },
  { ka: ['სეროტონინის უკუმიტაცების ინჰიბიტორი', 'სსრი'], en: ['selective serotonin reuptake inhibitors', 'ssri'], domain: 'pharmacology' },
  { ka: ['ანტიფსიქოტიკი', 'ანტიფსიქოტიკები', 'ნეიროლეპტიკი'], en: ['antipsychotics', 'antipsychotic'], domain: 'pharmacology' },
  { ka: ['ოპიოიდი', 'ოპიოიდები'], en: ['opioids', 'opioid'], domain: 'pharmacology' },
  { ka: ['არასტეროიდული ანთების საწინააღმდეგო', 'ასაწს'], en: ['nonsteroidal anti-inflammatory drugs', 'nsaid'], domain: 'pharmacology' },
  { ka: ['პროტონული ტუმბოს ინჰიბიტორი', 'პროტონული ტუმბოს ინჰიბიტორები'], en: ['proton pump inhibitors', 'ppi'], domain: 'pharmacology' },
  { ka: ['სტატინი', 'სტატინები'], en: ['statins', 'statin'], domain: 'pharmacology' },
  { ka: ['ანტიბიოტიკი', 'ანტიბიოტიკები'], en: ['antibiotics', 'antibacterial agents'], domain: 'pharmacology' },
  { ka: ['ანტიქოლინერგული'], en: ['anticholinergic'], domain: 'pharmacology' },
  { ka: ['ნოოტროპი', 'ნოოტროპები'], en: ['nootropic agents', 'nootropics'], domain: 'pharmacology' },
  { ka: ['დიეტური დანამატი', 'ბადი', 'ბად'], en: ['dietary supplements'], domain: 'pharmacology' },
  { ka: ['გვერდითი ეფექტი', 'გვერდითი მოვლენა'], en: ['adverse drug reaction', 'adverse effects'], domain: 'pharmacology' },
  { ka: ['წამალთაშორისი ურთიერთქმედება'], en: ['drug interactions'], domain: 'pharmacology' },
  { ka: ['დოზის კორექცია'], en: ['dose adjustment'], domain: 'pharmacology' },
  // ── geriatrics ──
  { ka: ['ხანდაზმული', 'ხანდაზმულები', 'მოხუცი'], en: ['aged', 'older adults'], domain: 'geriatrics' },
  { ka: ['დაცემა', 'დაცემები', 'წაქცევა'], en: ['accidental falls', 'falls'], domain: 'geriatrics' },
  { ka: ['სისუსტე', 'ფრეილი', 'მყიფეობა'], en: ['frailty', 'frail elderly'], domain: 'geriatrics' },
  { ka: ['დეპრესკრაიბინგი', 'პრეპარატის მოხსნა'], en: ['deprescriptions', 'deprescribing'], domain: 'geriatrics' },
  { ka: ['პოლიფარმაცია'], en: ['polypharmacy'], domain: 'geriatrics' },
  { ka: ['ორთოსტატული ჰიპოტენზია'], en: ['orthostatic hypotension'], domain: 'geriatrics' },
  { ka: ['კოგნიტური დაქვეითება'], en: ['cognitive dysfunction', 'cognitive impairment'], domain: 'geriatrics' },
  // ── symptoms and outcomes that research questions turn on ──
  { ka: ['ტკივილი', 'ქრონიკული ტკივილი'], en: ['pain', 'chronic pain'], domain: 'general' },
  { ka: ['თავის ტკივილი'], en: ['headache'], domain: 'neurology' },
  { ka: ['ჰოსპიტალიზაცია'], en: ['hospitalization'], domain: 'general' },
  { ka: ['სიკვდილობა', 'ლეტალობა'], en: ['mortality'], domain: 'general' },
  { ka: ['სიცოცხლის ხარისხი'], en: ['quality of life'], domain: 'general' },
  { ka: ['მოტეხილობა', 'ბარძაყის მოტეხილობა'], en: ['fractures', 'hip fractures'], domain: 'general' },
  // ── Coverage additions (2026-10-17): common concepts that previously had no English equivalent ──
  { ka: ['ფერიტინი'], en: ['ferritin'], domain: 'haematology' },
  { ka: ['ლიმფადენოპათია', 'ლიმფური კვანძების გადიდება'], en: ['lymphadenopathy'], domain: 'haematology' },
  { ka: ['წონაში კლება', 'წონის კლება'], en: ['weight loss'] },
  { ka: ['ღამის ოფლიანობა'], en: ['night sweats'] },
  { ka: ['დაღლილობა', 'მომატებული დაღლილობა'], en: ['fatigue'] },
  { ka: ['ფარინგიტი', 'ყელის ტკივილი'], en: ['pharyngitis', 'sore throat'], domain: 'infectious' },
  { ka: ['ბრონქიტი'], en: ['bronchitis'], domain: 'respiratory' },
  { ka: ['ქოლეცისტიტი'], en: ['cholecystitis'], domain: 'gastroenterology' },
  { ka: ['აპენდიციტი'], en: ['appendicitis'], domain: 'surgery' },
  { ka: ['გასტრიტი'], en: ['gastritis'], domain: 'gastroenterology' },
  { ka: ['ნაწლავის გაღიზიანების სინდრომი'], en: ['irritable bowel syndrome'], domain: 'gastroenterology' },
  { ka: ['კრონის დაავადება'], en: ['crohn disease'], domain: 'gastroenterology' },
  { ka: ['რევმატოიდული ართრიტი'], en: ['rheumatoid arthritis'], domain: 'rheumatology' },
  { ka: ['ოსტეოართრიტი', 'ოსტეოართროზი'], en: ['osteoarthritis'], domain: 'rheumatology' },
  { ka: ['ართრიტი'], en: ['arthritis'], domain: 'rheumatology' },
  { ka: ['პოდაგრა'], en: ['gout'], domain: 'rheumatology' },
  { ka: ['დისკის თიაქარი', 'ხერხემლის თიაქარი'], en: ['intervertebral disc displacement', 'disc herniation'], domain: 'neurology' },
  { ka: ['შაკიკი', 'მიგრენი'], en: ['migraine'], domain: 'neurology' },
  { ka: ['ტრანზიტორული იშემიური შეტევა', 'გარდამავალი იშემიური შეტევა'], en: ['transient ischemic attack'], domain: 'neurology' },
  { ka: ['ალცჰაიმერის დაავადება'], en: ['alzheimer disease'], domain: 'neurology' },
  { ka: ['შიზოფრენია'], en: ['schizophrenia'], domain: 'psychiatry' },
  { ka: ['ბიპოლარული აშლილობა'], en: ['bipolar disorder'], domain: 'psychiatry' },
  { ka: ['ალკოჰოლის მოხმარება', 'ალკოჰოლიზმი'], en: ['alcohol use disorder'], domain: 'psychiatry' },
  { ka: ['თამბაქოს მოწევა', 'მწეველი'], en: ['smoking', 'tobacco use'] },
  { ka: ['ბეტა-ბლოკატორი', 'ბეტა ბლოკატორი'], en: ['adrenergic beta-antagonists', 'beta blockers'], domain: 'pharmacology' },
  { ka: ['ქრონიკული ობსტრუქციული დაავადება', 'ფოქდ'], en: ['chronic obstructive pulmonary disease'], domain: 'respiratory' },
  { ka: ['ფილტვის კვანძი'], en: ['solitary pulmonary nodule', 'pulmonary nodule'], domain: 'respiratory' },
  { ka: ['ჰიპონატრიემია'], en: ['hyponatremia'], domain: 'nephrology' },
  { ka: ['ჰიპერკალიემია'], en: ['hyperkalemia'], domain: 'nephrology' },
  { ka: ['უნაყოფობა'], en: ['infertility'], domain: 'reproductive' },
  { ka: ['მენოპაუზა', 'კლიმაქსი'], en: ['menopause'], domain: 'gynaecology' },
  { ka: ['ძუძუს კიბო', 'სარძევე ჯირკვლის კიბო'], en: ['breast neoplasms', 'breast cancer'], domain: 'oncology' },
  { ka: ['ფილტვის კიბო'], en: ['lung neoplasms', 'lung cancer'], domain: 'oncology' },
  { ka: ['მსხვილი ნაწლავის კიბო', 'კოლორექტალური კიბო'], en: ['colorectal neoplasms', 'colorectal cancer'], domain: 'oncology' },
  { ka: ['ვაქცინაცია', 'აცრა'], en: ['vaccination'] },
  { ka: ['გრიპი'], en: ['influenza'], domain: 'infectious' },
  { ka: ['კოვიდი', 'კოვიდ-19'], en: ['covid-19'], domain: 'infectious' },
  { ka: ['სამედიცინო შეცდომა'], en: ['medical errors'], domain: 'quality' },
  { ka: ['ფიზიკური აქტივობა', 'ვარჯიში'], en: ['exercise', 'physical activity'] },
  { ka: ['დიეტა', 'კვება'], en: ['diet'] },
  { ka: ['რეაბილიტაცია'], en: ['rehabilitation'] },
  { ka: ['პალიატიური მზრუნველობა', 'პალიატიური მკურნალობა'], en: ['palliative care'] },
];

const kaIndex = new Map<string, string[]>();
const enIndex = new Map<string, string[]>();
LEXICON.forEach((e) => {
  e.ka.forEach((k) => kaIndex.set(k.toLowerCase(), e.en));
  e.en.forEach((k) => enIndex.set(k.toLowerCase(), e.ka));
});

export const DOMAIN_BY_TERM = new Map<string, string>();
LEXICON.forEach((e) => {
  if (!e.domain) return;
  [...e.ka, ...e.en].forEach((t) => DOMAIN_BY_TERM.set(t.toLowerCase(), e.domain as string));
});

/**
 * Georgian is heavily inflected (ფიბრილაცია → ფიბრილაციით → ფიბრილაციას), so
 * lexicon matching is stem-based: each word is truncated to a conservative stem
 * and matched as a prefix against the query's tokens.
 */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 5) return w;
  return w.slice(0, Math.max(5, w.length - 3));
}

const phraseStems = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((w) => w.length > 2)
    .map(stem);

/**
 * Expand a query with cross-language equivalents.
 * Returns added terms and the clinical domains they imply.
 */
export function expandQuery(text: string): { added: string[]; domains: string[]; matched: string[]; groups: string[][] } {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const added = new Set<string>();
  const domains = new Set<string>();
  const matched = new Set<string>();
  const groups: string[][] = [];

  const hit = (phrase: string) => {
    const stems = phraseStems(phrase);
    if (!stems.length) return false;
    return stems.every((st) => tokens.some((t) => t.startsWith(st)));
  };

  LEXICON.forEach((e) => {
    const source = [...e.ka, ...e.en].find((p) => hit(p));
    if (!source) return;
    matched.add(source);
    groups.push([...e.ka, ...e.en]);
    [...e.ka, ...e.en].forEach((t) => {
      if (t !== source) added.add(t);
    });
    if (e.domain) domains.add(e.domain);
  });

  return { added: [...added], domains: [...domains], matched: [...matched], groups };
}

export const lookupKa = (term: string) => kaIndex.get(term.toLowerCase()) ?? [];
export const lookupEn = (term: string) => enIndex.get(term.toLowerCase()) ?? [];
