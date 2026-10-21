import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Medication identity — application-level safety tests (incident 2026-10-19:
 * „კოლომიცინი" was shown with a colchicine label). openFDA is replaced by a
 * deterministic transport; no test calls the network.
 */

const captured: { role: string; content: string }[][] = [];
let modelText = '';
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const fake = {
    live: true,
    id: 'fake',
    async completeDetailed(req: { messages: { role: string; content: string }[] }) {
      captured.push(req.messages);
      return { text: modelText, model: 'fake-model', usage: { ...real.EMPTY_USAGE }, latencyMs: 1 };
    },
  };
  return { ...real, getProviderFor: () => ({ provider: fake, ownKey: false }) };
});

const { setFdaTransport, resetFdaClient } = await import('@/server/medications/fda-client');
const { searchMedication, previewProduct, confirmProduct, confirmedContext, labelSections, MAX_RESPONSE_BYTES, MSG } = await import('@/server/medications/identity');
const { buildMedicationGate } = await import('@/server/medications/agent-gate');
const { resetReceipts } = await import('@/server/medications/receipts');
const { unsupportedDrugNames } = await import('@/services/drug-name-guard');
const { orchestrate } = await import('@/services/orchestrator');

/* ── deterministic openFDA ───────────────────────────────────────────────── */

const COLCH_SET = '16d8e0f4-567d-4de1-ac25-6e2527f1d58e';
const COLY_SET = '6d6e13e2-dc33-4b7b-84d0-66146a57c552';
const docs = () => ({
  label: [
    {
      id: '459c796b-4b43-354e-e063-6294a90a7dec',
      set_id: COLCH_SET,
      effective_time: '20251210',
      openfda: { brand_name: ['Colchicine'], generic_name: ['COLCHICINE'], substance_name: ['COLCHICINE'], route: ['ORAL'], manufacturer_name: ['Chartwell RX, LLC'], spl_set_id: [COLCH_SET] },
      indications_and_usage: ['Colchicine tablets are indicated for prophylaxis and treatment of gout flares in adults.'],
      dosage_and_administration: ['Gout flares: 1.2 mg at the first sign of the flare followed by 0.6 mg one hour later.'],
    },
    {
      id: '2a986c38-f75d-48e0-a567-a4b8d4644347',
      set_id: COLY_SET,
      effective_time: '20260608',
      openfda: { brand_name: ['Coly-Mycin M'], generic_name: ['COLISTIMETHATE'], substance_name: ['COLISTIMETHATE SODIUM'], route: ['INTRAMUSCULAR', 'INTRAVENOUS'], manufacturer_name: ['Par Health USA, LLC'], spl_set_id: [COLY_SET] },
      indications_and_usage: ['Coly-Mycin M Parenteral is indicated for acute or chronic infections due to sensitive strains of certain gram-negative bacilli.'],
      dosage_and_administration: ['Adults and pediatric patients: 2.5 to 5 mg/kg per day in 2 to 4 divided doses (colistin base activity).'],
    },
  ] as Record<string, unknown>[],
  ndc: [
    { product_id: '62135-789_459c796b-4b43-354e-e063-6294a90a7dec', product_ndc: '62135-789', brand_name: 'Colchicine', generic_name: 'Colchicine', labeler_name: 'Chartwell RX, LLC', dosage_form: 'TABLET, FILM COATED', route: ['ORAL'], active_ingredients: [{ name: 'COLCHICINE', strength: '.6 mg/1' }], openfda: { spl_set_id: [COLCH_SET] } },
    { product_id: '42023-107_2a986c38-f75d-48e0-a567-a4b8d4644347', product_ndc: '42023-107', brand_name: 'Coly-Mycin M', generic_name: 'colistimethate', labeler_name: 'Par Health USA, LLC', dosage_form: 'INJECTION', route: ['INTRAMUSCULAR', 'INTRAVENOUS'], active_ingredients: [{ name: 'COLISTIMETHATE SODIUM', strength: '150 mg/2mL' }], openfda: { spl_set_id: [COLY_SET] } },
  ] as Record<string, unknown>[],
});
let DB = docs();
let mode: 'ok' | 'down' | '429' | 'wrong-id' | 'wrong-group' | 'renamed' = 'ok';
let calls: string[] = [];

