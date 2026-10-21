import { NextResponse } from 'next/server';
import { ParseError, extractFacts, parseFile } from '@/lib/parsers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload limits. The endpoint is reachable from the open internet and parses
 * PDF and DOCX in memory, so a request is bounded before any parsing starts.
 */
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM', messageKa: 'ფაილის მიღება ვერ მოხერხდა.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'NO_FILES', messageKa: 'ფაილი არ არის მიმაგრებული.' }, { status: 400 });

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: 'TOO_MANY_FILES', messageKa: `ერთდროულად მაქსიმუმ ${MAX_FILES} ფაილია შესაძლებელი.` },
      { status: 413 },
    );
  }
  const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
  if (oversized) {
    return NextResponse.json(
      { error: 'FILE_TOO_LARGE', messageKa: `ფაილი „${oversized.name}" აღემატება ${MAX_FILE_BYTES / 1024 / 1024} MB-ს.` },
      { status: 413 },
    );
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: 'PAYLOAD_TOO_LARGE', messageKa: `ფაილების ჯამური ზომა აღემატება ${MAX_TOTAL_BYTES / 1024 / 1024} MB-ს.` },
      { status: 413 },
    );
  }

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
