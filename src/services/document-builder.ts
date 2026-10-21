import 'server-only';
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer,
  Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';
import type { DocTemplate } from '@/knowledge/document-templates';
import type { PatientContext } from '@/schemas/clinical';

/**
 * Builds the finished Word document.
 *
 * The clinic's letterhead is reproduced rather than approximated: the real mark,
 * the registered name, address and identifiers, and the four-colour rule from the
 * printed template. The result is a document that can be signed as it is, which
 * is the point — a markdown skeleton on screen is not a medical record.
 */

const BRAND = { blue: '1854A8', orange: 'D85418', green: '0C9C18', yellow: 'F0B418', grey: '6B7280', ink: '111827' };

const CLINIC = {
  nameKa: 'შპს „ინ ვიტრო განაყოფიერების ცენტრი" — ლიდერმედი',
  addressKa: 'ნოდარ ბოხუას ქ. 21, თბილისი 0159, საქართველო',
  idKa: 'საიდენტიფიკაციო კოდი: 202462708',
  phone: '(+995 32) 215 77 77 / 71',
  email: 'info@leadermed.ge',
  web: 'www.leadermed.net',
};

export type DocSection = { heading: string; body: string };

export type BuildInput = {
  template: DocTemplate;
  patient: PatientContext;
  sections: DocSection[];
  author: string;
  institution: string;
  date: string;
  /** Shown verbatim under the title; used for the SOP-family registration block. */
  governance?: { label: string; value: string }[];
};

function markLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'public', 'brand', 'leadermed-mark.png'));
  } catch {
    return null; // the document is still valid without the mark
  }
}

const text = (s: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text: s, bold: opts.bold, size: opts.size ?? 20, color: opts.color ?? BRAND.ink, font: 'Sylfaen' });

const para = (runs: TextRun[], opts: { spacing?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ children: runs, alignment: opts.align, spacing: { after: opts.spacing ?? 80 } });

/** The four-colour rule taken from the printed letterhead. */
function colourRule(): Table {
  const cell = (color: string) =>
    new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      shading: { fill: color },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: color },
        bottom: { style: BorderStyle.NONE, size: 0, color: color },
        left: { style: BorderStyle.NONE, size: 0, color: color },
        right: { style: BorderStyle.NONE, size: 0, color: color },
      },
      children: [new Paragraph({ children: [new TextRun({ text: '', size: 2 })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [cell(BRAND.yellow), cell(BRAND.green), cell(BRAND.orange), cell(BRAND.blue)] })],
  });
}

function letterhead(): Header {
  const logo = markLogo();
  const left = new TableCell({
    width: { size: 14, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    verticalAlign: VerticalAlign.CENTER,
    children: [
      logo
        ? new Paragraph({
            children: [new ImageRun({ data: logo, transformation: { width: 58, height: 58 }, type: 'png' })],
          })
        : new Paragraph({ children: [text('')] }),
    ],
  });
  const right = new TableCell({
    width: { size: 86, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    verticalAlign: VerticalAlign.CENTER,
    children: [
      para([text('ლიდერმედი', { bold: true, size: 26, color: BRAND.blue })], { spacing: 20 }),
      para([text(CLINIC.nameKa, { size: 17, color: BRAND.grey })], { spacing: 20 }),
      para([text(`${CLINIC.addressKa} · ${CLINIC.idKa}`, { size: 15, color: BRAND.grey })], { spacing: 0 }),
    ],
  });
  return new Header({
    children: [
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [left, right] })] }),
      new Paragraph({ children: [text('')], spacing: { after: 40 } }),
      colourRule(),
      new Paragraph({ children: [text('')], spacing: { after: 120 } }),
    ],
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none };
}

function pageFooter(): Footer {
  return new Footer({
    children: [
      colourRule(),
      para([text(`${CLINIC.phone} · ${CLINIC.email} · ${CLINIC.web}`, { size: 15, color: BRAND.grey })], {
        align: AlignmentType.CENTER,
        spacing: 0,
      }),
    ],
  });
}

