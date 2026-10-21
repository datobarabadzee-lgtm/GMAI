import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/parse/route';
import { UPLOAD_MAX_FILES, UPLOAD_MAX_TOTAL_BYTES, checkUpload } from '@/lib/upload-limits';
import { uploadForParsing } from '@/lib/upload-client';

/**
 * F16 (audit 2026-10-21): the UI promised 10 MB per file / 25 MB per request,
 * but Vercel functions accept at most 4.5 MB bodies. The limit is now one
 * number shared by browser and server, below the platform ceiling.
 */

const txt = (name: string, bytes: number) => new File([new Uint8Array(bytes).fill(0x61)], name, { type: 'text/plain' });

function request(files: File[], headers: Record<string, string> = {}) {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  return new Request('http://localhost/api/parse', { method: 'POST', body: fd, headers });
}

describe('upload limits', () => {
  it('stays below the 4.5 MB serverless body limit by default', () => {
    expect(UPLOAD_MAX_TOTAL_BYTES).toBeLessThan(4.5 * 1024 * 1024 - 64 * 1024);
  });

  it('accepts a small file and a file exactly at the limit', async () => {
    const small = await POST(request([txt('a.txt', 1024)]));
    expect(small.status).toBe(200);
    expect((await small.json()).results[0].ok).toBe(true);
    const atLimit = await POST(request([txt('b.txt', UPLOAD_MAX_TOTAL_BYTES)]));
    expect(atLimit.status).toBe(200);
  });

  it('refuses one byte over the limit with a Georgian 413', async () => {
    const res = await POST(request([txt('c.txt', UPLOAD_MAX_TOTAL_BYTES + 1)]));
    expect(res.status).toBe(413);
    const j = await res.json();
    expect(j.error).toBe('FILE_TOO_LARGE');
    expect(j.messageKa).toMatch(/აღემატება/);
  });

  it('refuses a combined total over the limit and too many files', async () => {
    const half = Math.floor(UPLOAD_MAX_TOTAL_BYTES / 2) + 10;
    const res = await POST(request([txt('d.txt', half), txt('e.txt', half)]));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
    const many = await POST(request(Array.from({ length: UPLOAD_MAX_FILES + 1 }, (_, i) => txt(`f${i}.txt`, 10))));
    expect(many.status).toBe(413);
  });

  it('refuses by declared content-length before reading the body', async () => {
    const res = await POST(new Request('http://localhost/api/parse', { method: 'POST', body: 'x', headers: { 'content-length': String(UPLOAD_MAX_TOTAL_BYTES + 200 * 1024) } }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('the browser helper checks before sending and explains a platform 413 page', async () => {
    let called = 0;
    const counting = (async () => { called++; return new Response('{}'); }) as unknown as typeof fetch;
    const tooBig = await uploadForParsing([txt('g.txt', UPLOAD_MAX_TOTAL_BYTES + 1)], counting);
    expect(tooBig.ok).toBe(false);
    expect(called).toBe(0);

    const platform413 = (async () => new Response('Request Entity Too Large', { status: 413, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
    const out = await uploadForParsing([txt('h.txt', 10)], platform413);
    expect(out).toEqual({ ok: false, messageKa: expect.stringMatching(/აღემატება/) });
    expect(checkUpload([]).ok).toBe(false);
  });
});
