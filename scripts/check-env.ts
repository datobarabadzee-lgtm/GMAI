/**
 * npm run env:check -- [--hosting self_hosted|vercel] [--tier public|internal] [--env-file .env.production]
 *
 * Prints, for every variable in src/config/env-schema.json, whether it is
 * present and whether that is acceptable for the chosen profile. Never prints a
 * value. Exit code 1 when a required variable is missing or invalid.
 */
import fs from 'node:fs';
import { checkEnv } from '../src/server/env-check';

const args = process.argv.slice(2);
const at = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const env: Record<string, string | undefined> = { ...process.env };
const file = at('--env-file');
if (file) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const hosting = (at('--hosting') as 'vercel' | 'self_hosted') ?? (process.env.VERCEL ? 'vercel' : 'self_hosted');
const tier = at('--tier') as 'public' | 'internal' | undefined;
const { ok, findings } = checkEnv(env, { hosting, tier });
const mark = { ok: '  ok  ', warning: ' WARN ', error: ' FAIL ' } as const;
console.log(`profile: hosting=${hosting} tier=${tier ?? env.APP_TIER ?? '(unset → public)'}\n`);
for (const f of findings) console.log(`[${mark[f.level]}] ${f.name.padEnd(32)} ${f.present ? 'present' : 'missing'}${f.secret ? ' (secret)' : ''} — ${f.messageKa}`);
console.log(`\n${ok ? 'OK' : 'FAILED'}: ${findings.filter((f) => f.level === 'error').length} error(s), ${findings.filter((f) => f.level === 'warning').length} warning(s). Values are never printed.`);
process.exit(ok ? 0 : 1);
