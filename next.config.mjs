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

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['mammoth', 'better-sqlite3'],
  // The brand art is already sized and compressed for the UI; skipping the
  // optimizer keeps a runtime service (and its quota) off the critical path.
  images: { unoptimized: true },
  outputFileTracingIncludes: Object.fromEntries(MEDICATION_ROUTES.map((r) => [r, MEDICATION_INDEX])),
};
export default nextConfig;
