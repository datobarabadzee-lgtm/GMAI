/** JSON POST for the medication pages; the server's Georgian message is passed through. */
export async function post<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: T & { messageKa?: string; error?: string } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** localStorage helpers; storage may be unavailable (private mode) — callers keep working in memory. */
export function readLocal<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
export function writeLocal(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* in-page state still works until reload */
  }
}
