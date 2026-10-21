/**
 * Runs once when the server starts (Next.js instrumentation hook).
 *
 * A line such as `OPENAI_API_KEY=` in an env file sets the variable to an empty
 * string, and `env[name] ?? fallback` then keeps the empty string instead
 * of the fallback. Empty values are treated as unset, so .env.example can be
 * copied as-is without silently disabling a fallback.
 */
export function register() {
  for (const [k, v] of Object.entries(process.env)) if (v === '') delete process.env[k];
}