const get = (o: Record<string, unknown>, field: string): string[] => {
  const v = field.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
  return Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
};
async function transport(url: URL): Promise<Response> {
  calls.push(url.toString());
  if (mode === 'down') throw new Error('offline');
  if (mode === '429') return new Response('', { status: 429 });
  const kind = url.pathname.includes('/ndc') ? 'ndc' : 'label';
  const terms = [...(url.searchParams.get('search') ?? '').matchAll(/([\w.]+):"([^"]+)"/g)].map((m) => [m[1], m[2]] as const);
  let results = DB[kind].filter((d) => terms.some(([f, v]) => get(d, f).includes(v)));
  if (mode === 'wrong-id') results = results.map((r) => ({ ...r, id: 'wrong-id', product_id: 'wrong-id' }));
  if (mode === 'wrong-group') results = results.map((r) => ({ ...r, set_id: 'wrong-group' }));
  if (mode === 'renamed') results = results.map((r) => ({ ...r, brand_name: 'Other', generic_name: 'other', openfda: { ...(r.openfda as object), brand_name: ['Other'], generic_name: ['OTHER'] } }));
  if (!results.length) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 });
  return new Response(JSON.stringify({ results }), { status: 200 });
}

beforeEach(() => {
  DB = docs();
  mode = 'ok';
  calls = [];
  captured.length = 0;
  modelText = '';
  setFdaTransport(transport);
  resetReceipts();
});
afterEach(() => setFdaTransport(null));

const COLCH = 489;
const COLY_LABEL = 208227;
const COLY_NDC = 365577;

/* ── 1. exact lookup, no substitution ────────────────────────────────────── */

describe('exact identity — no look-alike substitution', () => {
  it('„კოლომიცინი" is a catalog name only: no product, no source fetch, the required message', async () => {
    for (const q of ['კოლომიცინი', 'Colomycin']) {
      const r = await searchMedication(q);
      expect(r.status).toBe('catalog_name_only');
      expect(r.candidates).toEqual([]);
      expect(r.messageKa).toBe('დასახელება კატალოგში მოიძებნა; დადასტურებული ინსტრუქცია ჯერ არ არის დაკავშირებული.');
      expect(JSON.stringify(r).toLowerCase()).not.toContain('colchicine');
    }
    expect(calls).toEqual([]);
  });

  it('„კოლომიცინი" / Colomycin can never open a colchicine record', async () => {
    for (const q of ['კოლომიცინი', 'Colomycin', 'colomycin']) await expect(previewProduct(q, COLCH)).rejects.toThrow('IDENTITY_MISMATCH');
    expect(calls).toEqual([]);
  });

  it('„კოლხიცინი" / colchicine can never open a Colomycin (Coly-Mycin M) record', async () => {
    for (const q of ['კოლხიცინი', 'colchicine']) {
      await expect(previewProduct(q, COLY_LABEL)).rejects.toThrow('IDENTITY_MISMATCH');
      await expect(previewProduct(q, COLY_NDC)).rejects.toThrow('IDENTITY_MISMATCH');
    }
  });

  it('a misspelled name is not replaced: unknown status, suggestions kept apart, nothing fetched', async () => {
    for (const q of ['colchicinee', 'კოლომიცინო', 'kolomicini']) {
      const r = await searchMedication(q);
      expect(r.status).toBe('unknown_name');
      expect(r.candidates).toEqual([]);
      expect(r.messageKa).toBe(MSG.unknown);
      expect(r.fuzzy_matching_used).toBe(false);
    }
    const typo = await searchMedication('კოლომიცინო');
    // A similar name may appear only as a labelled suggestion.
    for (const s of typo.suggestions) expect(s.noteKa).toMatch(/შეიძლება სხვა პრეპარატი იყოს/);
    expect(calls).toEqual([]);
  });

  it('several products → the user must choose; pages do not overlap', async () => {
    const p1 = await searchMedication('colchicine', { offset: 0, limit: 10 });
    const p2 = await searchMedication('colchicine', { offset: 10, limit: 10 });
    expect(p1.status).toBe('product_selection_required');
    expect(p1.total).toBeGreaterThan(20);
    const ids1 = new Set(p1.candidates.map((c) => c.record_id));
    expect(p2.candidates.some((c) => ids1.has(c.record_id))).toBe(false);
    expect(p1.candidates.every((c) => typeof c.selectable === 'boolean')).toBe(true);
  });

  it('colistin is not mapped to colistimethate; no unit conversion exists', async () => {
    const r = await searchMedication('colistin');
    expect(r.status).toBe('catalog_name_only');
    expect(r.candidates).toEqual([]);
    const src = fs.readFileSync(path.resolve(__dirname, '../server/medications/identity.ts'), 'utf8');
    expect(src).not.toMatch(/\b(IU|units?)\s*(to|→|->)\s*mg/i);
  });
});

