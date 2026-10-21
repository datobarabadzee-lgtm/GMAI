/**
 * Everything this browser holds from a working session with patient data
 * (audit F07). Called on consent withdrawal and on an explicit „clear
 * session": the case, the conversation threads, confirmed-product references
 * and the professional attestation. Components holding the same data in memory
 * listen for the event and reset.
 */
export const SESSION_CLEARED_EVENT = 'gmai:session-cleared';

const SESSION_KEYS = [
  'gmai.case.session.v1',
  'gmai.clinical.thread.v3',
  'gmai.clinical.thread.v2',
  'gmai.patient.thread.v1',
  'gmai.med.confirmed.v1',
  'gmai.med.confirmed.ema.v1',
  'gmai.attestation.v1',
];

export function clearPatientSession() {
  try {
    for (const k of SESSION_KEYS) window.sessionStorage.removeItem(k);
  } catch {
    /* storage blocked — nothing persisted there */
  }
  try {
    window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
  } catch {
    /* not in a browser */
  }
}
