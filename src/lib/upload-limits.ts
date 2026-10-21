/**
 * UPLOAD LIMITS (audit F16, 2026-10-21)
 *
 * Files are posted directly to a server function. On Vercel a function's
 * request body is limited to 4.5 MB, so promising 10 MB per file / 25 MB in
 * total on that path was untrue: such a request never reaches the code.
 *
 * The total request is therefore capped at 4.0 MB by default (multipart
 * overhead stays under 4.5 MB). A self-hosted deployment whose reverse proxy
 * and runtime accept more may raise it with NEXT_PUBLIC_UPLOAD_MAX_TOTAL_MB
 * (read by both the browser and the server, so they always agree). No
 * persistent file store is used: files are parsed in memory and discarded.
 */
const MB = 1024 * 1024;
const configured = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_TOTAL_MB);
export const UPLOAD_MAX_TOTAL_BYTES = Number.isFinite(configured) && configured > 0 ? Math.floor(configured * MB) : 4 * MB;
export const UPLOAD_MAX_FILE_BYTES = UPLOAD_MAX_TOTAL_BYTES;
export const UPLOAD_MAX_FILES = 5;

export const mb = (bytes: number) => `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;

/** Same check in the browser (before sending) and on the server. */
export function checkUpload(files: { name: string; size: number }[]): { ok: true } | { ok: false; error: 'NO_FILES' | 'TOO_MANY_FILES' | 'FILE_TOO_LARGE' | 'PAYLOAD_TOO_LARGE'; status: 400 | 413; messageKa: string } {
  if (!files.length) return { ok: false, error: 'NO_FILES', status: 400, messageKa: 'ფაილი არ არის მიმაგრებული.' };
  if (files.length > UPLOAD_MAX_FILES) return { ok: false, error: 'TOO_MANY_FILES', status: 413, messageKa: `ერთდროულად მაქსიმუმ ${UPLOAD_MAX_FILES} ფაილია შესაძლებელი.` };
  const big = files.find((f) => f.size > UPLOAD_MAX_FILE_BYTES);
  if (big) return { ok: false, error: 'FILE_TOO_LARGE', status: 413, messageKa: `ფაილი „${big.name}“ (${mb(big.size)}) აღემატება დასაშვებ ${mb(UPLOAD_MAX_FILE_BYTES)}-ს. შეამცირეთ ზომა (მაგ. მხოლოდ საჭირო გვერდები) ან ჩასვით ტექსტი პირდაპირ.` };
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > UPLOAD_MAX_TOTAL_BYTES) return { ok: false, error: 'PAYLOAD_TOO_LARGE', status: 413, messageKa: `ფაილების ჯამური ზომა (${mb(total)}) აღემატება დასაშვებ ${mb(UPLOAD_MAX_TOTAL_BYTES)}-ს. ატვირთეთ ნაწილ-ნაწილ.` };
  return { ok: true };
}
