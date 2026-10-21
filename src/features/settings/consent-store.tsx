'use client';

import { useCallback, useEffect, useState } from 'react';
import { CONSENT_VERSION } from '@/knowledge/controller';

/**
 * CONSENT RECORD
 *
 * Article 3(l) requires consent to be an active, informed, unambiguous act for
 * specified purposes; Articles 6(1)(a) and 37(2)(d) require it in writing, and
 * electronic form satisfies that. Article 20 requires withdrawal at any time,
 * without explanation, in the same form in which it was given.
 *
 * The record is kept on the data subject's own device, with the version of the
 * text they were shown and the moment they affirmed it. Keeping it server-side
 * would mean building the identifiable store this architecture exists to avoid.
 *
 * TRADE-OFF, STATED PLAINLY: a local record is weaker for demonstrating consent
 * to a regulator than a server-side one. It is chosen because the alternative —
 * a database of who consented and when — creates a larger and more sensitive
 * exposure than it resolves, for a service that stores nothing else. If the
 * platform ever stores clinical data, this decision must be revisited.
 */

const KEY = 'gmai.consent.v1';

export type ConsentRecord = {
  version: string;
  grantedAtIso: string;
  /** Each affirmed statement, recorded as shown, so the record is self-describing. */
  pointsKa: string[];
};

export function useConsent() {
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConsentRecord;
        // Consent is tied to the text that was shown. A changed disclosure means
        // the subject never agreed to the current terms, so it is asked again.
        if (parsed?.version === CONSENT_VERSION) setRecord(parsed);
      }
    } catch {
      /* blocked storage — the gate simply asks again */
    }
    setLoading(false);
  }, []);

  const grant = useCallback((pointsKa: string[]) => {
    const next: ConsentRecord = {
      version: CONSENT_VERSION,
      grantedAtIso: new Date().toISOString(),
      pointsKa,
    };
    setRecord(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* consent still holds for this session even if it cannot be persisted */
    }
  }, []);

  const withdraw = useCallback(() => {
    setRecord(null);
    try {
      window.localStorage.removeItem(KEY);
      // Withdrawal must also clear what the browser holds from the session.
      window.sessionStorage.removeItem('gmai.case.session.v1');
    } catch {
      /* ignore */
    }
  }, []);

  return { consent: record, granted: Boolean(record), loading, grant, withdraw };
}