/* ── 2. product verification and confirmation ────────────────────────────── */

describe('product verification', () => {
  it('label preview carries ingredient/salt, strength, form and route from spl_set_id-linked NDC', async () => {
    const p = await previewProduct('Coly-Mycin M', COLY_LABEL);
    expect(p.identity.complete).toBe(true);
    expect(p.identity.ingredients).toEqual([{ name: 'COLISTIMETHATE SODIUM', strength: '150 mg/2mL' }]);
    expect(p.identity.dosage_forms).toEqual(['INJECTION']);
    expect(p.identity.routes).toContain('INTRAVENOUS');
  });

  it('missing form/strength leaves the product unconfirmable', async () => {
    DB.ndc = DB.ndc.filter((n) => !String(n.product_id).startsWith('42023-107'));
    const p = await previewProduct('Coly-Mycin M', COLY_LABEL);
    expect(p.identity.complete).toBe(false);
    await expect(confirmProduct('sid-aaaaaaaaaaaaaaaaaaaaaaaa', 'Coly-Mycin M', COLY_LABEL)).rejects.toThrow('IDENTITY_INCOMPLETE');
  });

  it('a different source ID, group or name in the response is rejected', async () => {
    mode = 'wrong-id';
    resetFdaClient();
    await expect(previewProduct('colchicine', COLCH)).rejects.toThrow('SOURCE_ID_MISMATCH');
    mode = 'wrong-group';
    resetFdaClient();
    await expect(previewProduct('colchicine', COLCH)).rejects.toThrow('SOURCE_GROUP_MISMATCH');
    mode = 'renamed';
    resetFdaClient();
    await expect(previewProduct('colchicine', COLCH)).rejects.toThrow('SOURCE_NAME_CHANGED');
  });

  it('NDC → label only through explicit spl_set_id and matching ingredient/route', async () => {
    const ok = await previewProduct('Coly-Mycin M', COLY_NDC);
    expect(ok.identity.linked.verified).toBe(true);
    // Same set_id but another ingredient: link refused, no clinical text.
    (DB.label[1].openfda as Record<string, unknown>).substance_name = ['SOMETHING ELSE'];
    resetFdaClient(); // the bounded cache would otherwise serve the earlier body for up to 10 minutes
    const bad = await previewProduct('Coly-Mycin M', COLY_NDC);
    expect(bad.identity.linked.verified).toBe(false);
    expect(bad.identity.clinical_text_available).toBe(false);
    expect(bad.label).toBeNull();
  });
});

