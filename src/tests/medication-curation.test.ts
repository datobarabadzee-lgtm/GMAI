import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Curator mappings: a Georgian catalog name is linked to an exact FDA name only
 * by a named curator's decision, validated on load; the product must still be
 * picked and confirmed. Uses a temporary map file, never the shipped one.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cur-'));
const MAP = path.join(dir, 'curated-map.json');
process.env.MED_CURATED_MAP = MAP;

const { searchMedication, previewProduct } = await import('@/server/medications/identity');
const { loadCuratedMap, saveDecisions, curationQueue, curationItem, targetCheck } = await import('@/server/medications/curation');
const { checkOperator } = await import('@/server/operator-auth');
const { buildMedicationGate } = await import('@/server/medications/agent-gate');
const { POST: savePost } = await import('@/app/api/curation/save/route');

const COLOMYCIN = 'mis-trade_name-546ff2786e73996604e4';
const base = { name_en: 'Colomycin', kind: 'trade_name', approved_by: 'Davit Barabadze', approved_at: '2026-10-19T12:00:00.000Z' };
const write = (entries: unknown[]) => fs.writeFileSync(MAP, JSON.stringify({ version: 1, entries }));

afterAll(() => {
  delete process.env.MED_CURATED_MAP;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('curator mappings', () => {
  beforeAll(() => write([]));

  it('without a decision „კოლომიცინი" stays catalog-only', async () => {
    await loadCuratedMap(true);
    const r = await searchMedication('კოლომიცინი');
    expect(r.status).toBe('catalog_name_only');
    expect(r.candidates).toEqual([]);
    expect(r.curated).toBeNull();
  });

  it('invalid entries are ignored and reported', async () => {
    write([
      { mis_id: COLOMYCIN, name_ka: 'სხვა სახელი', decision: 'approved', target_query: 'colistimethate sodium', ...base },
      { mis_id: 'mis-trade_name-00000000000000000000', name_ka: 'x', decision: 'approved', target_query: 'colchicine', ...base },
    ]);
    const m = await loadCuratedMap(true);
    expect(m.valid.size).toBe(0);
    expect(m.invalid.length).toBe(2);
    write([{ mis_id: COLOMYCIN, name_ka: 'კოლომიცინი', decision: 'approved', target_query: 'kolomicini-not-in-fda', ...base }]);
    expect((await loadCuratedMap(true)).invalid[0].reasonKa).toMatch(/შესარჩევ პროდუქტს არ შეესაბამება/);
  });

  it('an approved decision searches the approved FDA name; the product must still be confirmed', async () => {
    expect((await targetCheck('colistimethate sodium')).ok).toBe(true);
    write([{ mis_id: COLOMYCIN, name_ka: 'კოლომიცინი', decision: 'approved', target_query: 'colistimethate sodium', note: 'ერთეულები განსხვავდება', ...base }]);
    await loadCuratedMap(true);
    const r = await searchMedication('კოლომიცინი');
    expect(r.status).toBe('curated_mapping');
    expect(r.effectiveQuery).toBe('colistimethate sodium');
    expect(r.curated?.approved_by).toBe('Davit Barabadze');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(JSON.stringify(r).toLowerCase()).not.toContain('colchicine');
    // The Georgian name itself still cannot open any product record.
    await expect(previewProduct('კოლომიცინი', r.candidates[0].record_id)).rejects.toThrow('IDENTITY_MISMATCH');
  });

  it('agents see a curator-approved link but still give no dose without a confirmed product', async () => {
    const g = await buildMedicationGate({ text: 'კოლომიცინი რა დოზით?', session: null });
    const m = g.mentions.find((x) => x.input.startsWith('კოლომიცინ'));
    expect(m?.kind).toBe('curator_approved');
    expect(g.confirmed).toBeNull();
  });

  it('a rejection keeps the name without products', async () => {
    write([{ mis_id: COLOMYCIN, name_ka: 'კოლომიცინი', decision: 'rejected', ...base }]);
    await loadCuratedMap(true);
    const r = await searchMedication('კოლომიცინი');
    expect(r.status).toBe('curator_rejected');
    expect(r.candidates).toEqual([]);
  });

  it('saving merges by catalog id and refuses invalid decisions', async () => {
    write([]);
    const res = await saveDecisions([
      { mis_id: COLOMYCIN, name_ka: 'კოლომიცინი', decision: 'approved', target_query: 'colistimethate sodium', ...base },
      { mis_id: COLOMYCIN.replace('546f', '0000'), name_ka: 'x', decision: 'approved', target_query: 'colchicine', ...base },
    ]);
    expect(res.saved).toBe(1);
    expect(res.rejected.length).toBe(1);
    expect(JSON.parse(fs.readFileSync(MAP, 'utf8')).entries).toHaveLength(1);
  });

  // F18 (audit 2026-10-21): a localhost hostname or a missing VERCEL variable is
  // not authorisation. Writes need the internal tier, OPERATOR_TOKEN, the token
  // in the request and a same-origin browser request.
  it('only an authorised operator on the internal tier can write decisions', async () => {
    const TOKEN = 'x'.repeat(40);
    const req = (url: string, h: Record<string, string> = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify({ decisions: [] }) });
    const prevTier = process.env.APP_TIER;
    try {
      process.env.APP_TIER = 'public';
      process.env.OPERATOR_TOKEN = TOKEN;
      expect((await savePost(req('http://localhost:3000/api/curation/save', { authorization: `Bearer ${TOKEN}` }))).status).toBe(403);
      process.env.APP_TIER = 'internal';
      delete process.env.OPERATOR_TOKEN;
      expect((await savePost(req('http://localhost:3000/api/curation/save'))).status).toBe(403);
      process.env.OPERATOR_TOKEN = TOKEN;
      // localhost without the token: refused
      expect((await savePost(req('http://localhost:3000/api/curation/save'))).status).toBe(401);
      expect(checkOperator(req('http://localhost:3000/api/curation/save', { authorization: 'Bearer wrong-wrong-wrong-wrong-wrong-wrong-wrong' })).ok).toBe(false);
      // cross-origin browser request with the token: refused
      expect(checkOperator(req('http://gmai.local/api/curation/save', { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' })).ok).toBe(false);
      // same-origin with the token on any host: allowed
      expect(checkOperator(req('http://gmai.local/api/curation/save', { authorization: `Bearer ${TOKEN}`, origin: 'http://gmai.local' })).ok).toBe(true);
      // authorised: the request passes the gate and reaches validation (an empty list is a 400)
      expect([200, 400]).toContain((await savePost(req('http://gmai.local/api/curation/save', { authorization: `Bearer ${TOKEN}` }))).status);
    } finally {
      process.env.APP_TIER = prevTier;
      delete process.env.OPERATOR_TOKEN;
    }
  });

  it('queue is paged and the item view explains the crosswalk', async () => {
    const q = await curationQueue({ q: 'კოლომიცინი', filter: 'all', limit: 5 });
    expect(q.items[0].name_ka).toBe('კოლომიცინი');
    expect(q.items.length).toBeLessThanOrEqual(5);
    const all = await curationQueue({ filter: 'crosswalk', limit: 25 });
    expect(all.total).toBeGreaterThan(1000);
    expect(all.items).toHaveLength(25);
    const it = await curationItem(COLOMYCIN);
    expect(it?.exactEnglish.ok).toBe(false);
    expect(it?.crosswalk.reasonKa).toMatch(/ეკვივალენტობას არ ადასტურებს/);
  });
});
