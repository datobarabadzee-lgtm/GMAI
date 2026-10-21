import type { Claim } from '@/schemas/evidence';
import { tokenize, retrieveText } from './retrieval';
import { sourceById } from '@/knowledge/sources';

/**
 * CITATION & CLAIM VERIFICATION (A19).
 * Every clinically consequential claim is matched to registry sources.
 * An unsupported major claim must never be published as a definitive recommendation.
 */

const CRITICAL_PATTERNS = /(მგ|მკგ|დოზ|ინტერვალ|ზღვარ|უკუნაჩვენებ|რეკომენდებულ|კრიტიკულ|მლ\/წთ|ქულა)/i;

export function classifyImportance(claim: string): Claim['clinical_importance'] {
  if (CRITICAL_PATTERNS.test(claim)) return 'critical';
  if (claim.length > 60) return 'major';
  return 'minor';
}

export function verifyClaims(claims: string[], candidateSourceIds: string[] = []): Claim[] {
  return claims.filter(Boolean).map((text, i) => {
    const tokens = tokenize(text);
    const pool = candidateSourceIds.length ? (candidateSourceIds.map(sourceById).filter(Boolean) as NonNullable<ReturnType<typeof sourceById>>[]) : retrieveText(text, 5).map((h) => h.source);

    const scored = pool
      .map((s) => {
        const corpus = [s.title, s.key_finding, s.excerpt, ...s.keywords].join(' ').toLowerCase();
        const matched = tokens.filter((t) => corpus.includes(t));
        return { s, ratio: tokens.length ? matched.length / tokens.length : 0 };
      })
      .sort((a, b) => b.ratio - a.ratio);

    const best = scored[0];
    const importance = classifyImportance(text);
    const supporting = scored.filter((x) => x.ratio >= 0.25).map((x) => x.s.source_id);

    const superseded = scored.filter((x) => x.ratio >= 0.25 && x.s.freshness === 'superseded');
    const conflicting = supporting.length > 1 && scored.filter((x) => x.ratio >= 0.25).some((x) => x.s.jurisdiction !== scored[0].s.jurisdiction) && importance === 'critical';

    let status: Claim['verification_status'];
    let strength: Claim['support_strength'];
    if (!best || best.ratio < 0.15) {
      status = 'unsupported';
      strength = 'none';
    } else if (conflicting) {
      status = 'conflicting';
      strength = 'moderate';
    } else if (best.ratio >= 0.45) {
      status = 'supported';
      strength = best.s.evidence_rank <= 2 ? 'strong' : 'moderate';
    } else {
      status = 'partially_supported';
      strength = 'weak';
    }

    return {
      claim_id: `CLM-${i + 1}`,
      claim_text: text,
      clinical_importance: importance,
      source_ids: supporting.length ? supporting : best && best.ratio >= 0.15 ? [best.s.source_id] : [],
      verification_status: status,
      support_strength: strength,
      note: superseded.length ? `გაფრთხილება: დაკავშირებული წყარო მონიშნულია როგორც superseded (${superseded.map((x) => x.s.source_id).join(', ')}).` : '',
    };
  });
}

export function unsupportedMajorClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => (c.clinical_importance === 'critical' || c.clinical_importance === 'major') && (c.verification_status === 'unsupported' || c.verification_status === 'conflicting'));
}
