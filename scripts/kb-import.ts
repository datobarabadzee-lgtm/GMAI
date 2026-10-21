/**
 * CLI: npm run kb:import [-- --dir <path>]
 * Builds data/gmai-kb.sqlite from the internal corpus. Idempotent: re-running
 * with identical files is a no-op (file hash match).
 */
import path from 'node:path';
import { runImport } from '../src/kb/import';

const argIdx = process.argv.indexOf('--dir');
const dir = argIdx > -1 ? process.argv[argIdx + 1] : (process.env.KB_SOURCE_DIR ?? path.join(process.cwd(), 'knowledge-source'));

runImport(dir, (m) => process.stdout.write(`  · ${m}\n`))
  .then((r) => {
    process.stdout.write(`\nstatus: ${r.status}  run: ${r.runId}\n`);
    process.stdout.write(`embedding: ${r.embedding.provider} / ${r.embedding.model} (${r.embedding.dim}d, semantic=${r.embedding.semantic})\n`);
    Object.entries(r.counts).forEach(([k, v]) => process.stdout.write(`${k.padEnd(24)} ${v}\n`));
    if (r.quarantined.length) {
      process.stdout.write(`\nquarantined (first 10):\n`);
      r.quarantined.slice(0, 10).forEach((q) => process.stdout.write(`  ${q.recordId} [${q.code}] ${q.message}\n`));
    }
    if (r.status === 'FAILED') process.exitCode = 1;
  })
  .catch((e) => {
    process.stderr.write(`import failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