describe('server-side confirmation', () => {
  const SID = 'session-aaaaaaaaaaaaaaaaaaaa';

  it('confirmed product → its own label; forged token, other session or model boolean → blocked', async () => {
    const c = await confirmProduct(SID, 'colchicine', COLCH);
    const ctx = await confirmedContext(SID, c.token, 'colchicine', COLCH);
    expect(ctx.identity_confirmed).toBe(true);
    expect(ctx.allow_instruction_generation).toBe(false);
    expect(ctx.executable_prescription).toBe(false);
    await expect(confirmedContext(SID, 'forged-token-forged-token-xx', 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext('another-session-bbbbbbbbbbbb', c.token, 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, true as unknown as string, 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, c.token, 'colchicine', 1832)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    await expect(confirmedContext(SID, c.token, 'Colomycin', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
  });

  it('sealed receipts work across functions (no shared memory) and cannot be altered', async () => {
    process.env.MED_RECEIPT_SECRET = 'test-secret-test-secret-test-secret-1234';
    try {
      const c = await confirmProduct(SID, 'colchicine', COLCH);
      expect(c.token.startsWith('m1.')).toBe(true);
      resetReceipts(); // another serverless function: empty memory
      expect((await confirmedContext(SID, c.token, 'colchicine', COLCH)).identity_confirmed).toBe(true);
      await expect(confirmedContext('another-session-bbbbbbbbbbbb', c.token, 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
      const [v, body, sig] = c.token.split('.');
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...payload, r: 1832 })).toString('base64url');
      await expect(confirmedContext(SID, `${v}.${forged}.${sig}`, 'colchicine', 1832)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
      const expired = Buffer.from(JSON.stringify({ ...payload, e: Date.now() - 1 })).toString('base64url');
      await expect(confirmedContext(SID, `${v}.${expired}.${sig}`, 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
      delete process.env.MED_RECEIPT_SECRET;
      await expect(confirmedContext(SID, c.token, 'colchicine', COLCH)).rejects.toThrow('PRODUCT_CONFIRMATION_REQUIRED');
    } finally {
      delete process.env.MED_RECEIPT_SECRET;
    }
  });

  it('a changed source after confirmation requires a new confirmation', async () => {
    const c = await confirmProduct(SID, 'colchicine', COLCH);
    DB.label[0].dosage_and_administration = ['Changed text 0.5 mg.'];
    const { resetFdaClient: reset } = await import('@/server/medications/fda-client');
    reset();
    await expect(confirmedContext(SID, c.token, 'colchicine', COLCH)).rejects.toThrow('SOURCE_CHANGED_RECONFIRM');
  });

  it('FDA offline or 429 → "temporarily unavailable", never another source', async () => {
    mode = 'down';
    await expect(previewProduct('colchicine', COLCH)).rejects.toThrow('SOURCE_UNAVAILABLE');
    resetFdaClient();
    mode = '429';
    await expect(previewProduct('colchicine', COLCH)).rejects.toThrow(/SOURCE_(UNAVAILABLE|RATE_LIMITED)/);
  });

  it('section responses stay within 250 KB', async () => {
    const big = { ...DB.label[0], dosage_and_administration: ['x '.repeat(400_000)], warnings: ['y '.repeat(200_000)] };
    const r = labelSections(big);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(MAX_RESPONSE_BYTES + 10_000);
    expect(r.sections.some((s) => s.truncated)).toBe(true);
  });
});

/* ── 3. agents ───────────────────────────────────────────────────────────── */

describe('agents use the identity gate', () => {
  it('model-sent confirmation flags are ignored by the gate', async () => {
    const g = await buildMedicationGate({ text: 'კოლომიცინის დოზა', session: 'sess-cccccccccccccccccccccc', confirmation: { token: 'forged-token-forged-token-xx', query: 'colchicine', recordId: COLCH, confirmed: true } });
    expect(g.confirmed).toBeNull();
    expect(g.confirmError).toBe('PRODUCT_CONFIRMATION_REQUIRED');
    expect(g.mentions.find((m) => m.input.startsWith('კოლომიცინ'))?.kind).not.toBe('substance_exact');
  });

  it('A07: „კოლომიცინი" gets no dose, no label, no colchicine', async () => {
    const out = await orchestrate({ question: 'კოლომიცინი რა დოზით ინიშნება?', mode: 'quick' });
    const a07 = out.agentResults.find((a) => a.agentId === 'A07')!;
    const blob = JSON.stringify(a07).toLowerCase();
    expect(blob).not.toContain('colchicine');
    expect(blob).not.toContain('კოლხიცინ');
    expect((a07.data as { confirmedProduct?: unknown }).confirmedProduct).toBeUndefined();
    expect((a07.data as { identityRequired?: unknown[] }).identityRequired?.length).toBeGreaterThan(0);
    expect(out.medication.confirmed).toBeNull();
  }, 60_000);

  it('A07: an unconfirmed Georgian catalog mapping gives no dosing answer', async () => {
    const out = await orchestrate({ question: 'კოლისტინი რა დოზით?', mode: 'quick' });
    const a07 = out.agentResults.find((a) => a.agentId === 'A07')!;
    expect(JSON.stringify(a07)).not.toMatch(/\d+(\.\d+)?\s*(mg|მგ|IU)/i);
    expect(JSON.stringify(a07).toLowerCase()).not.toContain('colistimethate');
  }, 60_000);

  it('A07: a confirmed product (server receipt + same session) supplies its own label', async () => {
    const sid = 'sess-dddddddddddddddddddddd';
    const c = await confirmProduct(sid, 'Coly-Mycin M', COLY_LABEL);
    const out = await orchestrate({ question: 'დოზირება?', mode: 'quick', medSession: sid, extras: { medConfirmation: { token: c.token, query: 'Coly-Mycin M', recordId: COLY_LABEL } } });
    const a07 = out.agentResults.find((a) => a.agentId === 'A07')!;
    expect((a07.data as { confirmedProduct?: { recordId: number } }).confirmedProduct?.recordId).toBe(COLY_LABEL);
    expect(JSON.stringify(a07)).toContain('COLISTIMETHATE SODIUM');
    expect(JSON.stringify(a07).toLowerCase()).not.toContain('colchicine');
    // Same token from another session: blocked.
    const other = await orchestrate({ question: 'დოზირება?', mode: 'quick', medSession: 'sess-eeeeeeeeeeeeeeeeeeeeee', extras: { medConfirmation: { token: c.token, query: 'Coly-Mycin M', recordId: COLY_LABEL } } });
    expect(other.medication.confirmed).toBeNull();
  }, 60_000);

  it('the model may not name a drug the user and agents did not name', async () => {
    expect(unsupportedDrugNames('კოლომიცინი არის კოლხიცინი, 0.6 მგ.', 'კოლომიცინი რა დოზით?')).toContain('კოლხიცინ');
    modelText = 'კოლომიცინი არის კოლხიცინი; ჩვეული დოზაა 0.6 მგ.';
    const out = await orchestrate({ question: 'კოლომიცინი რისთვისაა?', mode: 'quick' });
    expect(out.answer.bottomLine).not.toContain('კოლხიცინ');
    expect(out.medication.drugNamesRejected.length).toBeGreaterThan(0);
  }, 60_000);

  it('every drug path goes through the identity service (no name-based label lookup left)', () => {
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f.name) && !p.includes(`${path.sep}tests${path.sep}`)) files.push(p);
      }
    };
    walk(root);
    const offenders = files.filter((f) => !f.endsWith(path.join('services', 'drug-labels.ts'))).filter((f) => /\b(lookupDrugLabel|lookupMany|crossInteractions)\s*\(/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    const a07 = fs.readFileSync(path.join(root, 'agents', 'implementations.ts'), 'utf8');
    expect(a07).toMatch(/buildMedicationGate/);
    expect(fs.readFileSync(path.join(root, 'app', 'api', 'polypharmacy', 'route.ts'), 'utf8')).toMatch(/classifyNames/);
    expect(fs.readFileSync(path.join(root, 'app', 'api', 'drug-summary', 'route.ts'), 'utf8')).toMatch(/confirmedContext/);
  });

  it('no client component imports the index or the server service', () => {
    const root = path.resolve(__dirname, '..');
    const clientFiles: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name) && /^['"]use client['"]/.test(fs.readFileSync(p, 'utf8').trimStart())) clientFiles.push(p);
      }
    };
    walk(root);
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const f of clientFiles) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/server\/medications|knowledge\/medications/);
  });
});

