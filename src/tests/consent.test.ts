import { describe, expect, it } from 'vitest';
import { CONSENT_POINTS, CONSENT_VERSION, CONTROLLER, DISCLOSURE, PROCESSOR } from '@/knowledge/controller';

/**
 * These assert the legal content of the disclosure, not its styling. A silent
 * edit that drops a required element would otherwise ship unnoticed.
 */
describe('Article 24(1) disclosure completeness', () => {
  const joined = DISCLOSURE.map((d) => `${d.labelKa} ${d.bodyKa}`).join(' ');

  it('names the controller and a contact route', () => {
    expect(joined).toContain(CONTROLLER.legalNameKa);
    expect(joined).toContain(CONTROLLER.phone);
    expect(joined).toContain(CONTROLLER.email);
  });

  it('names a data protection officer', () => {
    // Article 33(1) makes this mandatory for a medical institution.
    expect(joined).toContain(CONTROLLER.dpoEmail);
  });

  it('states purpose, legal basis and the governing articles', () => {
    expect(joined).toMatch(/მე-6 მუხლის/);
    expect(joined).toMatch(/37-ე მუხლის/);
  });

  it('states that providing data is voluntary and what refusal costs', () => {
    expect(joined).toMatch(/ნებაყოფლობით/);
    expect(joined).toMatch(/უარის შემთხვევაში/);
  });

  it('names the recipient and the destination country', () => {
    expect(joined).toContain(PROCESSOR.nameEn);
    expect(joined).toContain(PROCESSOR.countryKa);
  });

  it('discloses the absence of an adequacy decision, as Article 37(2)(d) requires', () => {
    // The transfer ground is consent given AFTER being told safeguards are
    // not established. Omitting this sentence invalidates the ground.
    expect(joined).toMatch(/ადეკვატურობის გადაწყვეტილება მიღებული არ არის/);
  });

  it('states the retention position', () => {
    expect(joined).toMatch(/არ ვინახავთ|არ არსებობს/);
  });

  it('lists the data subject rights including withdrawal and complaint', () => {
    expect(joined).toMatch(/გამოიხმოთ თანხმობა/);
    expect(joined).toMatch(/აუდიტის სამსახურს/);
    expect(joined).toMatch(/წაშლა|განადგურება/);
  });

  it('covers all nine information items', () => {
    expect(DISCLOSURE.length).toBeGreaterThanOrEqual(9);
    for (const d of DISCLOSURE) {
      expect(d.labelKa.length).toBeGreaterThan(3);
      expect(d.bodyKa.length).toBeGreaterThan(40);
    }
  });
});

describe('consent affirmations', () => {
  it('asks separately about processing, transfer, scope and voluntariness', () => {
    expect(CONSENT_POINTS.length).toBeGreaterThanOrEqual(4);
    const all = CONSENT_POINTS.join(' ');
    expect(all).toMatch(/ჯანმრთელობის მონაცემი/);
    expect(all).toMatch(/ამერიკის შეერთებულ შტატებში/);
    expect(all).toMatch(/არ სვამს დიაგნოზს/);
    expect(all).toMatch(/გამოხმობა/);
  });

  it('carries a version so a changed disclosure invalidates old consent', () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe('server-side consent enforcement', () => {
  it('requires the consent header for the patient mode', async () => {
    const { readFileSync } = await import('node:fs');
    const route = readFileSync('src/app/api/orchestrate/route.ts', 'utf8');
    // A UI gate alone is a suggestion; the endpoint must refuse.
    expect(route).toContain("x-consent-version");
    expect(route).toContain('CONSENT_REQUIRED');
    expect(route).toMatch(/mode === 'patient'/);
  });

  it('sends the consent header from the client', async () => {
    const { readFileSync } = await import('node:fs');
    const store = readFileSync('src/features/settings/role-store.tsx', 'utf8');
    expect(store).toContain('x-consent-version');
  });
});
