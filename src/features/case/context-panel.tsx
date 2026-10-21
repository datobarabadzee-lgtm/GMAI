'use client';

import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { useCase } from './case-store';
import { uid } from '@/lib/utils';
import type { LabValue, Medication } from '@/schemas/clinical';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function ListEditor({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <Row label={label}>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              className="field"
              value={v}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button type="button" aria-label="წაშლა" className="btn btn-ghost px-2" onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost w-full text-xs" onClick={() => onChange([...values, ''])}>
          <Plus className="h-3.5 w-3.5" /> {placeholder}
        </button>
      </div>
    </Row>
  );
}

export function ClinicalContextPanel({ compact = false }: { compact?: boolean }) {
  const { patient, update } = useCase();

  const setMed = (i: number, patch: Partial<Medication>) => {
    const next = [...patient.medications];
    next[i] = { ...next[i], ...patch };
    update('medications', next);
  };
  const setLab = (i: number, patch: Partial<LabValue>) => {
    const next = [...patient.labs];
    next[i] = { ...next[i], ...patch };
    update('labs', next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-clinical-moderate/35 bg-clinical-moderate/5 p-2.5">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clinical-moderate" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          არ შეიყვანოთ პაციენტის პირდაპირი საიდენტიფიკაციო მონაცემები, თუ ეს აუცილებელი არ არის. მონაცემები ინახება მხოლოდ ბრაუზერის სესიაში.
        </p>
      </div>

      <Row label="ქეისის სახელი">
        <input className="field" value={patient.label} onChange={(e) => update('label', e.target.value)} />
      </Row>

      <div className="grid grid-cols-2 gap-2">
        <Row label="ასაკი">
          <input className="field" type="number" min={0} max={130} value={patient.age ?? ''} onChange={(e) => update('age', e.target.value === '' ? null : Number(e.target.value))} />
        </Row>
        <Row label="სქესი">
          <select className="field" value={patient.sex} onChange={(e) => update('sex', e.target.value as typeof patient.sex)}>
            <option value="unspecified">მიუთითებელი</option>
            <option value="male">მამრობითი</option>
            <option value="female">მდედრობითი</option>
          </select>
        </Row>
        <Row label="ორსულობა">
          <select className="field" value={patient.pregnant} onChange={(e) => update('pregnant', e.target.value as typeof patient.pregnant)}>
            <option value="not-applicable">არ ეხება</option>
            <option value="no">არა</option>
            <option value="yes">დიახ</option>
            <option value="unknown">უცნობი</option>
          </select>
        </Row>
        <Row label="წონა (კგ)">
          <input className="field" type="number" min={0} step="0.1" value={patient.weightKg ?? ''} onChange={(e) => update('weightKg', e.target.value === '' ? null : Number(e.target.value))} />
        </Row>
        <Row label="სიმაღლე (სმ)">
          <input className="field" type="number" min={0} step="0.5" value={patient.heightCm ?? ''} onChange={(e) => update('heightCm', e.target.value === '' ? null : Number(e.target.value))} />
        </Row>
        <Row label="კრეატინინი (მგ/დლ)">
          <input className="field" type="number" min={0} step="0.01" value={patient.creatinineMgDl ?? ''} onChange={(e) => update('creatinineMgDl', e.target.value === '' ? null : Number(e.target.value))} />
        </Row>
        <Row label="eGFR">
          <input className="field" type="number" min={0} step="1" value={patient.egfr ?? ''} onChange={(e) => update('egfr', e.target.value === '' ? null : Number(e.target.value))} />
        </Row>
        <Row label="ღვიძლის ფუნქცია">
          <select className="field" value={patient.hepaticImpairment} onChange={(e) => update('hepaticImpairment', e.target.value as typeof patient.hepaticImpairment)}>
            <option value="unknown">უცნობი</option>
            <option value="none">ნორმა</option>
            <option value="mild">მსუბუქი</option>
            <option value="moderate">ზომიერი</option>
            <option value="severe">მძიმე</option>
          </select>
        </Row>
      </div>

      <ListEditor label="ალერგიები" values={patient.allergies} onChange={(v) => update('allergies', v)} placeholder="ალერგიის დამატება" />
      <ListEditor label="აქტიური პრობლემები / დიაგნოზები" values={patient.problems} onChange={(v) => update('problems', v)} placeholder="პრობლემის დამატება" />

      <Row label="მედიკამენტები">
        <div className="space-y-2">
          {patient.medications.map((m, i) => (
            <div key={m.id} className="rounded-lg border border-line bg-ink-950/50 p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <input className="field col-span-2" placeholder="დასახელება" value={m.drug} onChange={(e) => setMed(i, { drug: e.target.value })} />
                <input className="field" placeholder="დოზა" value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} />
                <input className="field" placeholder="სიხშირე" value={m.frequency} onChange={(e) => setMed(i, { frequency: e.target.value })} />
                <input className="field col-span-2" placeholder="ჩვენება" value={m.indication} onChange={(e) => setMed(i, { indication: e.target.value })} />
                <select className="field" value={m.status} onChange={(e) => setMed(i, { status: e.target.value as Medication['status'] })}>
                  <option value="active">აქტიური</option>
                  <option value="stopped">შეწყვეტილი</option>
                  <option value="held">შეჩერებული</option>
                  <option value="unknown">უცნობი</option>
                </select>
                <button type="button" className="btn btn-ghost text-xs" onClick={() => update('medications', patient.medications.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" /> წაშლა
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost w-full text-xs"
            onClick={() => update('medications', [...patient.medications, { id: uid(), drug: '', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' }])}
          >
            <Plus className="h-3.5 w-3.5" /> მედიკამენტის დამატება
          </button>
        </div>
      </Row>

      {!compact && (
        <Row label="ლაბორატორია">
          <div className="space-y-2">
            {patient.labs.map((l, i) => (
              <div key={l.id} className="grid grid-cols-4 gap-1.5">
                <input className="field col-span-2" placeholder="მაჩვენებელი" value={l.analyte} onChange={(e) => setLab(i, { analyte: e.target.value })} />
                <input className="field" type="number" step="0.01" placeholder="მნიშვნელობა" value={l.value} onChange={(e) => setLab(i, { value: Number(e.target.value) })} />
                <input className="field" placeholder="ერთეული" value={l.unit} onChange={(e) => setLab(i, { unit: e.target.value })} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost w-full text-xs" onClick={() => update('labs', [...patient.labs, { id: uid(), analyte: '', value: 0, unit: '', date: '' }])}>
              <Plus className="h-3.5 w-3.5" /> მაჩვენებლის დამატება
            </button>
          </div>
        </Row>
      )}

      <Row label="კლინიკური აღწერა">
        <textarea className="field min-h-[110px] resize-y" value={patient.narrative} onChange={(e) => update('narrative', e.target.value)} placeholder="აღწერეთ ქეისი: ჩივილები, ანამნეზი, ობიექტური სტატუსი, დინამიკა…" />
      </Row>

      {patient.documents.length > 0 && (
        <Row label="მიმაგრებული დოკუმენტები">
          <ul className="space-y-1">
            {patient.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded border border-line bg-ink-950/50 px-2 py-1.5 text-xs text-slate-300">
                <span className="truncate">{d.name}</span>
                <button type="button" className="text-slate-500 hover:text-clinical-critical" onClick={() => update('documents', patient.documents.filter((x) => x.id !== d.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Row>
      )}
    </div>
  );
}
