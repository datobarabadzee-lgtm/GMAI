import schema from '@/config/env-schema.json';

/**
 * ENVIRONMENT CHECK (audit F18, 2026-10-21)
 *
 * Evaluates the environment against src/config/env-schema.json and reports
 * PRESENCE only: never a value, a prefix, a length or a hash of a secret. Used
 * by `npm run env:check` and by /api/health/ready.
 */

export type EnvVar = (typeof schema.variables)[number] & { min_length?: number; values?: string[] };
export type EnvProfile = { hosting: 'vercel' | 'self_hosted'; tier?: 'public' | 'internal' };
export type EnvFinding = { name: string; level: 'error' | 'warning' | 'ok'; present: boolean; messageKa: string; secret: boolean };

export const ENV_VARS = schema.variables as EnvVar[];

const has = (env: Record<string, string | undefined>, n: string) => typeof env[n] === 'string' && env[n]!.trim() !== '';

export function checkEnv(env: Record<string, string | undefined>, profile: EnvProfile): { ok: boolean; findings: EnvFinding[] } {
  const tier = profile.tier ?? (env.APP_TIER === 'internal' ? 'internal' : 'public');
  const platformKey = has(env, 'OPENAI_API_KEY') || has(env, 'AI_API_KEY');
  const findings: EnvFinding[] = [];
  for (const v of ENV_VARS) {
    const present = has(env, v.name);
    let level: EnvFinding['level'] = 'ok';
    let msg = present ? 'მითითებულია' : 'არ არის მითითებული (ნაგულისხმევი)';
    const need = (cond: boolean, lvl: 'error' | 'warning', why: string) => {
      if (cond && !present) {
        level = lvl;
        msg = why;
      }
    };
    switch (v.required) {
      case 'always':
        need(true, 'error', 'სავალდებულოა და ცხადად უნდა იყოს მითითებული');
        break;
      case 'self_hosted':
        need(profile.hosting === 'self_hosted', 'error', 'სავალდებულოა საკუთარ ჰოსტზე (reverse proxy-ის უკან Origin შემოწმებისთვის)');
        break;
      case 'internal_admin':
        need(tier === 'internal', 'warning', 'internal-ში ადმინისტრაციული ჩაწერები დახურული იქნება, სანამ არ მიეთითება');
        break;
      case 'platform_ai':
        need(true, 'warning', 'პლატფორმის AI გამორთულია — AI მხოლოდ მომხმარებლის საკუთარი გასაღებით (BYOK)');
        break;
      case 'byok_only_host':
        need(!platformKey, 'error', 'პლატფორმის AI გასაღების გარეშე ჰოსტზე სავალდებულოა (პრეპარატის დადასტურების ქვითარი)');
        break;
      case 'multi_instance':
        if (!present || env[v.name] === 'memory') {
          level = profile.hosting === 'vercel' ? 'warning' : 'ok';
          msg = profile.hosting === 'vercel' ? 'memory: თითოეულ serverless ინსტანციას საკუთარი მრიცხველი აქვს — ლიმიტი საიტის მასშტაბით არ არის გარანტირებული' : 'memory: სწორია მხოლოდ ერთ პროცესზე; რამდენიმე პროცესზე გამოიყენეთ file ან redis';
        }
        break;
      case 'when_redis':
        need(env.LIMIT_STORE === 'redis', 'error', 'LIMIT_STORE=redis მოითხოვს ამ ცვლადს');
        break;
      case 'internal_kb':
        need(tier === 'internal', 'warning', 'internal ცოდნის ბაზა არ იქნება ხელმისაწვდომი');
        break;
      default:
        break;
    }
    if (present && v.min_length && env[v.name]!.length < v.min_length) {
      level = 'error';
      msg = `მნიშვნელობა მოკლეა (მინ. ${v.min_length} სიმბოლო)`;
    }
    if (present && v.values && !v.values.includes(env[v.name]!)) {
      level = v.name === 'APP_TIER' ? 'error' : 'warning';
      msg = `დაუშვებელი მნიშვნელობა; დასაშვებია: ${v.values.join(', ')}`;
    }
    findings.push({ name: v.name, level, present, messageKa: msg, secret: v.secret });
  }
  return { ok: !findings.some((f) => f.level === 'error'), findings };
}
