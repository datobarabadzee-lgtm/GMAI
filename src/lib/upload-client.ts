import { UPLOAD_MAX_TOTAL_BYTES, checkUpload, mb } from '@/lib/upload-limits';

/**
 * Browser side of /api/parse (audit F16). Checks the same limits as the server
 * before sending, so an oversized selection is refused with a clear message
 * instead of a platform error page, and turns any non-JSON refusal from the
 * hosting layer (e.g. Vercel's 413 "Request Entity Too Large") into one.
 */
export type ParsedFile = { ok: true; name: string; text: string } | { ok: false; name: string; code?: string; messageKa: string };
export type UploadOutcome = { ok: true; results: ParsedFile[] } | { ok: false; messageKa: string };

export async function uploadForParsing(list: FileList | File[], fetcher: typeof fetch = fetch): Promise<UploadOutcome> {
  const files = Array.from(list);
  const check = checkUpload(files);
  if (!check.ok) return { ok: false, messageKa: check.messageKa };
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  let res: Response;
  try {
    res = await fetcher('/api/parse', { method: 'POST', body: fd });
  } catch {
    return { ok: false, messageKa: 'სერვერთან კავშირი ვერ დამყარდა.' };
  }
  let json: { results?: ParsedFile[]; messageKa?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    if (res.status === 413) return { ok: false, messageKa: json?.messageKa ?? `ფაილის ზომა აღემატება დასაშვებ ${mb(UPLOAD_MAX_TOTAL_BYTES)}-ს.` };
    return { ok: false, messageKa: json?.messageKa ?? 'ფაილის დამუშავება ვერ მოხერხდა.' };
  }
  return { ok: true, results: json.results ?? [] };
}

export const UPLOAD_HINT_KA = `მაქსიმუმ ${mb(UPLOAD_MAX_TOTAL_BYTES)} ჯამში · ფაილები მუშავდება მეხსიერებაში და არ ინახება`;
