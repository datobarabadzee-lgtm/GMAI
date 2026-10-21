import 'server-only';

/** FILE PARSING — PDF, DOCX, TXT, Markdown, CSV. Files are processed in memory. */

export type ParsedFile = {
  name: string;
  type: string;
  bytes: number;
  text: string;
  pages?: number;
  warningKa?: string;
};

export class ParseError extends Error {
  constructor(
    message: string,
    readonly code: 'UNSUPPORTED_TYPE' | 'UNREADABLE' | 'EMPTY' | 'TOO_LARGE',
    readonly messageKa: string,
  ) {
    super(message);
  }
}

export const MAX_BYTES = 20 * 1024 * 1024;

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

export async function parseFile(name: string, buffer: ArrayBuffer, mime = ''): Promise<ParsedFile> {
  const bytes = buffer.byteLength;
  if (bytes > MAX_BYTES) throw new ParseError('too large', 'TOO_LARGE', `ფაილი აღემატება ${Math.round(MAX_BYTES / 1024 / 1024)} MB ზღვარს.`);
  const ext = extOf(name);

  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || mime.startsWith('text/plain')) {
    const text = new TextDecoder('utf-8').decode(buffer).trim();
    if (!text) throw new ParseError('empty', 'EMPTY', 'ფაილი ცარიელია ან ტექსტი ვერ წაიკითხა.');
    return { name, type: ext || 'txt', bytes, text };
  }

  if (ext === 'csv' || ext === 'tsv') {
    const raw = new TextDecoder('utf-8').decode(buffer).trim();
    if (!raw) throw new ParseError('empty', 'EMPTY', 'CSV ფაილი ცარიელია.');
    return { name, type: 'csv', bytes, text: raw };
  }

  if (ext === 'docx') {
    try {
      const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      const text = (result.value ?? '').trim();
      if (!text) throw new ParseError('empty', 'EMPTY', 'DOCX ფაილიდან ტექსტი ვერ ამოიკითხა (შესაძლოა შეიცავს მხოლოდ სურათებს).');
      return { name, type: 'docx', bytes, text };
    } catch (e) {
      if (e instanceof ParseError) throw e;
      throw new ParseError('docx failed', 'UNREADABLE', 'DOCX ფაილის წაკითხვა ვერ მოხერხდა — ფაილი შეიძლება იყოს დაზიანებული ან დაცული.');
    }
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const { text, totalPages } = await extractText(doc, { mergePages: true });
      const merged = (Array.isArray(text) ? text.join('\n') : text).trim();
      if (!merged) {
        return {
          name,
          type: 'pdf',
          bytes,
          text: '',
          pages: totalPages,
          warningKa: 'PDF-ში ტექსტური შრე ვერ მოიძებნა. სავარაუდოდ ეს არის სკანირებული დოკუმენტი და საჭიროა OCR — ტექსტური ანალიზი ვერ ჩატარდება.',
        };
      }
      return { name, type: 'pdf', bytes, text: merged, pages: totalPages };
    } catch {
      throw new ParseError('pdf failed', 'UNREADABLE', 'PDF ფაილის წაკითხვა ვერ მოხერხდა — ფაილი შეიძლება იყოს დაშიფრული ან დაზიანებული.');
    }
  }

  throw new ParseError('unsupported', 'UNSUPPORTED_TYPE', `ფორმატი „${ext || mime || 'უცნობი'}“ არ არის მხარდაჭერილი. დაშვებულია: PDF, DOCX, TXT, Markdown, CSV.`);
}

/** Extract structured clinical facts from free text — deterministic pattern layer. */
export type ExtractedFacts = {
  diagnoses: string[];
  medications: string[];
  investigations: string[];
  procedures: string[];
  dates: string[];
  inconsistencies: string[];
};

const DIAGNOSIS_RE = /(?:დიაგნოზ[იას]?\s*[:—-]\s*)([^\n.;]{4,140})/gi;
const MED_RE = /(?:^|\n|\s)(?:ინიშნება|დანიშნულ[ია]|იღებს|თერაპია)\s*[:—-]?\s*([^\n.;]{3,140})/gi;
const INV_RE = /(?:ეკგ|ექოსკოპ|რენტგენ|კტ|მრტ|ულტრაბგერ|ანალიზ|ლაბორატორიულ|ტროპონინ|ჰემოგლობინ|კრეატინინ)[^\n.;]{0,90}/gi;
const PROC_RE = /(?:ოპერაცი|პროცედურ|ბიოფსი|კათეტერიზაცი|ინტუბაცი|პუნქცი|გადატან)[^\n.;]{0,90}/gi;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g;

export function extractFacts(text: string): ExtractedFacts {
  const grab = (re: RegExp, group = 0) => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const v = (m[group] ?? m[0]).trim();
      if (v && !out.includes(v)) out.push(v);
      if (out.length > 40) break;
    }
    return out;
  };

  const diagnoses = grab(DIAGNOSIS_RE, 1);
  const medications = grab(MED_RE, 1);
  const investigations = grab(INV_RE);
  const procedures = grab(PROC_RE);
  const dates = grab(DATE_RE);

  const inconsistencies: string[] = [];
  if (!diagnoses.length) inconsistencies.push('დოკუმენტში ცალსახად ფორმულირებული დიაგნოზი ვერ იდენტიფიცირდა.');
  if (!dates.length) inconsistencies.push('თარიღები ვერ იდენტიფიცირდა — ქრონოლოგიის აღდგენა შეუძლებელია.');
  if (/თანხმობ/.test(text) === false) inconsistencies.push('ინფორმირებული თანხმობის ხსენება დოკუმენტში არ იძებნება.');
  if (/ალერგი/.test(text) === false) inconsistencies.push('ალერგიული ანამნეზი დოკუმენტში არ არის ასახული.');
  if (investigations.length && !/დასკვნ|შედეგ|interpretation/i.test(text)) inconsistencies.push('კვლევები ნახსენებია, მაგრამ მათ შედეგზე რეაგირება ტექსტში ცალსახად არ ჩანს.');

  return { diagnoses, medications, investigations, procedures, dates, inconsistencies };
}
