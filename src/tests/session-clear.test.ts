import { describe, expect, it, vi } from 'vitest';

/** F07: withdrawal / clear removes every patient-session key and notifies in-memory holders. */
describe('clearPatientSession', () => {
  it('removes case, threads, confirmed products and attestation, and emits the event', async () => {
    const store = new Map<string, string>([
      ['gmai.case.session.v1', '{}'], ['gmai.clinical.thread.v3', '[]'], ['gmai.med.confirmed.v1', '{}'], ['gmai.med.confirmed.ema.v1', '{}'], ['gmai.attestation.v1', 'x'], ['unrelated', '1'],
    ]);
    const events: string[] = [];
    vi.stubGlobal('window', {
      sessionStorage: { removeItem: (k: string) => store.delete(k) },
      dispatchEvent: (e: Event) => events.push(e.type),
    });
    vi.stubGlobal('Event', class { constructor(public type: string) {} });
    const { clearPatientSession, SESSION_CLEARED_EVENT } = await import('@/features/settings/session-clear');
    clearPatientSession();
    expect([...store.keys()]).toEqual(['unrelated']);
    expect(events).toEqual([SESSION_CLEARED_EVENT]);
    vi.unstubAllGlobals();
  });
});
