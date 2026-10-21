import { describe, expect, it } from 'vitest';
import { AGENTS, agentById } from '@/agents/registry';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import { SOURCES } from '@/knowledge/sources';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { HOSPITAL_MODULES } from '@/knowledge/hospital';
import { DOC_TEMPLATES, renderDocument, templateById } from '@/knowledge/document-templates';
import { emptyPatientContext } from '@/schemas/clinical';
import { engineStatus } from '@/services/ai-provider';

describe('agent registry integrity', () => {
  it('registers A00 through A20', () => {
    expect(AGENTS.length).toBe(21);
    expect(AGENTS[0].id).toBe('A00');
    expect(AGENTS[AGENTS.length - 1].id).toBe('A20');
  });

  it('binds every executable agent to a real server-side implementation', () => {
    const orchestrationOnly = ['A00', 'A19', 'A20'];
    AGENTS.filter((a) => !orchestrationOnly.includes(a.id)).forEach((a) => {
      expect(typeof AGENT_IMPLEMENTATIONS[a.id]).toBe('function');
    });
  });

  it('declares a guardrail for every agent', () => {
    AGENTS.forEach((a) => expect(a.guardrail.length).toBeGreaterThan(10));
  });

  it('resolves every declared dependency to a registered agent', () => {
    AGENTS.forEach((a) => a.dependencies.forEach((d) => expect(agentById(d)).toBeDefined()));
  });

  it('requires verification on every high-risk agent', () => {
    AGENTS.filter((a) => a.riskClass === 'R4' || a.riskClass === 'R5').forEach((a) => {
      expect(a.verification.length).toBeGreaterThan(0);
    });
  });
});

describe('source registry governance', () => {
  it('gives every source a rights status, freshness state and last-checked date', () => {
    SOURCES.forEach((s) => {
      expect(s.rights_status).toBeTruthy();
      expect(s.freshness).toBeTruthy();
      expect(s.last_checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('never exposes full text for licensed or restricted sources', () => {
    SOURCES.filter((s) => ['LICENSED', 'INTERNAL_REFERENCE', 'RESTRICTED', 'UNKNOWN'].includes(s.rights_status)).forEach((s) => {
      expect(s.fulltext_public).toBe(false);
    });
  });

  it('uses unique source ids', () => {
    expect(new Set(SOURCES.map((s) => s.source_id)).size).toBe(SOURCES.length);
  });

  it('marks unverified Georgian regulatory entries as review_due', () => {
    SOURCES.filter((s) => s.jurisdiction === 'georgia').forEach((s) => {
      expect(['review_due', 'historical']).toContain(s.freshness);
    });
  });
});

describe('privacy posture', () => {
  it('ships demo cases that contain no real identifiers', () => {
    DEMO_CASES.forEach((d) => {
      expect(d.patient.label).toContain('დემო');
      const text = JSON.stringify(d.patient);
      expect(text).not.toMatch(/\b\d{11}\b/); // Georgian personal number length
      expect(text).not.toMatch(/@[\w.-]+\.[a-z]{2,}/i); // e-mail
    });
  });

  it('creates an empty case with no persistent identifiers', () => {
    const p = emptyPatientContext();
    expect(p.documents).toEqual([]);
    expect(p.narrative).toBe('');
  });

  it('never reports a secret through the engine status', () => {
    const s = engineStatus();
    expect(Object.keys(s)).toEqual(['engine', 'label']);
    expect(JSON.stringify(s)).not.toContain('sk-');
  });
});

describe('hospital and documentation catalogues', () => {
  it('describes inputs, outputs, safety boundaries and agents for every hospital module', () => {
    HOSPITAL_MODULES.forEach((m) => {
      expect(m.whatAiDoes.length).toBeGreaterThan(0);
      expect(m.inputs.length).toBeGreaterThan(0);
      expect(m.outputs.length).toBeGreaterThan(0);
      expect(m.safetyBoundaries.length).toBeGreaterThan(0);
      expect(m.connectedAgents.length).toBeGreaterThan(0);
    });
  });

  it('renders a Form 100 draft with the required sections and a signature block', () => {
    const t = templateById('form100')!;
    const doc = renderDocument(t, emptyPatientContext(), { clinicalData: '', author: 'ექიმი', institution: 'კლინიკა', date: '01/09/2024' });
    expect(doc).toContain('დიაგნოზი (ICD-10)');
    expect(doc).toContain('ხელმოწერა');
  });

  it('adds governance metadata to SOP-type documents', () => {
    const t = templateById('sop')!;
    const doc = renderDocument(t, emptyPatientContext(), { clinicalData: '', author: 'ა', institution: 'ბ', date: '01/09/2024' });
    expect(doc).toContain('სარეგისტრაციო ნომერი');
    expect(doc).toContain('ვერსია');
    expect(doc).toContain('ძალაში შესვლის თარიღი');
    expect(doc).toContain('შემდეგი განხილვის თარიღი');
    expect(doc).toContain('დაამტკიცა: Davit Barabadze');
  });

  it('marks every clinical document as requiring clinician sign-off', () => {
    DOC_TEMPLATES.filter((t) => t.audience === 'clinician').forEach((t) => expect(t.requiresSignature).toBe(true));
  });
});
