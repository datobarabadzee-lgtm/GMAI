import 'server-only';
import OpenAI from 'openai';

/**
 * AI PROVIDER ABSTRACTION.
 *
 * The platform is model-agnostic: the model id, reasoning effort and output caps
 * are configuration, never literals in agent code. Secrets are read from the
 * environment on the server only and are never returned to the client — the UI
 * receives `engineStatus()`, which reports whether a key exists and nothing more.
 *
 * Requests go through the OpenAI Responses API using the official SDK, so that
 * reasoning effort and real token accounting are first-class rather than
 * reconstructed from the text.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type CompletionRequest = {
  messages: ChatMessage[];
  /** Routing hint. Both tiers resolve to the configured model unless an explicit
   *  reasoning model is set, so a costlier model is never selected implicitly. */
  tier: 'fast' | 'reasoning';
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
  /** Use the operator-configured fallback model (AI_MODEL_FALLBACK) for this call. */
  useFallback?: boolean;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

/** What the model actually returned, together with what it actually cost. */
export type CompletionResult = {
  text: string;
  /** The model id the API reports having served — not the one we asked for. */
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  truncated: boolean;
};

export type ProviderInfo = { engine: 'mock' | 'live'; provider: string; fast: string; reasoning: string };

export interface AiProvider {
  readonly name: string;
  readonly live: boolean;
  info(): ProviderInfo;
  complete(req: CompletionRequest): Promise<string>;
  completeDetailed(req: CompletionRequest): Promise<CompletionResult>;
}

type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

const EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

function effortFrom(value: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  return EFFORTS.includes(value as ReasoningEffort) ? (value as ReasoningEffort) : fallback;
}

const env = () => {
  // One model id drives the whole platform. AI_MODEL_FAST / AI_MODEL_REASONING
  // remain supported for deployments that deliberately split the two, but they
  // default to the same model so nothing silently escalates to a costlier one.
  const model = process.env.OPENAI_MODEL ?? 'gpt-6-luna';
  return {
    provider: process.env.AI_PROVIDER ?? 'openai',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',
    model,
    fast: process.env.AI_MODEL_FAST ?? model,
    reasoning: process.env.AI_MODEL_REASONING ?? model,
    /** Ordinary answers run at low effort; deeper reasoning is opt-in per deployment. */
    effortFast: effortFrom(process.env.OPENAI_REASONING_EFFORT, 'low'),
    effortReasoning: effortFrom(process.env.OPENAI_REASONING_EFFORT_DEEP ?? process.env.OPENAI_REASONING_EFFORT, 'low'),
    maxOutputFast: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 1600),
    maxOutputReasoning: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS_DEEP ?? 3000),
    timeout: Number(process.env.AI_TIMEOUT_MS ?? 90000),
  };
};

class MockProvider implements AiProvider {
  readonly name = 'mock';
  readonly live = false;
  info(): ProviderInfo {
    const e = env();
    return { engine: 'mock', provider: 'deterministic-mock', fast: e.fast, reasoning: e.reasoning };
  }
  async complete(): Promise<string> {
    return '';
  }
  async completeDetailed(): Promise<CompletionResult> {
    return { text: '', model: 'deterministic', usage: { ...EMPTY_USAGE }, latencyMs: 0, truncated: false };
  }
}

class OpenAiResponsesProvider implements AiProvider {
  readonly name: string;
  readonly live = true;
  private client: OpenAI;

  constructor(name: string, overrideKey?: string) {
    this.name = name;
    const e = env();
    this.client = new OpenAI({
      apiKey: overrideKey || e.apiKey,
      // Only override when the deployment points at a compatible gateway.
      ...(e.baseUrl === 'https://api.openai.com/v1' ? {} : { baseURL: e.baseUrl }),
      timeout: e.timeout,
      maxRetries: 2,
    });
  }

  info(): ProviderInfo {
    const e = env();
    return { engine: 'live', provider: e.provider, fast: e.fast, reasoning: e.reasoning };
  }

  async completeDetailed(req: CompletionRequest): Promise<CompletionResult> {
    const e = env();
    // The fallback model is used only when the operator configured one; it is
    // never chosen implicitly, so cost cannot rise without an explicit setting.
    const model = req.useFallback && process.env.AI_MODEL_FALLBACK ? process.env.AI_MODEL_FALLBACK : req.tier === 'reasoning' ? e.reasoning : e.fast;
    const effort = req.tier === 'reasoning' ? e.effortReasoning : e.effortFast;
    const cap = req.maxTokens ?? (req.tier === 'reasoning' ? e.maxOutputReasoning : e.maxOutputFast);

    // The Responses API takes system guidance as `developer`.
    const input = req.messages.map((m) => ({
      role: m.role === 'system' ? ('developer' as const) : m.role,
      content: m.content,
    }));

    const started = Date.now();
    const res = await this.client.responses.create(
      {
        model,
        input,
        // The Responses API stores every response by default. Nothing here is
        // ever retrieved later, and the input may contain health data, so
        // storage is switched off explicitly.
        store: false,
        reasoning: { effort },
        max_output_tokens: cap,
        ...(req.json ? { text: { format: { type: 'json_object' as const } } } : {}),
      },
      { signal: req.signal },
    );

    const u = res.usage;
    return {
      text: res.output_text ?? '',
      model: res.model ?? model,
      usage: {
        inputTokens: u?.input_tokens ?? 0,
        cachedInputTokens: u?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: u?.output_tokens ?? 0,
        reasoningTokens: u?.output_tokens_details?.reasoning_tokens ?? 0,
        totalTokens: u?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
      truncated: res.status === 'incomplete',
    };
  }

  async complete(req: CompletionRequest): Promise<string> {
    return (await this.completeDetailed(req)).text;
  }
}

let cached: AiProvider | null = null;

export function getProvider(): AiProvider {
  if (cached) return cached;
  const e = env();
  cached = e.apiKey ? new OpenAiResponsesProvider(e.provider) : new MockProvider();
  return cached;
}

/**
 * Validates a caller-supplied key before it is used.
 * Only the shape is checked here; the provider rejects an invalid key itself.
 * A caller key is never cached, never logged and never written anywhere: it
 * lives for the duration of one request and is then discarded with the object.
 */
export function isPlausibleKey(key: string): boolean {
  return /^sk-[A-Za-z0-9_-]{20,200}$/.test(key.trim());
}

/**
 * Provider for a single request. When the visitor attached their own key the
 * work is billed to them, so a fresh client is built for that request only.
 * Falls back to the platform provider when no usable key was supplied.
 */
export function getProviderFor(callerKey?: string | null): { provider: AiProvider; ownKey: boolean } {
  const key = (callerKey ?? '').trim();
  if (key && isPlausibleKey(key)) {
    return { provider: new OpenAiResponsesProvider(env().provider, key), ownKey: true };
  }
  return { provider: getProvider(), ownKey: false };
}

/** The header a client uses to attach its own key. */
export const CALLER_KEY_HEADER = 'x-user-api-key';

export function callerKeyFrom(req: Request): string | null {
  const v = req.headers.get(CALLER_KEY_HEADER);
  return v && v.trim() ? v.trim() : null;
}

/** Test seam: forces the next getProvider() to re-read the environment. */
export function resetProvider() {
  cached = null;
}

/** Safe, non-secret status for the UI engine indicator. */
export function engineStatus(): { engine: 'mock' | 'live'; label: string } {
  const live = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return { engine: live ? 'live' : 'mock', label: live ? 'Live' : 'Demo' };
}

/** The model id this deployment is configured to use. Not a secret. */
export function configuredModel(): string {
  return env().model;
}
