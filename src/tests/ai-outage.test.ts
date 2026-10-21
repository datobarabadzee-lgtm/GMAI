import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Outage handling (audit: platform error ≠ external outage ≠ no evidence).
 * A provider that fails must never be replaced, in the public tier, by the
 * deterministic template presented as an answer; each failure kind gets its
 * own status and message. The internal tier shows engine output, labelled.
 */
let failWith: unknown = null;
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const provider = {
    name: 'test', live: true,
    info: () => ({ engine: 'live', provider: 'test', fast: 'm', reasoning: 'm' }),
    complete: async () => '',
    completeDetailed: async () => {
      throw failWith;
    },
  };
  return { ...real, engineStatus: () => ({ engine: 'live' as const, label: 'Live' }), getProvider: () => provider, getProviderFor: () => ({ provider, ownKey: false }) };
});

const err = (props: Record<string, unknown>) => Object.assign(new Error(String(props.message ?? 'x')), props);
const ask = async (headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/orchestrate/route');
  const res = await POST(new Request('http://localhost/api/orchestrate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify({ question: 'რა არის არტერიული ჰიპერტენზია?', mode: 'quick' }) }));
  return { status: res.status, json: await res.json() };
};

describe('AI provider failure', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('classifies failures', async () => {
    const { classifyAiError } = await import('@/services/orchestrator');
    expect(classifyAiError(err({ name: 'APIConnectionError', message: 'Connection error.' })).kind).toBe('unreachable');
    expect(classifyAiError(err({ status: 503 })).kind).toBe('unreachable');
    expect(classifyAiError(err({ status: 429, message: 'Rate limit reached' })).kind).toBe('rate_limited');
    expect(classifyAiError(err({ status: 429, code: 'insufficient_quota' })).kind).toBe('budget_exhausted');
    expect(classifyAiError(err({ status: 401, message: 'Incorrect API key provided' })).kind).toBe('auth_rejected');
    expect(classifyAiError(err({ status: 400, message: 'bad' })).kind).toBe('provider_error');
  });

  it('public tier: outage → 503, provider 429 → 429, rejected caller key → 401; never a template answer', async () => {
    vi.stubEnv('APP_TIER', 'public');
    failWith = err({ name: 'APIConnectionError', message: 'Connection error.' });
    const down = await ask();
    expect(down.status).toBe(503);
    expect(down.json.error).toBe('AI_UNAVAILABLE');
    expect(down.json.answer).toBeUndefined();

    failWith = err({ status: 429, message: 'Rate limit reached' });
    const limited = await ask();
    expect(limited.status).toBe(429);
    expect(limited.json.error).toBe('AI_RATE_LIMITED');

    failWith = err({ status: 401, message: 'Incorrect API key provided' });
    const key = 'sk-proj-' + 'z'.repeat(40);
    const rejected = await ask({ 'x-user-api-key': key });
    expect(rejected.status).toBe(401);
    expect(rejected.json.error).toBe('CALLER_KEY_REJECTED');
    expect(JSON.stringify(rejected.json)).not.toContain(key);
  });

  it('internal tier: engine output is shown and labelled as such', async () => {
    vi.stubEnv('APP_TIER', 'internal');
    failWith = err({ name: 'APIConnectionError', message: 'Connection error.' });
    const r = await ask({ 'x-processing-attestation': (await import('@/knowledge/controller')).PROFESSIONAL_ATTESTATION_VERSION });
    expect(r.status).toBe(200);
    expect(r.json.answer.bottomLine).toMatch(/^AI პროვაიდერი მიუწვდომელია/);
    expect(r.json.trace.find((e: { tool: string }) => e.tool === 'ai_synthesis')).toMatchObject({ status: 'unavailable' });
  });
});
