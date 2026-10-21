/**
 * Post-build guard.
 *
 * A missing postcss.config.mjs does not fail `next build` — it silently produces
 * a stylesheet with no Tailwind utilities, so the site deploys and renders as
 * unstyled blocks. This checks the actual build output for utilities that every
 * page depends on, and fails loudly instead.
 */
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_CONFIG = ['postcss.config.mjs', 'next.config.mjs', 'tailwind.config.ts'];
const REQUIRED_RULES = ['.flex{display:flex}', '.grid{display:grid}', '.hidden{display:none}'];

const missingConfig = REQUIRED_CONFIG.filter((f) => !fs.existsSync(path.join(process.cwd(), f)));
if (missingConfig.length) {
  console.error(`✗ build config missing: ${missingConfig.join(', ')}`);
  process.exit(1);
}

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [];
      })
    : [];

const sheets = walk(path.join(process.cwd(), '.next'));
if (!sheets.length) {
  console.error('✗ no stylesheet in .next — did the build run?');
  process.exit(1);
}

const css = sheets.map((f) => fs.readFileSync(f, 'utf8')).join('');
const missingRules = REQUIRED_RULES.filter((r) => !css.includes(r));
if (missingRules.length) {
  console.error(`✗ stylesheet is missing Tailwind utilities (${missingRules.join(', ')}).`);
  console.error('  The CSS pipeline did not run. Check that postcss.config.mjs reached the build.');
  process.exit(1);
}

console.log(`✓ stylesheet ok — ${sheets.length} file(s), ${Math.round(css.length / 1024)} KB, utilities present`);
