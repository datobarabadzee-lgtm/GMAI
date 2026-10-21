/**
 * npm run kb:stats — counts of the internal knowledge base (data/gmai-kb.sqlite).
 * Internal tier only (APP_TIER=internal); the public tier has no knowledge base
 * by design and this command says so instead of failing silently (audit F20).
 */
import { kbExists, kbStats, DB_PATH } from '../src/kb/db';
import { appTier } from '../src/lib/tier';

if (appTier() !== 'internal') {
  process.stdout.write('APP_TIER is not "internal" — the public tier has no internal knowledge base. Run with APP_TIER=internal.\n');
  process.exit(0);
}
if (!kbExists()) {
  process.stdout.write(`No knowledge base at ${DB_PATH}. Build it with: APP_TIER=internal npm run kb:import -- --dir <folder with the master JSON files>\n`);
  process.exit(1);
}
const s = kbStats();
for (const [k, v] of Object.entries(s)) process.stdout.write(`${k.padEnd(28)} ${v === null ? 'n/a (re-run kb:import)' : v}\n`);
if (s.taxonomyParentsUnresolved) process.exitCode = 2;
