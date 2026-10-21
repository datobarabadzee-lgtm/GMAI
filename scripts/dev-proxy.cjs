/**
 * LOCAL TESTING ONLY — not used in production.
 * This sandbox routes outbound HTTPS through an agent proxy. Node's fetch
 * (undici) ignores HTTPS_PROXY, so open-API calls fail locally while working
 * fine on Vercel. This wires undici's global dispatcher to the proxy so the
 * literature and drug-label services can be exercised before deploying.
 */
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  try {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log('[dev-proxy] undici routed via', proxy);
  } catch (e) {
    console.warn('[dev-proxy] undici unavailable:', e.message);
  }
}
