/**
 * npm run docs:gen — regenerates docs/ENVIRONMENT_SCHEMA.md (from
 * src/config/env-schema.json) and docs/AGENT_MATRIX.md (from the agent registry,
 * the implementations and the test files that exercise each agent).
 */
import fs from 'node:fs';
import path from 'node:path';
import schema from '../src/config/env-schema.json';
import { AGENTS } from '../src/agents/registry';
import { AGENT_IMPLEMENTATIONS } from '../src/agents/implementations';

const ROOT = process.cwd();
const REQ_KA: Record<string, string> = {
  always: 'ყოველთვის (ცხადად)',
  self_hosted: 'საკუთარ ჰოსტზე',
  internal_admin: 'internal + ადმინისტრაციული ჩაწერა',
  platform_ai: 'პლატფორმის AI-სთვის',
  byok_only_host: 'როცა პლატფორმის AI გასაღები არ არის',
  multi_instance: 'რამდენიმე პროცესი/ინსტანცია',
  when_redis: 'LIMIT_STORE=redis',
  internal_kb: 'internal ცოდნის ბაზა',
  optional: 'არასავალდებულო',
};
const env = [
  '# გარემოს ცვლადების სქემა (ENVIRONMENT_SCHEMA)',
  '',
  'წყარო: `src/config/env-schema.json` · გენერირებულია `npm run docs:gen`-ით. შემოწმება (მხოლოდ present/missing, მნიშვნელობა არასოდეს იბეჭდება):',
  '',
  '```',
  'npm run env:check -- --hosting self_hosted --env-file .env.production',
  'npm run env:check -- --hosting vercel',
  '```',
  '',
  'იგივე შემოწმება შედის `/api/health/ready`-ში (check `environment`). საიდუმლო (secret) ცვლადი მხოლოდ ჰოსტის secret store-ში; `.env.example`-ში ცარიელია.',
  '',
  '| ცვლადი | ჯგუფი | როდის სავალდებულო | secret | ნაგულისხმევი | აღწერა |',
  '|---|---|---|---|---|---|',
  ...schema.variables.map((v) => `| \`${v.name}\` | ${v.group} | ${REQ_KA[v.required] ?? v.required} | ${v.secret ? 'კი' : '—'} | ${v.default === null ? '—' : `\`${v.default}\``} | ${(v.ka || '').replace(/\|/g, '\\|')}${'values' in v && v.values ? ` (${(v.values as string[]).join(' / ')})` : ''} |`),
].join('\n');
fs.writeFileSync(path.join(ROOT, 'docs/ENVIRONMENT_SCHEMA.md'), env + '\n');

const tests = fs.readdirSync(path.join(ROOT, 'src/tests')).filter((f) => f.endsWith('.test.ts'));
const testText = Object.fromEntries(tests.map((f) => [f, fs.readFileSync(path.join(ROOT, 'src/tests', f), 'utf8')]));
const STAGE: Record<string, string> = {
  A12: 'ორკესტრატორში დეტერმინისტული; /api/documents/generate — AI შევსება + სერვერული document-guard (A12 ტელემეტრია), ექსპორტი „პროექტი“',
  A07: 'დეტერმინისტული, მედიკამენტის იდენტობის კარიბჭის მიღმა; /api/drug-summary — AI ქართული შეჯამება მხოლოდ დადასტურებულ პროდუქტზე, typed შემოწმებით', A00: 'ორკესტრატორი (გეგმა, მარშრუტი) + AI სინთეზი (OpenAI Responses), ერთადერთი მოდელზე დამოკიდებული ნაბიჯი', A19: 'დეტერმინისტული ვერიფიკატორი (რიცხვი-კონტექსტი, ციტირება, სიახლე, წინააღმდეგობა)', A20: 'დეტერმინისტული release gate + release contract' };
const FAIL: Record<string, string> = {
  A00: 'პროვაიდერის შეფერხება → public: 503/429/401 მიზეზით; internal: ძრავის შედეგი მონიშნული (ai-outage.test)',
  A19: 'დაუდასტურებელი დოზა R3+ → BLOCK; სხვა → HUMAN_REVIEW (release-contract, numeric-context)',
  A20: 'BLOCK → ყველა გამოსავალი შეკავებულია (release-contract)',
};
const matrix = [
  '# 21 აგენტის მატრიცა',
  '',
  'გენერირებულია `npm run docs:gen`-ით რეესტრიდან (`src/agents/registry.ts`), იმპლემენტაციებიდან და ტესტებიდან. „ტესტები“ — ფაილები, სადაც აგენტის ID ჩანს. ყველა აგენტისთვის: შესრულება ფიქსირდება `trace`-ში (ok / skipped / insufficient_input / unavailable / error / timeout, `AGENT_TIMEOUT_MS`), `/api/agents` აჩვენებს `observed` სტატისტიკას. ეს ინჟინერული შემოწმებაა და არა კლინიკური ვალიდაცია.',
  '',
  '| ID | აგენტი | შემავალი (სავალდ. / არასავალდ.) | ძრავა | ხელსაწყოები / წყარო | გამოსავალი | რისკი | ჩავარდნის ქცევა | ტესტები |',
  '|---|---|---|---|---|---|---|---|---|',
  ...AGENTS.map((a) => {
    const engine = STAGE[a.id] ?? (AGENT_IMPLEMENTATIONS[a.id] ? 'დეტერმინისტული ფუნქცია (AI არ იძახებს)' : '—');
    const fail = FAIL[a.id] ?? 'ცარიელი/არასაკმარისი შემავალი → ცხადი სტატუსი, claims არ იქმნება (agent-failure.test); გამონაკლისი → error; ვადა → timeout';
    const t = tests.filter((f) => new RegExp(`\\b${a.id}\\b`).test(testText[f])).map((f) => f.replace('.test.ts', ''));
    return `| ${a.id} | ${a.nameKa} | ${a.requiredInputs.join(', ')}${a.optionalInputs.length ? ` / ${a.optionalInputs.join(', ')}` : ''} | ${engine} | ${a.tools.join(', ')} | ${a.outputSchema} | ${a.riskClass} | ${fail} | ${t.join(', ') || '—'} |`;
  }),
].join('\n');
fs.writeFileSync(path.join(ROOT, 'docs/AGENT_MATRIX.md'), matrix + '\n');
console.log(`ENVIRONMENT_SCHEMA.md (${schema.variables.length} vars), AGENT_MATRIX.md (${AGENTS.length} agents)`);
