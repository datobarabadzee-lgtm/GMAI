import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * F15 (audit 2026-10-21): human review is a workflow in the internal tier —
 * named reviewers, assignment, four-eyes approval, versions and an append-only
 * audit trail — and does not exist in the public tier. Synthetic content only.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmai-review-'));
const tok = { lead: 'lead-token-' + 'a'.repeat(32), rev: 'rev-token-' + 'b'.repeat(32), sub: 'sub-token-' + 'c'.repeat(32) };
const h = (t: string) => createHash('sha256').update(t).digest('hex');
let prev: string | undefined;

beforeAll(() => {
  prev = process.env.APP_TIER;
  process.env.APP_TIER = 'internal';
  process.env.REVIEW_DB_PATH = path.join(tmp, 'reviews.sqlite');
  process.env.REVIEWERS = `Lead Reviewer|lead|${h(tok.lead)}; Second Reviewer|reviewer|${h(tok.rev)}; Submitting Clinician|reviewer|${h(tok.sub)}`;
});
afterAll(async () => {
  (await import('@/server/review/store')).__closeReviewDb();
  process.env.APP_TIER = prev;
  delete process.env.REVIEW_DB_PATH;
  delete process.env.REVIEWERS;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const call = async (method: 'GET' | 'POST', token: string | null, url: string, body?: unknown) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const id = url.split('/')[3]?.split('?')[0];
  const mod = id ? await import('@/app/api/review/[id]/route') : await import('@/app/api/review/route');
  const res = id ? await (mod as typeof import('@/app/api/review/[id]/route'))[method](req, { params: Promise.resolve({ id }) }) : await (mod as typeof import('@/app/api/review/route'))[method](req);
  return { status: res.status, json: await res.json() };
};

describe('human review workflow (internal)', () => {
  it('runs submit → assign → four-eyes approval, with versions and an append-only trail', async () => {
    expect((await call('POST', null, '/api/review', { kind: 'answer', title: 't', content: {} })).status).toBe(401);
    const sub = await call('POST', tok.sub, '/api/review', { kind: 'answer', title: 'სინთეზური ქეისი', runId: 'run-1', content: { bottomLine: 'სინთეზური პასუხი v1' } });
    expect(sub.status).toBe(201);
    const id = sub.json.item.id as string;
    expect(sub.json.item).toMatchObject({ status: 'pending', version: 1, submitted_by: 'Submitting Clinician' });

    // Only a lead assigns; only a configured reviewer can be assigned.
    expect((await call('POST', tok.rev, `/api/review/${id}`, { action: 'assign', assignee: 'Second Reviewer' })).json.error).toBe('LEAD_ONLY');
    expect((await call('POST', tok.lead, `/api/review/${id}`, { action: 'assign', assignee: 'Nobody' })).json.error).toBe('UNKNOWN_REVIEWER');
    expect((await call('POST', tok.lead, `/api/review/${id}`, { action: 'assign', assignee: 'Submitting Clinician' })).json.item.status).toBe('assigned');
    // Four eyes: the author of the version cannot approve it, even when assigned.
    expect((await call('POST', tok.sub, `/api/review/${id}`, { action: 'approve' })).json.error).toBe('FOUR_EYES');
    expect((await call('POST', tok.lead, `/api/review/${id}`, { action: 'assign', assignee: 'Second Reviewer' })).status).toBe(200);
    expect((await call('POST', tok.rev, `/api/review/${id}`, { action: 'reject' })).json.error).toBe('REASON_REQUIRED');
    expect((await call('POST', tok.rev, `/api/review/${id}`, { action: 'reject', note: 'წყარო არ ემთხვევა' })).json.item.status).toBe('rejected');

    // A revision is a new version with its own hash; a stale decision is refused.
    const rev = await call('POST', tok.sub, `/api/review/${id}`, { action: 'revise', content: { bottomLine: 'სინთეზური პასუხი v2' } });
    expect(rev.json.item).toMatchObject({ status: 'pending', version: 2, assignee: null });
    expect(rev.json.item.content_sha256).not.toBe(sub.json.item.content_sha256);
    await call('POST', tok.lead, `/api/review/${id}`, { action: 'assign', assignee: 'Second Reviewer' });
    expect((await call('POST', tok.rev, `/api/review/${id}`, { action: 'approve', expectedVersion: 1 })).status).toBe(409);
    const ok = await call('POST', tok.rev, `/api/review/${id}`, { action: 'approve', expectedVersion: 2, note: 'შემოწმდა' });
    expect(ok.json.item.status).toBe('approved');
    expect((await call('POST', tok.sub, `/api/review/${id}`, { action: 'revise', content: {} })).status).toBe(409);

    const trail = (await call('GET', tok.rev, `/api/review/${id}`)).json.events as { action: string; actor: string; version: number }[];
    expect(trail.map((e) => e.action)).toEqual(['submit', 'assign', 'assign', 'reject', 'revise', 'assign', 'approve']);
    expect(trail.at(-1)).toMatchObject({ actor: 'Second Reviewer', version: 2 });

    // The trail cannot be edited.
    const Driver = (await import('better-sqlite3')).default;
    const raw = new Driver(process.env.REVIEW_DB_PATH!);
    expect(() => raw.prepare('DELETE FROM review_events').run()).toThrow(/append-only/);
    expect(() => raw.prepare("UPDATE review_events SET actor = 'x'").run()).toThrow(/append-only/);
    raw.close();

    expect((await call('GET', tok.lead, '/api/review?status=approved')).json.items.map((i: { id: string }) => i.id)).toContain(id);
  });

  it('refuses a cross-origin request even with a valid token', async () => {
    const { POST } = await import('@/app/api/review/route');
    const res = await POST(new Request('http://localhost/api/review', { method: 'POST', headers: { authorization: `Bearer ${tok.lead}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'answer', title: 'x', content: {} }) }));
    expect(res.status).toBe(403);
  });

  it('does not exist in the public tier', async () => {
    process.env.APP_TIER = 'public';
    const { isPublicApi } = await import('@/lib/tier');
    expect(isPublicApi('/api/review')).toBe(false);
    expect(isPublicApi('/api/review/abc')).toBe(false);
    expect((await call('GET', tok.lead, '/api/review')).status).toBe(403);
    process.env.APP_TIER = 'internal';
  });
});
