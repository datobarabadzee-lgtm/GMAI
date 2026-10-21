#!/usr/bin/env node
/**
 * npm run smoke -- http://127.0.0.1:3000 [--expect-release gmai-…] [--expect-tier public]
 *
 * Post-deployment smoke test (audit F17). Synthetic requests only; no patient
 * data, no keys. Each check prints PASS/FAIL; exit 1 on any FAIL.
 * Covers: liveness, readiness, release id, security headers, tier boundary,
 * medication data, clinical-v2 search, academy and quality pages, document
 * export, upload limit, AI without a platform key (explicit refusal, not
 * filler) and a malformed caller key (safe error).
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const at = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const expectRelease = at('--expect-release');
const expectTier = at('--expect-tier') ?? 'public';
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const get = (p, init) => fetch(base + p, { redirect: 'manual', ...init, signal: AbortSignal.timeout(30000) });
const json = async (p, init) => {
  const r = await get(p, init);
  return { r, j: await r.json().catch(() => null) };
};
const post = (p, body, headers = {}) => json(p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

await check('liveness /api/health', async () => {
  const { r, j } = await json('/api/health');
  must(r.status === 200 && j?.status === 'alive', `status ${r.status}`);
  must(j.tier === expectTier, `tier ${j.tier} ≠ ${expectTier}`);
  return `release ${j.release}`;
});
await check('readiness /api/health/ready', async () => {
  const { r, j } = await json('/api/health/ready');
  const failing = (j?.checks ?? []).filter((c) => c.status === 'fail').map((c) => `${c.name}: ${c.detail}`);
  must(r.status === 200 && j?.ready, `not ready — ${failing.join('; ')}`);
  return (j.checks ?? []).map((c) => `${c.name}=${c.status}`).join(' ');
});
await check('release id /api/version', async () => {
  const { j } = await json('/api/version');
  must(/^gmai-/.test(j?.releaseId ?? ''), 'no release id');
  if (expectRelease) must(j.releaseId === expectRelease, `${j.releaseId} ≠ ${expectRelease}`);
  must(j.counts?.medicationIndexFiles === 515, `medication index files ${j.counts?.medicationIndexFiles}`);
  return j.releaseId;
});
await check('security headers', async () => {
  const r = await get('/');
  for (const h of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) must(r.headers.get(h), `missing ${h}`);
  must(!r.headers.get('x-powered-by'), 'x-powered-by exposed');
  return 'present';
});
if (expectTier === 'public') {
  await check('tier boundary (admin closed, review API absent)', async () => {
    const a = await get('/admin/usage');
    const t = await a.text();
    must(/საჯარო ვერსიაში არ არის/.test(t), '/admin/usage not rewritten to /unavailable');
    const { r } = await json('/api/review');
    must(r.status === 404, `/api/review ${r.status}`);
    const k = await json('/api/kb/search?q=x');
    must(k.r.status === 404, `/api/kb/search ${k.r.status}`);
    return 'closed';
  });
}
await check('medication data (search)', async () => {
  const { r, j } = await json('/api/medications/search?q=warfarin&limit=3');
  must(r.status === 200, `status ${r.status}`);
  must(JSON.stringify(j).toLowerCase().includes('warfarin'), 'no warfarin in result');
  return j.status ?? 'ok';
});
await check('clinical-v2 search', async () => {
  const { r, j } = await json('/api/clinical-v2/search?q=' + encodeURIComponent('მასიური ტრანსფუზია'));
  must(r.status === 200 && (j?.results?.length ?? 0) > 0, `status ${r.status}, results ${j?.results?.length}`);
  must(j.search?.semantic === false, 'search not labelled lexical');
  return `${j.results.length} results`;
});
for (const [name, path, re] of [
  ['academy page', '/academy', /აკადემია/],
  ['quality page', '/quality', /ხარისხ/],
  ['medications page', '/medications', /მედიკამენტ|პრეპარატ/],
]) {
  await check(name, async () => {
    const r = await get(path);
    must(r.status === 200, `status ${r.status}`);
    must(re.test(await r.text()), 'expected text missing');
    return 'ok';
  });
}
await check('document export (draft)', async () => {
  const r = await get('/api/documents/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: 'referral', sections: [{ heading: 'მიმართვის მიზეზი და გადაუდებლობა', body: 'სინთეზური სატესტო ტექსტი.' }] }) });
  must(r.status === 200, `status ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  must(buf.subarray(0, 2).toString() === 'PK', 'not a docx');
  return `${buf.length} bytes`;
});
await check('upload limit (413 above limit)', async () => {
  const fd = new FormData();
  fd.append('files', new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'text/plain' }), 'big.txt');
  const r = await get('/api/parse', { method: 'POST', body: fd });
  must(r.status === 413, `status ${r.status}`);
  return '413';
});
await check('AI without platform key: explicit refusal, not filler', async () => {
  const { j: h } = await json('/api/health');
  if (h?.ai?.platformKeyConfigured) return 'skipped: platform key configured on this host';
  const { r, j } = await post('/api/orchestrate', { question: 'რა არის ჰიპერტენზია?', mode: 'quick' });
  must(r.status === 503 && j?.error === 'AI_NOT_CONFIGURED', `status ${r.status} ${j?.error}`);
  return '503 AI_NOT_CONFIGURED';
});
await check('malformed caller key: safe error', async () => {
  const { r, j } = await post('/api/orchestrate', { question: 'რა არის ჰიპერტენზია?', mode: 'quick' }, { 'x-user-api-key': 'not-a-key' });
  must(r.status >= 400 || j?.answer, `status ${r.status}`);
  must(!JSON.stringify(j ?? {}).includes('not-a-key'), 'caller key echoed');
  return `${r.status} ${j?.error ?? ''}`;
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed against ${base}`);
process.exit(failed ? 1 : 0);
