import { describe, expect, it } from 'vitest';
import { onTopic } from '@/services/claim-support';

/**
 * Found while running the suite against the internal knowledge base: an
 * anticoagulation question in atrial fibrillation retrieved tapeworm and
 * brucellosis rules through incidental words; their dosing text reached the
 * answer's „steps" and the release gate had to withhold the answer. Retrieved
 * rules now count only when they share a specific concept with the question.
 * Synthetic passages; the real-corpus run is recorded in TEST_RESULTS.md.
 */
const Q = 'რომელი ანტიკოაგულანტი და რა დოზა არის დასაბუთებული? წინაგულების ფიბრილაცია, ქრონიკული თირკმლის დაავადება';

describe('onTopic', () => {
  it('drops passages that share only generic words', () => {
    expect(onTopic(Q, 'Tapeworm infections. Dosing for taeniasis is 10 mg/kg orally (single dose).')).toBe(false);
    expect(onTopic('ბრუცელოზის მკურნალობა', 'Nasal obstruction: Diagnosis and management')).toBe(false);
  });
  it('keeps passages on the question subject, across languages', () => {
    expect(onTopic(Q, 'Atrial fibrillation: anticoagulation in chronic kidney disease')).toBe(true);
    expect(onTopic('სეპტიური ართრიტი მოზრდილებში', 'Septic arthritis in adults: empiric antibiotic therapy')).toBe(true);
  });
});
