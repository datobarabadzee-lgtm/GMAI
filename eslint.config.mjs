// ESLint flat config (Next 16 removed `next lint`; audit F20).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // CommonJS helper for local debugging only (not part of the application).
  { files: ['scripts/**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  // React Compiler advisory rules (eslint-plugin-react-hooks v7). They flag the
  // existing pattern of reading browser storage / resetting state at the start
  // of an effect: a render-performance concern, not a correctness defect. They
  // stay ENABLED as warnings and are counted in TEST_RESULTS.md; converting the
  // 28 places to useSyncExternalStore/derived state is listed in
  // KNOWN_LIMITATIONS.md (audit F20, PARTIAL).
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'knowledge/**', 'authored/**', 'next-env.d.ts', 'release-out/**', 'coverage/**'],
  },
];

export default config;
