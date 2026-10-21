'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { emptyPatientContext, PatientContextSchema, type PatientContext } from '@/schemas/clinical';

/**
 * TEMPORARY CASE SESSION.
 * Patient data lives in the browser session only. Nothing is written to a
 * server database by default; sessionStorage is cleared when the tab closes.
 */

const KEY = 'gmai.case.session.v1';

type CaseState = {
  patient: PatientContext;
  setPatient: (p: PatientContext) => void;
  update: <K extends keyof PatientContext>(key: K, value: PatientContext[K]) => void;
  reset: () => void;
  loaded: boolean;
};

const Ctx = createContext<CaseState | null>(null);

export function CaseProvider({ children }: { children: React.ReactNode }) {
  const [patient, setPatientState] = useState<PatientContext>(() => emptyPatientContext());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = PatientContextSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setPatientState(parsed.data);
      }
    } catch {
      /* storage unavailable — the app still works, data simply is not restored */
    }
    setLoaded(true);
  }, []);

  const setPatient = useCallback((p: PatientContext) => {
    setPatientState(p);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback(
    <K extends keyof PatientContext>(key: K, value: PatientContext[K]) => {
      setPatientState((prev) => {
        const next = { ...prev, [key]: value };
        try {
          sessionStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    const fresh = emptyPatientContext();
    setPatientState(fresh);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ patient, setPatient, update, reset, loaded }), [patient, setPatient, update, reset, loaded]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCase(): CaseState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCase must be used inside CaseProvider');
  return ctx;
}