describe('label wording', async () => {
  const { noneListed } = await import('@/agents/implementations');
  const { englishProse } = await import('@/services/orchestrator');
  it('a contraindication section that lists nothing is recognised', () => {
    expect(noneListed('4 CONTRAINDICATIONS None. None ( 4 )')).toBe(true);
    expect(noneListed('4 CONTRAINDICATIONS Hypersensitivity to colchicine.')).toBe(false);
  });
  it('untranslated English prose is detected; drug names and abbreviations are not', () => {
    expect(englishProse('gastrointestinal perforation ან fistula, recent surgery').length).toBeGreaterThanOrEqual(3);
    expect(englishProse('Coly-Mycin M (colistimethate), PRES, VTE, ACS').length).toBe(0);
  });
});

describe('openFDA key handling', () => {
  it('sends the key only to api.fda.gov, never into cache keys or responses', async () => {
    process.env.OPENFDA_API_KEY = 'test-key-not-real-0000000000000000000000';
    const seen: string[] = [];
    setFdaTransport(async (url: URL) => {
      seen.push(url.toString());
      return transport(url);
    });
    try {
      const p = await previewProduct('Coly-Mycin M', COLY_LABEL);
      expect(seen.length).toBeGreaterThan(0);
      for (const u of seen) {
        expect(new URL(u).hostname).toBe('api.fda.gov');
        expect(new URL(u).searchParams.get('api_key')).toBe(process.env.OPENFDA_API_KEY);
      }
      expect(JSON.stringify(p.identity)).not.toContain('test-key-not-real');
      const ctxSearch = await searchMedication('Coly-Mycin M');
      expect(JSON.stringify(ctxSearch)).not.toContain('test-key-not-real');
    } finally {
      delete process.env.OPENFDA_API_KEY;
    }
  });
});

describe('unknown drug in a dosing question', () => {
  it('states that the name was not found and gives no dose', async () => {
    modelText = 'ზოლგენსმიქსის დოზა დამოკიდებულია წონაზე.';
    const out = await orchestrate({ question: 'ზოლგენსმიქსი რა დოზით მივიღო?', mode: 'quick' });
    expect(out.answer.bottomLine).toMatch(/ზუსტი დასახელებით ვერ მოიძებნა/);
    expect(out.answer.bottomLine).not.toMatch(/\d+\s*(mg|მგ|IU|სე)/i);
  }, 60_000);
});
