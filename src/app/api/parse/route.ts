import { NextResponse } from 'next/server';
import { ParseError, extractFacts, parseFile } from '@/lib/parsers';
import { UPLOAD_MAX_TOTAL_BYTES, checkUpload, mb } from '@/lib/upload-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Refuse an oversized body before reading it (audit F16).
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > UPLOAD_MAX_TOTAL_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE', messageKa: `მოთხოვნის ზომა აღემატება დასაშვებ ${mb(UPLOAD_MAX_TOTAL_BYTES)}-ს. ატვირთეთ ნაწილ-ნაწილ ან ჩასვით ტექსტი პირდაპირ.` }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM', messageKa: 'ფაილის მიღება ვერ მოხერხდა.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  const check = checkUpload(files);
  if (!check.ok) return NextResponse.json({ error: check.error, messageKa: check.messageKa }, { status: check.status });

  const results = await Promise.all(
    files.map(async (f) => {
      try {
        const parsed = await parseFile(f.name, await f.arrayBuffer(), f.type);
        return { ok: true as const, ...parsed, facts: extractFacts(parsed.text) };
      } catch (e) {
        if (e instanceof ParseError) return { ok: false as const, name: f.name, code: e.code, messageKa: e.messageKa };
        return { ok: false as const, name: f.name, code: 'UNREADABLE', messageKa: 'ფაილის დამუშავება ვერ მოხერხდა.' };
      }
    }),
  );

  return NextResponse.json({ results, noticeKa: 'ფაილები დამუშავდა მეხსიერებაში და სერვერზე არ შენახულა.' });
}
