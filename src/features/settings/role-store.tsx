'use client';

import { PROFESSIONAL_ATTESTATION_VERSION } from '@/knowledge/controller';
import { SESSION_CLEARED_EVENT } from './session-clear';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@/components/layout/nav';

/**
 * VISITOR ROLE AND OPTIONAL OWN API KEY
 *
 * Both live in the browser only. The role is a presentation choice; the key is
 * the visitor's own credential, held in sessionStorage so it disappears when
 * the tab closes, attached to requests as a header and never persisted, logged
 * or echoed back by the server.
 *
 * Deliberately no account, no profile, no server-side record: the moment this
 * app stores an identifier it becomes a controller of personal data under the
 * Georgian data-protection law, with every obligation that follows.
 */

const ROLE_KEY = 'gmai.role.v1';
const APIKEY_KEY = 'gmai.userkey.v1';

type Ctx = {
  role: Role | null;
  setRole: (r: Role | null) => void;
  loading: boolean;
  userKey: string;
  setUserKey: (k: string) => void;
  clearUserKey: () => void;
  authHeaders: () => Record<string, string>;
  /** Professional attestation for sending patient data to the AI provider (audit F07). */
  attested: boolean;
  attest: () => void;
  revokeAttestation: () => void;
};

const ATTEST_KEY = 'gmai.attestation.v1';

const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [userKey, setUserKeyState] = useState('');
  const [loading, setLoading] = useState(true);
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    try {
      const r = window.localStorage.getItem(ROLE_KEY);
      if (r === 'patient' || r === 'clinician' || r === 'quality' || r === 'student') setRoleState(r);
      const k = window.sessionStorage.getItem(APIKEY_KEY);
      if (k) setUserKeyState(k);
      if (window.sessionStorage.getItem(ATTEST_KEY) === PROFESSIONAL_ATTESTATION_VERSION) setAttested(true);
    } catch {
      /* private mode or blocked storage — the app works without either */
    }
    setLoading(false);
  }, []);

  const setRole = useCallback((r: Role | null) => {
    setRoleState(r);
    try {
      if (r) window.localStorage.setItem(ROLE_KEY, r);
      else window.localStorage.removeItem(ROLE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setUserKey = useCallback((k: string) => {
    const trimmed = k.trim();
    setUserKeyState(trimmed);
    try {
      if (trimmed) window.sessionStorage.setItem(APIKEY_KEY, trimmed);
      else window.sessionStorage.removeItem(APIKEY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const clearUserKey = useCallback(() => setUserKey(''), [setUserKey]);

  // Held for the browser session only; cleared with the session (session-clear.ts).
  const attest = useCallback(() => {
    setAttested(true);
    try {
      window.sessionStorage.setItem(ATTEST_KEY, PROFESSIONAL_ATTESTATION_VERSION);
    } catch {
      /* kept in memory for this page */
    }
  }, []);
  const revokeAttestation = useCallback(() => {
    setAttested(false);
    try {
      window.sessionStorage.removeItem(ATTEST_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onClear = () => setAttested(false);
    window.addEventListener(SESSION_CLEARED_EVENT, onClear);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onClear);
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (userKey) h['x-user-api-key'] = userKey;
    // Asserts which version of the consent text this visitor agreed to; the
    // server refuses health-data processing without it.
    try {
      const raw = window.localStorage.getItem('gmai.consent.v1');
      if (raw) {
        const rec = JSON.parse(raw) as { version?: string };
        if (rec?.version) h['x-consent-version'] = rec.version;
      }
    } catch {
      /* blocked storage — the request is refused and the gate asks again */
    }
    if (attested) h['x-processing-attestation'] = PROFESSIONAL_ATTESTATION_VERSION;
    return h;
  }, [userKey, attested]);

  const value = useMemo(
    () => ({ role, setRole, loading, userKey, setUserKey, clearUserKey, authHeaders, attested, attest, revokeAttestation }),
    [role, setRole, loading, userKey, setUserKey, clearUserKey, authHeaders, attested, attest, revokeAttestation],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): Ctx {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