/** Two-column key/value table used for the patient snapshot and registration block. */
function kvTable(rows: { label: string; value: string }[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'D7DEE8' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              shading: { fill: 'F4F7FB' },
              borders: { top: border, bottom: border, left: border, right: border },
              children: [para([text(r.label, { bold: true, size: 18 })], { spacing: 40 })],
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              borders: { top: border, bottom: border, left: border, right: border },
              children: [para([text(r.value || '—', { size: 18 })], { spacing: 40 })],
            }),
          ],
        }),
    ),
  });
}

function signatureBlock(author: string, date: string): Paragraph[] {
  return [
    new Paragraph({ children: [text('')], spacing: { after: 240 } }),
    para([text('ექიმი: ', { bold: true }), text(author || '____________________')]),
    para([text('ხელმოწერა: ', { bold: true }), text('____________________')]),
    para([text('თარიღი: ', { bold: true }), text(date)]),
    new Paragraph({ children: [text('')], spacing: { after: 120 } }),
    para([
      text(
        'დოკუმენტი მომზადებულია ლიდერმედის Medical AI-ის დახმარებით და ძალაშია მხოლოდ პასუხისმგებელი ექიმის დადასტურებითა და ხელმოწერით.',
        { size: 15, color: BRAND.grey },
      ),
    ]),
  ];
}

export async function buildDocx(input: BuildInput): Promise<Buffer> {
  const { template, patient, sections, author, institution, date, governance } = input;

  const snapshot = [
    { label: 'ქეისი', value: patient.label },
    { label: 'ასაკი', value: patient.age !== null ? `${patient.age} წელი` : '' },
    { label: 'სქესი', value: patient.sex === 'male' ? 'მამრობითი' : patient.sex === 'female' ? 'მდედრობითი' : '' },
    { label: 'ალერგიები', value: patient.allergies.join(', ') },
    { label: 'აქტიური პრობლემები', value: patient.problems.join('; ') },
    {
      label: 'მიმდინარე მედიკამენტები',
      value: patient.medications
        .filter((m) => m.status === 'active')
        .map((m) => `${m.drug} ${m.dose} ${m.frequency}`.trim())
        .join('; '),
    },
    { label: 'დაწესებულება', value: institution || CLINIC.nameKa },
    { label: 'თარიღი', value: date },
  ];

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [text(template.nameKa, { bold: true, size: 30, color: BRAND.blue })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 160 },
    }),
    kvTable(snapshot),
    new Paragraph({ children: [text('')], spacing: { after: 200 } }),
  ];

  for (const s of sections) {
    children.push(
      new Paragraph({
        children: [text(s.heading, { bold: true, size: 22, color: BRAND.blue })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }),
    );
    const body = s.body.trim() || '—';
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const bullet = /^[-•*]\s+/.test(t);
      children.push(
        new Paragraph({
          children: [text(bullet ? t.replace(/^[-•*]\s+/, '') : t)],
          bullet: bullet ? { level: 0 } : undefined,
          spacing: { after: 60 },
        }),
      );
    }
  }

  if (governance?.length) {
    children.push(
      new Paragraph({
        children: [text('სარეგისტრაციო მონაცემები', { bold: true, size: 22, color: BRAND.blue })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
      }),
      kvTable(governance.map((g) => ({ label: g.label, value: g.value }))),
    );
  }

  if (template.requiresSignature) children.push(...signatureBlock(author, date));

  const doc = new Document({
    creator: institution || CLINIC.nameKa,
    title: template.nameKa,
    description: template.noteKa,
    styles: { default: { document: { run: { font: 'Sylfaen', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, right: 900, bottom: 900, left: 900 } } },
        headers: { default: letterhead() },
        footers: { default: pageFooter() },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
