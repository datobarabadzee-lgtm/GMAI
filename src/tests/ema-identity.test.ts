import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * EMA (EU product information) — identity and safety tests. The EMA website is
 * replaced by a deterministic transport and the PDF text layer by a fixture
 * (trimmed real Avastin SmPC); no test calls the network.
 */

const ema = await import('@/server/medications/ema');
const { parseSmpcs, nameMatches, substancesMatch, hasStrength } = await import('@/server/medications/smpc');
const { confirmProduct, confirmedContext, labelSections } = await import('@/server/medications/identity');
const { buildMedicationGate } = await import('@/server/medications/agent-gate');
const { resetReceipts } = await import('@/server/medications/receipts');
const { AGENT_IMPLEMENTATIONS } = await import('@/agents/implementations');
const { emptyPatientContext } = await import('@/schemas/clinical');

const AVASTIN_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'ema-avastin-smpc.txt'), 'utf8').split('\n').slice(1).join('\n');
const AVASTIN = ema.emaRecordId(582, 0);
const SID = 'session-aaaaaaaaaaaaaaaaaaaa';
const PDF = new TextEncoder().encode(`%PDF-1.7\n${'x'.repeat(2000)}`);

let text = AVASTIN_TEXT;
let calls: string[] = [];
let body: Uint8Array = PDF;
let status = 200;

beforeEach(() => {
  text = AVASTIN_TEXT;
  calls = [];
  body = PDF;
  status = 200;
  resetReceipts();
  ema.setEmaTransport(
    async (url) => {
      calls.push(url.toString());
      return new Response(body as unknown as BodyInit, { status });
    },
    async () => text,
  );
});
afterEach(() => ema.resetEmaClient());

describe('EMA index — exact names only', () => {
  it('finds Avastin by its EMA name, case-insensitively', async () => {
    for (const q of ['Avastin', 'avastin', 'AVASTIN ']) {
      const r = await ema.searchEma(q);
      expect(r.candidates.map((c) => c.ema_number)).toEqual(['EMEA/H/C/000582']);
      expect(r.candidates[0].selectable).toBe(true);
    }
  });

  it('a substance lists every EMA medicine with exactly that substance, each separately', async () => {
    const r = await ema.searchEma('bevacizumab');
    expect(r.total).toBeGreaterThan(5);
    expect(r.candidates.every((c) => c.active_substance.toLowerCase() === 'bevacizumab')).toBe(true);
  });

  it('no fuzzy or near matches: a misspelling finds nothing', async () => {
    for (const q of ['Avastinn', 'Avasti', 'bevacizumabb', 'ავასტინი']) expect((await ema.searchEma(q)).total).toBe(0);
  });

  it('LASA: Colomycin / colistimethate never resolves to colchicine (and vice versa)', async () => {
    expect((await ema.searchEma('Colomycin')).total).toBe(0);
    expect((await ema.searchEma('კოლომიცინი')).total).toBe(0);
    const coli = await ema.searchEma('colistimethate sodium');
    expect(coli.candidates.map((c) => c.name)).toContain('Colobreathe');
    expect(coli.candidates.some((c) => /colchicine/i.test(c.active_substance))).toBe(false);
    const colch = await ema.searchEma('colchicine');
    expect(colch.candidates.every((c) => c.active_substance.toLowerCase() === 'colchicine')).toBe(true);
  });

  it('withdrawn medicines are listed but cannot be selected or previewed', async () => {
    const r = await ema.searchEma('Revasc');
    expect(r.candidates[0].status).toBe('Withdrawn');
    expect(r.candidates[0].selectable).toBe(false);
    await expect(ema.previewEma('Revasc', r.candidates[0].record_id)).rejects.toThrow('EMA_NOT_SELECTABLE');
  });
});

describe('SmPC parsing and identity checks', () => {
  it('splits the real Avastin SmPC into sections 4.1–4.9', () => {
    const [s] = parseSmpcs(AVASTIN_TEXT);
    expect(s.name).toMatch(/^Avastin 25 mg\/ml/);
    expect(s.missing).toEqual([]);
    expect(s.sections['4.3']).toMatch(/Hypersensitivity to the active substance/);
    expect(s.sections['4.3']).toMatch(/Pregnancy/);
    expect(s.sections['4.3']).not.toMatch(/Special warnings/);
    expect(nameMatches(s.name, 'Avastin')).toBe(true);
    expect(substancesMatch(s.composition, 'bevacizumab', 'bevacizumab')).toBe(true);
    expect(hasStrength(s.composition)).toBe(true);
  });

  it('name and substance must match as whole words — a different product does not', () => {
    const [s] = parseSmpcs(AVASTIN_TEXT);
    expect(nameMatches(s.name, 'Avast')).toBe(false);
    expect(nameMatches(s.name, 'Mvasi')).toBe(false);
    expect(substancesMatch(s.composition, 'ranibizumab', 'ranibizumab')).toBe(false);
    expect(nameMatches('Thalidomide BMS 50 mg hard capsules', 'Thalidomide BMS (previously Thalidomide Celgene)')).toBe(true);
    expect(substancesMatch('78 mg of 5-aminolaevulinic acid', '5-aminolevulinic acid hydrochloride', '')).toBe(true);
  });

  it('several SmPCs in one PDF are separate products', () => {
    const two = AVASTIN_TEXT.replace('\nANNEX II', `\n1. NAME OF THE MEDICINAL PRODUCT\nAvastin 400 mg powder for test\n2. QUALITATIVE AND QUANTITATIVE COMPOSITION\nEach vial contains 400 mg bevacizumab.\n3. PHARMACEUTICAL FORM\nPowder.\n4. CLINICAL PARTICULARS\n4.1 Therapeutic indications\nX\n4.3 Contraindications\nY\nANNEX II`);
    const s = parseSmpcs(two);
    expect(s).toHaveLength(2);
    expect(s[1].name).toBe('Avastin 400 mg powder for test');
    expect(s[1].missing).toContain('4.2');
  });
});

