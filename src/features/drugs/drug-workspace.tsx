'use client';

import { useMemo, useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { DRUGS, INTERACTIONS, searchDrugs } from '@/knowledge/drugs';
import { sourcesByIds } from '@/knowledge/sources';
import { Badge, Bullets, Collapsible, EmptyState, ExportBar, Panel, Table } from '@/components/ui/primitives';
import { CALCULATORS } from '@/lib/calculators';
import { useCase } from '@/features/case/case-store';
import { cn } from '@/lib/utils';

type Tab = 'monograph' | 'dose' | 'interactions' | 'organ' | 'pregnancy';

const TABS: { id: Tab; labelKa: string }[] = [
  { id: 'monograph', labelKa: 'მონოგრაფია' },
  { id: 'dose', labelKa: 'დოზის შემოწმება' },
  { id: 'interactions', labelKa: 'ურთიერთქმედებები' },
  { id: 'organ', labelKa: 'თირკმელი / ღვიძლი' },
  { id: 'pregnancy', labelKa: 'ორსულობა / ლაქტაცია' },
];

export function DrugWorkspace() {
  const { patient } = useCase();
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState(DRUGS[0].id);
  const [tab, setTab] = useState<Tab>('monograph');
  const [selected, setSelected] = useState<string[]>([]);

  const list = useMemo(() => searchDrugs(q), [q]);
  const drug = DRUGS.find((d) => d.id === activeId)!;
  const sources = sourcesByIds(drug.sources);

  const crcl = useMemo(() => {
    if (patient.age === null || patient.weightKg === null || patient.creatinineMgDl === null) return null;
    const calc = CALCULATORS.find((c) => c.id === 'crcl')!;
    return calc.compute({ age: patient.age, weight: patient.weightKg, creat: patient.creatinineMgDl, female: patient.sex === 'female' }).value;
  }, [patient]);

  const pairInteractions = INTERACTIONS.filter((i) => selected.includes(i.a) && selected.includes(i.b));

  const monographText = `# ${drug.generic_ka || drug.generic_name} (${drug.generic_name})
ATC: ${drug.atc} · ჯგუფი: ${drug.class}
ბრენდები: ${drug.brand_names.join(', ')}

## ჩვენებები
${drug.indications.map((i) => `- ${i}`).join('\n')}

## დოზა
მოზრდილები: ${drug.adult_dose}
ბავშვები: ${drug.pediatric_dose}

## თირკმლის კორექცია
${drug.renal_adjustment.map((r) => `- ${r.threshold}: ${r.action}`).join('\n')}

## ღვიძლის კორექცია
${drug.hepatic_adjustment}

## ორსულობა / ლაქტაცია
${drug.pregnancy}
${drug.lactation}

## უკუჩვენებები
${drug.contraindications.map((i) => `- ${i}`).join('\n')}

## გაფრთხილებები
${drug.warnings.map((i) => `- ${i}`).join('\n')}

## მონიტორინგი
${drug.monitoring.map((i) => `- ${i}`).join('\n')}

## ხელმისაწვდომობა საქართველოში
${drug.georgia_availability}

## წყაროები
${sources.map((s) => `- ${s.citation_text}`).join('\n')}`;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Panel title="მედიკამენტები" subtitle={`${DRUGS.length} სტრუქტურირებული ობიექტი`}>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input className="field pl-8" placeholder="გენერიკი, ბრენდი, ATC…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <p className="text-xs text-slate-500">რეესტრში ვერ მოიძებნა. მედიკამენტების ბაზა ფართოვდება ingestion მოდულით.</p>
          ) : (
            <ul className="max-h-[460px] space-y-0.5 overflow-y-auto">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={`${d.generic_name} შერჩევა ურთიერთქმედებისთვის`}
                    className="h-3.5 w-3.5 accent-cyan"
                    checked={selected.includes(d.id)}
                    onChange={(e) => setSelected((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))}
                  />
                  <button type="button" onClick={() => setActiveId(d.id)} className={cn('flex-1 rounded-md px-2 py-1.5 text-left text-xs transition', d.id === activeId ? 'bg-cyan/12 text-fg' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200')}>
                    <span className="block truncate">{d.generic_ka || d.generic_name}</span>
                    <span className="block truncate text-[10px] text-slate-600">{d.class}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn('rounded-full border px-3 py-1 text-xs transition', tab === t.id ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
                {t.labelKa}
              </button>
            ))}
          </div>
        </Panel>

        {tab === 'monograph' && (
          <Panel
            title={`${drug.generic_ka || drug.generic_name} (${drug.generic_name})`}
            subtitle={`${drug.class} · ATC ${drug.atc}`}
            actions={<ExportBar text={monographText} json={drug} filename={`drug-${drug.id}`} />}
          >
            <div className="space-y-2">
              <Collapsible title="ჩვენებები">
                <Bullets items={drug.indications} />
              </Collapsible>
              <Collapsible title="დოზირება">
                <p className="text-sm text-slate-300">
                  <span className="label mr-2">მოზრდილები</span>
                  {drug.adult_dose}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  <span className="label mr-2">ბავშვები</span>
                  {drug.pediatric_dose}
                </p>
              </Collapsible>
              <Collapsible title="უკუჩვენებები და გაფრთხილებები" tone="warning">
                <Bullets items={[...drug.contraindications, ...drug.warnings]} />
              </Collapsible>
              <Collapsible title="გვერდითი მოვლენები" defaultOpen={false}>
                <Bullets items={drug.adverse_effects} />
              </Collapsible>
              <Collapsible title="მონიტორინგი">
                <Bullets items={drug.monitoring} />
              </Collapsible>
              <Collapsible title="შეწყვეტა და ტიტრაცია" defaultOpen={false}>
                <Bullets items={[drug.withdrawal, drug.taper, drug.overdose].filter(Boolean)} />
              </Collapsible>
              <Collapsible title="ქართული კონტექსტი">
                <p className="text-sm text-slate-300">{drug.georgia_availability}</p>
                <p className="mt-1 text-xs text-slate-500">ბრენდები: {drug.brand_names.join(', ') || '—'}</p>
              </Collapsible>
              <Collapsible title="წყაროები" defaultOpen={false}>
                <Bullets items={sources.map((s) => s.citation_text)} />
              </Collapsible>
            </div>
          </Panel>
        )}

        {tab === 'dose' && (
          <Panel title="დოზის შემოწმება პაციენტისთვის" subtitle="ყველა რიცხვი გამოითვლება დეტერმინისტული კოდით">
            {crcl === null ? (
              <EmptyState title="თირკმლის ფუნქცია ვერ გამოითვალა" description="დოზის შესამოწმებლად საჭიროა ასაკი, წონა და შრატის კრეატინინი. შეავსეთ ისინი Case Workspace-ში ან Clinical Context პანელში." />
            ) : (
              <>
                <p className="text-sm text-slate-200">
                  გამოთვლილი კრეატინინის კლირენსი: <span className="font-semibold text-cyan">{crcl} მლ/წთ</span> (Cockcroft-Gault)
                </p>
                <div className="mt-3 space-y-2">
                  {drug.renal_adjustment.map((r, i) => {
                    const nums = r.threshold.match(/\d+/g)?.map(Number) ?? [];
                    const hit = /</.test(r.threshold) && nums.length === 1 ? crcl < nums[0] : nums.length >= 2 ? crcl >= Math.min(...nums) && crcl <= Math.max(...nums) : false;
                    return (
                      <div key={i} className={cn('rounded-lg border p-2.5', hit ? 'border-clinical-high/45 bg-clinical-high/10' : 'border-line bg-ink-850/40')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-200">{r.threshold}</span>
                          {hit && <Badge tone="high">ეხება ამ პაციენტს</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-slate-300">{r.action}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-slate-500">სტანდარტული დოზა: {drug.adult_dose}</p>
              </>
            )}
          </Panel>
        )}

        {tab === 'interactions' && (
          <Panel title="ურთიერთქმედებების შემოწმება" subtitle={`შერჩეულია ${selected.length} პრეპარატი`}>
            {selected.length < 2 ? (
              <EmptyState title="აირჩიეთ მინიმუმ ორი პრეპარატი" description="მარცხენა სიაში მონიშნეთ პრეპარატები ჩექბოქსით, რომ შემოწმდეს მათი ურთიერთქმედება." />
            ) : pairInteractions.length === 0 ? (
              <p className="text-sm text-slate-300">ამ კომბინაციაზე რეესტრში ურთიერთქმედება არ არის რეგისტრირებული. ეს არ ნიშნავს, რომ ურთიერთქმედება არ არსებობს — ბაზა შეზღუდულია.</p>
            ) : (
              <Table
                headers={['პრეპარატები', 'სიმძიმე', 'მექანიზმი', 'ეფექტი', 'მართვა']}
                rows={pairInteractions.map((i) => [
                  `${i.a} + ${i.b}`,
                  <Badge key="s" tone={i.severity === 'contraindicated' ? 'critical' : i.severity === 'major' ? 'high' : 'moderate'}>
                    {i.severity}
                  </Badge>,
                  i.mechanism,
                  i.effect,
                  i.management,
                ])}
              />
            )}
          </Panel>
        )}

        {tab === 'organ' && (
          <Panel title="ორგანოთა ფუნქციაზე დაფუძნებული კორექცია">
            <p className="label">თირკმელი</p>
            <Bullets items={drug.renal_adjustment.map((r) => `${r.threshold} → ${r.action}`)} />
            <p className="label mt-3">ღვიძლი</p>
            <p className="text-sm text-slate-300">{drug.hepatic_adjustment}</p>
          </Panel>
        )}

        {tab === 'pregnancy' && (
          <Panel title="ორსულობა და ლაქტაცია">
            <div className="flex items-start gap-2 rounded-lg border border-clinical-moderate/35 bg-clinical-moderate/5 p-2.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clinical-moderate" />
              <p className="text-[11px] leading-relaxed text-slate-400">ორსულობასთან დაკავშირებული გადაწყვეტილება ყოველთვის ინდივიდუალურია და საჭიროებს სპეციალისტის ჩართვას.</p>
            </div>
            <p className="label mt-3">ორსულობა</p>
            <p className="text-sm text-slate-300">{drug.pregnancy}</p>
            <p className="label mt-3">ლაქტაცია</p>
            <p className="text-sm text-slate-300">{drug.lactation}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
