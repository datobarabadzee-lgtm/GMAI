import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, __resetLimiter, checkLimit, recordSpend, spendToday } from '@/services/rate-limit';

const reqFrom = (ip: string) => new Request('https://x.test/api/orchestrate', { headers: { 'x-real-ip': ip } });

describe('abuse and spend protection', () => {
  beforeEach(() => __resetLimiter());

  it('allows normal use and then throttles one abusive client', async () => {
    const req = reqFrom('1.2.3.4');
    for (let i = 0; i < LIMITS.ipPerWindow; i++) {
      expect((await checkLimit(req)).ok).toBe(true);
    }
    const blocked = await checkLimit(req);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('ip');
      expect(blocked.messageKa).toMatch(/ბევრი მოთხოვნა/);
    }
  });

  it('does not let one clients limit affect another', async () => {
    const a = reqFrom('1.1.1.1');
    for (let i = 0; i < LIMITS.ipPerWindow; i++) (await checkLimit(a));
    expect((await checkLimit(a)).ok).toBe(false);
    expect((await checkLimit(reqFrom('2.2.2.2'))).ok).toBe(true);
  });

  it('closes the AI endpoints once the daily budget is spent', async () => {
    await recordSpend(LIMITS.dailyBudgetUsd + 0.01);
    const v = await checkLimit(reqFrom('3.3.3.3'));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('budget');
      // The message must tell the visitor how to keep working, not just refuse.
      expect(v.messageKa).toMatch(/API გასაღები/);
    }
  });

  it('exempts a visitor spending their own money from the budget cap', async () => {
    await recordSpend(LIMITS.dailyBudgetUsd * 10);
    expect((await checkLimit(reqFrom('4.4.4.4'), { ownKey: true })).ok).toBe(true);
  });

  it('still throttles a visitor with their own key, at a higher allowance', async () => {
    const req = reqFrom('5.5.5.5');
    for (let i = 0; i < LIMITS.ipPerWindow * 3; i++) {
      expect((await checkLimit(req, { ownKey: true })).ok).toBe(true);
    }
    expect((await checkLimit(req, { ownKey: true })).ok).toBe(false);
  });

  it('reports the days spend against the cap', async () => {
    await recordSpend(1.25);
    const s = await spendToday();
    expect(s.usd).toBeCloseTo(1.25, 3);
    expect(s.capUsd).toBe(LIMITS.dailyBudgetUsd);
    expect(s.remainingUsd).toBeCloseTo(LIMITS.dailyBudgetUsd - 1.25, 3);
  });

  it('falls back to a single bucket when no client address is present', async () => {
    const anon = new Request('https://x.test/api/orchestrate');
    expect((await checkLimit(anon)).ok).toBe(true);
  });
});

describe('caller-supplied key handling', () => {
  it('accepts a plausible key shape and rejects junk', async () => {
    const { isPlausibleKey } = await import('@/services/ai-provider');
    expect(isPlausibleKey('sk-proj-' + 'a'.repeat(40))).toBe(true);
    expect(isPlausibleKey('not-a-key')).toBe(false);
    expect(isPlausibleKey('')).toBe(false);
    expect(isPlausibleKey('sk-short')).toBe(false);
  });

  it('reads the key from its header only', async () => {
    const { callerKeyFrom } = await import('@/services/ai-provider');
    const withKey = new Request('https://x.test/', { headers: { 'x-user-api-key': 'sk-abc' } });
    expect(callerKeyFrom(withKey)).toBe('sk-abc');
    expect(callerKeyFrom(new Request('https://x.test/'))).toBeNull();
  });
});

describe('cost estimation for dated and unknown models', () => {
  it('prices a dated snapshot as its model family and never prices an unknown model at zero', async () => {
    const { estimateCost } = await import('@/services/metering');
    expect(estimateCost('gpt-5.4-mini-2026-03-17', 1_000_000, 0, 0)).toBeCloseTo(0.75, 5);
    expect(estimateCost('some-new-model', 1_000_000, 0, 0)).toBeGreaterThan(0);
    expect(estimateCost('deterministic', 1_000_000, 0, 1_000_000)).toBe(0);
  });
});
