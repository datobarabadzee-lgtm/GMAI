import { describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { emptyPatientContext } from '@/schemas/clinical';
import { guardDocument, EMPTY_MARK } from '@/services/document-guard';

/** F08 (audit 2026-10-21): document generation may only write up supplied facts. */

let modelText = '';
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const provider = {
    name: 'test', live: true,
    info: () => ({ engine: 'live', provider: 'test', fast: 'm', reasoning: 'm' }),
    complete: async () => 'hypertension guideline',
    completeDetailed: async () => ({ text: modelText, model: 'test-model', usage: { ...real.EMPTY_USAGE }, latencyMs: 1, truncated: false }),
  };
  return { ...real, getProvider: () => provider, getProviderFor: () => ({ provider, ownKey: false }) };
});

describe('guardDocument', () => {
  const supplied = 'ასაკი 64 წლის. არტერიული ჰიპერტენზია. ამლოდიპინი 5 მგ დღეში ერთხელ. 2026-10-01 წნევა 150/95.';
  it('keeps reworded supplied facts', () => {
    const r = guardDocument([{ heading: 'დიაგნოზი', body: 'პაციენტს აღენიშნება არტერიული ჰიპერტენზია. იღებს ამლოდიპინს 5 მგ დღეში ერთხელ.' }], supplied);
    expect(r.removed).toEqual([]);
    expect(r.sections[0].body).toMatch(/ამლოდიპინს 5 მგ/);
  });
  it('removes a new dose, drug, date, ICD code or diagnosis, and says why', () => {
    const r = guardDocument(
      [
        { heading: 'მკურნალობა', body: 'ამლოდიპინი 10 მგ დღეში ერთხელ. დაემატა ლიზინოპრილი.' },
        { heading: 'კოდი', body: 'ICD-10: I10. შემდეგი ვიზიტი 2026-12-01.' },
        { heading: 'დასკვნა', body: 'აღენიშნება შაქრიანი დიაბეტი.' },
      ],
      supplied,
    );
    const reasons = r.removed.map((x) => x.reasonKa).join(' | ');
    expect(reasons).toMatch(/10 მგ/);
    expect(reasons).toMatch(/პრეპარატი/);
    expect(reasons).toMatch(/I10/);
    expect(reasons).toMatch(/დიაგნოზი/);
    expect(r.sections[2].body).toBe(EMPTY_MARK);
    expect(r.sections.map((s) => s.body).join(' ')).not.toMatch(/10 მგ|ლიზინოპრილ|I10|დიაბეტ/);
  });
});

describe('/api/documents/generate → /api/documents/export', () => {
  it('stops invented content on the server, attributes the run to A12, and exports a draft', async () => {
    modelText = JSON.stringify({ sections: [
      { heading: 'დიაგნოზი', body: 'არტერიული ჰიპერტენზია. თანმხლები: გულის იშემიური დაავადება.' },
      { heading: 'მკურნალობა', body: 'ამლოდიპინი 5 მგ დღეში ერთხელ. დაინიშნა ატორვასტატინი 40 მგ.' },
    ] });
    const { templateById } = await import('@/knowledge/document-templates');
    const { DOC_TEMPLATES } = await import('@/knowledge/document-templates');
    const t = DOC_TEMPLATES.find((x) => x.sections.length >= 2)!;
    // Use the template's own headings.
    modelText = JSON.stringify({ sections: [
      { heading: t.sections[0], body: 'არტერიული ჰიპერტენზია. თანმხლები: შაქრიანი დიაბეტი.' },
      { heading: t.sections[1], body: 'ამლოდიპინი 5 მგ დღეში ერთხელ. დაინიშნა ატორვასტატინი 40 მგ.' },
    ] });
    expect(templateById(t.id)).toBeTruthy();
    const { POST } = await import('@/app/api/documents/generate/route');
    const { PROFESSIONAL_ATTESTATION_VERSION } = await import('@/knowledge/controller');
    const res = await POST(new Request('http://localhost/api/documents/generate', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-processing-attestation': PROFESSIONAL_ATTESTATION_VERSION },
      body: JSON.stringify({ templateId: t.id, patient: { ...emptyPatientContext(), problems: ['არტერიული ჰიპერტენზია'], medications: [{ id: 'm', drug: 'ამლოდიპინი', dose: '5 მგ', frequency: 'დღეში ერთხელ', route: '', indication: '', startDate: '', status: 'active' }] } }),
    }));
    const json = await res.json();
    const text = JSON.stringify(json.sections);
    expect(text).not.toMatch(/ატორვასტატინ|40 მგ|დიაბეტ/);
    expect(text).toMatch(/ამლოდიპინი 5 მგ/);
    expect(json.removed.length).toBeGreaterThanOrEqual(2);
    expect(json.documentState).toBe('draft_requires_clinician_review');

    const { POST: EXPORT } = await import('@/app/api/documents/export/route');
    const ex = await EXPORT(new Request('http://localhost/api/documents/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: t.id, sections: json.sections }) }));
    expect(ex.status).toBe(200);
    const xml = docxText(Buffer.from(await ex.arrayBuffer()));
    expect(xml).toMatch(/სტატუსი: პროექტი/);
    expect(xml).not.toMatch(/ატორვასტატინ/);
  });
});

/** Extracts word/document.xml from a .docx (zip) without dependencies. */
function docxText(buf: Buffer): string {
  let i = 0;
  while (i < buf.length - 30) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const method = buf.readUInt16LE(i + 8);
    const csize = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const xlen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString();
    const start = i + 30 + nlen + xlen;
    if (name === 'word/document.xml') {
      const data = buf.subarray(start, start + csize);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    i = start + csize;
  }
  return '';
}