describe('EMA preview, confirmation and context', () => {
  it('preview: identity from the PDF of the product number, no clinical text', async () => {
    const p = await ema.previewEma('Avastin', AVASTIN);
    expect(calls).toEqual(['https://www.ema.europa.eu/en/documents/product-information/avastin-epar-product-information_en.pdf']);
    expect(p.identities).toHaveLength(1);
    const id = p.identities[0];
    expect(id.complete).toBe(true);
    expect(id.source).toBe('ema');
    expect(id.ingredients[0].strength).toMatch(/25 mg/);
    expect(JSON.stringify(p)).not.toMatch(/Hypersensitivity to the active substance/);
  });

  it('the query must name this medicine: another EMA name or substance of another product is refused', async () => {
    await expect(ema.previewEma('Mvasi', AVASTIN)).rejects.toThrow('IDENTITY_MISMATCH');
    await expect(ema.previewEma('colchicine', AVASTIN)).rejects.toThrow('IDENTITY_MISMATCH');
  });

  it('a PDF whose SmPC names another medicine is not confirmable', async () => {
    text = AVASTIN_TEXT.replace(/Avastin 25 mg\/ml/, 'Zirabev 25 mg/ml');
    const p = await ema.previewEma('Avastin', AVASTIN);
    expect(p.identities[0].complete).toBe(false);
    await expect(confirmProduct(SID, 'Avastin', AVASTIN)).rejects.toThrow('IDENTITY_INCOMPLETE');
  });

  it('an HTML "Sorry" page or a server error is not a PDF: nothing is shown', async () => {
    body = new TextEncoder().encode('<html><title>Sorry</title></html>'.padEnd(3000, ' '));
    await expect(ema.previewEma('Avastin', AVASTIN)).rejects.toThrow('EMA_UNAVAILABLE');
    ema.resetEmaClient();
    body = PDF;
    status = 503;
    await expect(ema.previewEma('Avastin', AVASTIN)).rejects.toThrow('EMA_UNAVAILABLE');
  });

  it('confirm → context with EU sections; bound to session, query and record', async () => {
    const c = await confirmProduct(SID, 'Avastin', AVASTIN);
    const ctx = await confirmedContext(SID, c.token, 'Avastin', AVASTIN);
    expect(ctx.source).toBe('ema');
    const { sections } = labelSections(ctx.label);
    expect(sections.find((s) => s.key === 'contraindications')?.text).toMatch(/Pregnancy/);
    await expect(confirmedContext('another-session-bbbbbbbbbbbb', c.token, 'Avastin', AVASTIN)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, c.token, 'bevacizumab', AVASTIN)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, c.token, 'Avastin', ema.emaRecordId(582, 1))).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, 'forged-token-forged-token-xx', 'Avastin', AVASTIN)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
  });

  it('a changed SmPC after confirmation requires a new confirmation', async () => {
    const c = await confirmProduct(SID, 'Avastin', AVASTIN);
    ema.resetEmaClient();
    text = AVASTIN_TEXT.replace('Pregnancy (see section 4.6).', 'Pregnancy (see section 4.6). Changed.');
    await expect(confirmedContext(SID, c.token, 'Avastin', AVASTIN)).rejects.toThrow('SOURCE_CHANGED_RECONFIRM');
  });
});

