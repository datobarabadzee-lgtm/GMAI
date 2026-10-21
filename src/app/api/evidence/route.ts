import { NextResponse } from 'next/server';
import { RetrievalQuerySchema } from '@/schemas/evidence';
import { retrieve } from '@/services/retrieval';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', messageKa: 'მოთხოვნის ფორმატი არასწორია.' }, { status: 400 });
  }
  const parsed = RetrievalQuerySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues }, { status: 422 });

  const hits = retrieve(parsed.data);
  if (!hits.length) {
    return NextResponse.json({ hits: [], messageKa: 'ამ კრიტერიუმებით რეესტრში წყარო ვერ მოიძებნა. გაფართოვდეს ფილტრები ან შეიცვალოს საკვანძო ტერმინები.' });
  }
  return NextResponse.json({ hits });
}
