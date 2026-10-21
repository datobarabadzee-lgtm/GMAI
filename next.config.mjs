/** @type {import('next').NextConfig} */

// Medication identity index (knowledge/medications, ~27 MB of .json.gz shards).
// The runtime reads shards by computed path, so the tracer cannot see them:
// they are included explicitly, compressed, and only in the server functions
// that resolve drug identity. Never bundled for the browser.
const MEDICATION_INDEX = [
  './knowledge/medications/manifest.json',
  './knowledge/medications/casefold.json',
  './knowledge/medications/curated-map.json',
  './knowledge/medications/data/**/*',
  './knowledge/medications/ema/*',
];
const MEDICATION_ROUTES = [
  '/api/medications/**/*',
  '/api/curation/**/*',
  '/api/drug-summary',
  '/api/polypharmacy',
  '/api/orchestrate',
  '/api/agents',
  '/api/eval/drift',
  '/api/documents/generate',
];

// The release manifest (written by prebuild) is read by the version and health
// endpoints; readiness also stats every runtime asset it lists.
const RELEASE = ['./release-manifest.json'];
const TRACE = {
  ...Object.fromEntries(MEDICATION_ROUTES.map((r) => [r, MEDICATION_INDEX])),
  '/api/version': RELEASE,
  '/api/health': [...RELEASE, './knowledge/medications/manifest.json'],
  '/api/health/ready': [...RELEASE, ...MEDICATION_INDEX, './authored/**/*'],
};

// Security headers are set by the application itself so that they hold on any
// host (audit F18), not only where vercel.json is read.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/(.*)', headers: SECURITY_HEADERS },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
      { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
  reactStrictMode: true,
  serverExternalPackages: ['mammoth', 'better-sqlite3'],
  // The brand art is already sized and compressed for the UI; skipping the
  // optimizer keeps a runtime service (and its quota) off the critical path.
  images: { unoptimized: true },
  outputFileTracingIncludes: TRACE,
};
export default nextConfig;