describe('agents: EMA product next to FDA, never merged', () => {
  it('the gate accepts an EU confirmation and keeps it separate', async () => {
    const c = await confirmProduct(SID, 'Avastin', AVASTIN);
    const gate = await buildMedicationGate({ text: 'რა უკუჩვენებები აქვს?', session: SID, confirmation: [{ token: c.token, query: 'Avastin', recordId: AVASTIN }] });
    expect(gate.confirmedAll).toHaveLength(1);
    expect(gate.confirmedAll[0].source).toBe('ema');
    // Two EU confirmations: only one per region is kept.
    const g2 = await buildMedicationGate({ text: '', session: SID, confirmation: [{ token: c.token, query: 'Avastin', recordId: AVASTIN }, { token: c.token, query: 'Avastin', recordId: AVASTIN }] });
    expect(g2.confirmedAll).toHaveLength(1);
  });

  it('an EU-only product name is recognised as a product to select, not as unknown', async () => {
    const gate = await buildMedicationGate({ text: 'Colobreathe დოზა', session: null });
    const m = gate.mentions.find((x) => x.input.toLowerCase() === 'colobreathe');
    expect(m?.emaTotal).toBe(1);
    expect(m?.kind).not.toBe('unknown');
    expect(m?.substance).toBeNull();
  });

  it('A07 shows US and EU contraindications side by side, each labelled', async () => {
    const c = await confirmProduct(SID, 'Avastin', AVASTIN);
    const eu = { ...(await confirmedContext(SID, c.token, 'Avastin', AVASTIN)), token: c.token };
    const us = {
      ...eu,
      source: 'label' as const,
      record_id: 7,
      query: 'Avastin',
      identity: { ...eu.identity, source: 'label' as const, source_id: 'fda-1', routes: ['INTRAVENOUS'] },
      label: { contraindications: ['4 CONTRAINDICATIONS None. None ( 4 )'], indications_and_usage: ['US indications text'] },
    };
    const a07 = AGENT_IMPLEMENTATIONS.A07 as unknown as (c: unknown) => Promise<{ sections: { titleKa: string; titleEn: string; body: string }[]; summary: string }>;
    const out = await a07({ question: 'უკუჩვენებები', plan: '', patient: emptyPatientContext(), extras: {}, hits: [], medication: { mentions: [], confirmed: us, confirmedAll: [us, eu], confirmError: null } });
    const contra = out.sections.find((s) => s.titleEn === 'contraindications');
    expect(contra?.body).toMatch(/აშშ \(FDA\): აბსოლუტური უკუჩვენება ჩამოთვლილი არ არის/);
    expect(contra?.body).toMatch(/ევროპა \(EMA\): .*Pregnancy/);
    expect(out.summary).toMatch(/ორი დადასტურებული პროდუქტი/);
  });
});


describe('question focus on confirmed products (2026-10-20: "no contraindications listed")', async () => {
  const { focusFor, focusMissed, focusFallback, focusContext } = await import('@/services/confirmed-focus');
  const us = { source: 'label', label: { contraindications: ['4 CONTRAINDICATIONS None. None ( 4 )'] } };
  const eu = { source: 'ema', label: { contraindications: ['● Hypersensitivity to the active substance. ● Pregnancy (see section 4.6).'] } };

  it('a contraindication question focuses both sources, US marked as listing nothing', () => {
    const f = focusFor('რა უკუჩვენებები აქვს ამ პრეპარატს?', [us, eu])!;
    expect(f.key).toBe('contraindications');
    expect(f.parts.map((p) => [p.region, p.none])).toEqual([['US', true], ['EU', false]]);
    expect(focusContext(f)).toMatch(/ევროპა \(EMA\): ● Hypersensitivity/);
  });

  it('the observed wrong answer is caught; a correct two-source answer is not', () => {
    const f = focusFor('უკუჩვენებები?', [us, eu])!;
    expect(focusMissed('მოწოდებულ Avastin-ის აშშ-ის FDA და ევროპის EMA ინსტრუქციის ამონარიდებში უკუჩვენებები მითითებული არ არის, ამიტომ მათი ჩამოთვლა შეუძლებელია.', f)).toBe(true);
    expect(focusMissed('აშშ (FDA): უკუჩვენება ჩამოთვლილი არ არის. ევროპა (EMA): ჰიპერმგრძნობელობა და ორსულობა.', f)).toBe(false);
    expect(focusMissed('უკუჩვენებებია ჰიპერმგრძნობელობა და ორსულობა.', f)).toBe(true); // one source silently dropped
    expect(focusFallback(f)).toMatch(/ევროპა \(EMA\): წყაროს ტექსტი \(ინგლისურად\): ● Hypersensitivity/);
  });

  it('no focus without a confirmed product or without a section question', () => {
    expect(focusFor('უკუჩვენებები?', [])).toBeNull();
    expect(focusFor('გამარჯობა', [us, eu])).toBeNull();
  });
});

describe('published sources must support the published answer (2026-10-20: leeches → Cockcroft-Gault)', async () => {
  const { relevantSources, sourceSupports } = await import('@/services/source-relevance');
  const { sourcesByIds } = await import('@/knowledge/sources');
  const cg = sourcesByIds(['SRC-COCKCROFT-1976'])[0];

  it('Cockcroft-Gault is not published under an answer about leech therapy for pain', () => {
    const text = 'წურბელებით მკურნალობა ტკივილისთვის? წურბელები კანზე მიმაგრებით სისხლს წოვენ, თუმცა ტკივილის სამკურნალოდ მათი სარგებელი დადასტურებული არ არის.';
    expect(relevantSources([cg], text)).toEqual([]);
  });

  it('it is published when the answer is about renal dosing or creatinine clearance', () => {
    expect(sourceSupports(cg, 'CrCl 28 მლ/წთ — დოზა შემცირდეს')).toBe(true);
    expect(sourceSupports(cg, 'თირკმლის ფუნქციის მიხედვით დოზის კორექცია')).toBe(true);
    expect(sourceSupports(cg, 'MCrClX')).toBe(false);
  });
});
