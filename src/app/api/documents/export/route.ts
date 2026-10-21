import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PatientContextSchema, emptyPatientContext } from '@/schemas/clinical';
import { templateById } from '@/knowledge/document-templates';
import { buildDocx } from '@/services/document-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  templateId: z.string().min(1),
  patient: PatientContextSchema.optional(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).max(60).default([]),
  author: z.string().max(200).default(''),
  institution: z.string().max(200).default(''),
  date: z.string().max(40).default(''),
});

/** SOP-family documents carry the registration block the clinic's standard requires. */
const GOVERNED = new Set(['sop', 'protocol', 'guideline-draft', 'algorithm']);

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', messageKa: 'მოთხოვნის ფორმატი არასწორია.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', messageKa: 'მოწოდებული მონაცემები არ შეესაბამება სქემას.' }, { status: 422 });
  }

  const template = templateById(parsed.data.templateId);
  if (!template) {
    return NextResponse.json({ error: 'UNKNOWN_TEMPLATE', messageKa: 'ასეთი დოკუმენტის შაბლონი არ არსებობს.' }, { status: 404 });
  }

  const date = parsed.data.date || new Date().toLocaleDateString('ka-GE');
  const sections = parsed.data.sections.length
    ? parsed.data.sections
    : template.sections.map((heading) => ({ heading, body: '' }));

  try {
    const buffer = await buildDocx({
      template,
      patient: parsed.data.patient ?? emptyPatientContext(),
      sections,
      author: parsed.data.author,
      institution: parsed.data.institution,
      date,
      governance: GOVERNED.has(template.id)
        ? [
            { label: 'სარეგისტრაციო ნომერი', value: `${template.id.toUpperCase()}-001` },
            { label: 'ვერსია', value: '1.0' },
            { label: 'გამოცემის თარიღი', value: '01/09/2024' },
            { label: 'ძალაში შესვლის თარიღი', value: '01/09/2024' },
            { label: 'შემდეგი განხილვის თარიღი', value: '01/09/2026' },
            { label: 'დაამტკიცა', value: parsed.data.author || 'Davit Barabadze' },
          ]
        : undefined,
    });

    const name = `${template.nameEn.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${Date.now()}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'EXPORT_FAILED', messageKa: 'დოკუმენტის ფაილად აწყობა ვერ მოხერხდა.', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
