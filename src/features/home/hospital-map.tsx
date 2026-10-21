'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import { HOSPITAL_MODULES, HOSPITAL_STAGES } from '@/knowledge/hospital';
import { AGENTS } from '@/agents/registry';
import { Badge, Bullets, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Each stage of the hospital maps to the modules that actually carry out that
 * work, so the map is a way into the system rather than a description of it.
 */
const MODULE_ACTIONS: Record<string, { href: string; labelKa: string }[]> = {
  'front-door': [
    { href: '/case', labelKa: 'ქეისის ინტეიკი' },
    { href: '/documents#upload', labelKa: 'დოკუმენტის ატვირთვა' },
  ],
  outpatient: [
    { href: '/clinical', labelKa: 'კლინიკური ანალიზი' },
    { href: '/ddx', labelKa: 'დიფერენციული დიაგნოზი' },
  ],
  emergency: [
    { href: '/clinical?mode=quick', labelKa: 'სწრაფი შეფასება' },
    { href: '/calculators', labelKa: 'რისკის ქულები' },
  ],
  inpatient: [
    { href: '/case', labelKa: 'ქეისის სამუშაო სივრცე' },
    { href: '/medication-review', labelKa: 'მედიკამენტების შეჯერება' },
  ],
  nursing: [
    { href: '/labs', labelKa: 'ლაბორატორიის ინტერპრეტაცია' },
    { href: '/medication-review', labelKa: 'მედიკამენტების შეჯერება' },
  ],
  pharmacy: [
    { href: '/drugs', labelKa: 'პრეპარატის ცნობარი' },
    { href: '/medication-review', labelKa: 'პოლიფარმაციის შეჯერება' },
  ],
  surgery: [
    { href: '/quality', labelKa: 'ოპერაციამდელი ხარისხის შემოწმება' },
    { href: '/documents', labelKa: 'თანხმობისა და ოქმის შაბლონები' },
  ],
  anaesthesia: [
    { href: '/calculators', labelKa: 'პერიოპერაციული ქულები' },
    { href: '/drugs', labelKa: 'პრეპარატები და დოზები' },
  ],
  icu: [
    { href: '/calculators', labelKa: 'SOFA / GCS / სიმძიმის ქულები' },
    { href: '/labs', labelKa: 'ლაბორატორიული დინამიკა' },
  ],
  diagnostics: [
    { href: '/labs', labelKa: 'ლაბორატორიული AI' },
    { href: '/evidence', labelKa: 'მტკიცებულების ძიება' },
  ],
  discharge: [
    { href: '/documents', labelKa: 'გაწერის დოკუმენტი' },
    { href: '/patient', labelKa: 'პაციენტისთვის ახსნა' },
  ],
  'quality-command': [
    { href: '/quality', labelKa: 'ხარისხის აუდიტი' },
    { href: '/defect', labelKa: 'დეფექტების ანალიზი' },
  ],
};

export function HospitalMap() {
  const [activeId, setActiveId] = useState(HOSPITAL_MODULES[0].id);
  const active = HOSPITAL_MODULES.find((m) => m.id === activeId)!;

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && HOSPITAL_MODULES.some((m) => m.id === hash)) setActiveId(hash);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="პაციენტის მარშრუტი" subtitle="ინტეიკიდან ხარისხის კონტროლამდე">
        <div className="flex flex-wrap items-center gap-1.5">
          {HOSPITAL_STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn('rounded-full border px-2.5 py-1 text-xs', active.stage === s ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400')}>{s}</span>
              {i < HOSPITAL_STAGES.length - 1 && <ArrowRight className="h-3 w-3 text-slate-700" />}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="მოდულები" subtitle={`${HOSPITAL_MODULES.length} მოდული`}>
          <ul className="space-y-0.5">
            {HOSPITAL_MODULES.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(m.id);
                    window.history.replaceState(null, '', `#${m.id}`);
                  }}
                  className={cn('w-full rounded-md px-2.5 py-2 text-left text-xs transition', m.id === activeId ? 'bg-cyan/12 text-fg' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200')}
                >
                  <span className="block">{m.nameKa}</span>
                  <span className="block text-[10px] text-slate-600">{m.stage}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title={active.nameKa} subtitle={`${active.nameEn} · ${active.stage}`} actions={<Building2 className="h-4 w-4 text-cyan" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label mb-1">რას აკეთებს AI</p>
                <Bullets items={active.whatAiDoes} />
              </div>
              <div>
                <p className="label mb-1">შემავალი მონაცემები</p>
                <Bullets items={active.inputs} />
                <p className="label mb-1 mt-3">გამომავალი</p>
                <Bullets items={active.outputs} />
              </div>
            </div>
            <div className="mt-4">
              <p className="label mb-1">უსაფრთხოების საზღვრები</p>
              <div className="rounded-lg border border-clinical-moderate/35 bg-clinical-moderate/5 p-3">
                <Bullets items={active.safetyBoundaries} />
              </div>
            </div>
            <div className="mt-4">
              <p className="label mb-1.5">გახსენი ეს მოდული</p>
              <div className="flex flex-wrap gap-2">
                {(MODULE_ACTIONS[active.id] ?? []).map((a) => (
                  <Link key={a.href + a.labelKa} href={a.href} className="btn btn-primary text-xs">
                    {a.labelKa}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="label mb-1.5">დაკავშირებული აგენტები</p>
              <div className="flex flex-wrap gap-1.5">
                {active.connectedAgents.map((id) => {
                  const a = AGENTS.find((x) => x.id === id);
                  return (
                    <span key={id} className="chip">
                      <span className="font-mono text-cyan">{id}</span>
                      {a?.nameKa}
                    </span>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel title="ჰოსპიტლის სამეთაურო ცენტრი" subtitle="გეგმილი ფენა — რეალურ დროში მაჩვენებლები საჭიროებს HIS/EHR ინტეგრაციას">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {[
                ['დატვირთვა', 'workload'],
                ['ლოდინის დრო', 'waiting'],
                ['საოპერაციო', 'OR'],
                ['ICU ადგილები', 'ICU'],
                ['დაგვიანებული კვლევები', 'delayed tests'],
                ['კრიტიკული ანალიზები', 'critical labs'],
                ['ინციდენტები', 'incidents'],
                ['საჩივრები', 'complaints'],
                ['QMS ინდიკატორები', 'QMS'],
                ['სერვისის ხაზები', 'service lines'],
                ['რესურსის გამოყენება', 'utilisation'],
                ['ხარისხის აუდიტები', 'audits'],
              ].map(([ka, en]) => (
                <div key={en} className="panel-tight px-3 py-2.5">
                  <p className="text-[13px] text-slate-200">{ka}</p>
                  <p className="text-[10px] text-slate-600">{en}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              მენეჯმენტის ფენა აერთიანებს კლინიკურ და ოპერაციულ მონაცემებს. მაჩვენებლების რეალურ დროში ჩვენება საჭიროებს ინტეგრაციას დაწესებულების HIS/EHR სისტემასთან — არქიტექტურა FHIR-ზეა მომზადებული.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="info">FHIR-ready</Badge>
              <Badge>ინტეგრაცია მომავალ ეტაპზე</Badge>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
