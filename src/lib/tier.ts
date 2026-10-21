/**
 * Deployment tier.
 *
 * Both tiers serve the same nineteen modules. They differ in what backs them:
 *
 * `internal` — runs beside the imported knowledge base, so clinical and quality
 * answers are grounded in the licensed corpus and carry internal rule citations.
 * The operator dashboards (/admin, /dev) are available behind ENABLE_DEV_TOOLS.
 *
 * `public`   — the deployment that may be published on the open internet and
 * installed on a phone. Every module's own engine ships with it: the eighteen
 * deterministic calculators, the medication-review rules, laboratory
 * interpretation, document templates, the defect taxonomy and the source
 * registry are all program code and work in full. What does NOT ship is the
 * licensed clinical corpus — it lives only in the SQLite database, which is
 * never uploaded — so clinical answers here are reasoned and cited from the
 * open source registry rather than from internal rules. Operator dashboards
 * are closed because they exist to inspect a knowledge base that is absent.
 */
export type AppTier = 'public' | 'internal';

export function appTier(): AppTier {
  return process.env.APP_TIER === 'public' ? 'public' : 'internal';
}

/** Operator tooling. Closed in the public tier; there is no knowledge base to inspect. */
export const INTERNAL_ONLY_PREFIXES = ['/admin', '/dev'] as const;

/** APIs that read the knowledge base or the usage ledger — both internal-only. */
export const INTERNAL_ONLY_APIS = ['/api/kb/search', '/api/kb/health', '/api/usage'] as const;

/** Every clinical mode is reachable publicly; grounding, not access, is what differs. */
export const PUBLIC_MODES = [
  'quick', 'deep', 'evidence', 'challenge', 'missing', 'quality', 'second-opinion', 'patient', 'academy',
] as const;

export function isPublicPage(pathname: string): boolean {
  return !INTERNAL_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPublicApi(pathname: string): boolean {
  return !(INTERNAL_ONLY_APIS as readonly string[]).includes(pathname);
}

export const TIER_LABEL_KA: Record<AppTier, string> = {
  public: 'საჯარო ვერსია',
  internal: 'შიდა ვერსია',
};
