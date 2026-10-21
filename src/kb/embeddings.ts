/**
 * EMBEDDING PROVIDER ABSTRACTION.
 *
 * Two implementations ship:
 *
 *  - `hash`   — offline, deterministic, zero-dependency. Projects token and
 *               character-trigram features into a fixed-dimension unit vector.
 *               It is a real vector space with real cosine similarity, but it is
 *               NOT a trained language model: it captures morphological and
 *               lexical overlap, not learned semantics. The UI labels it as such.
 *  - `openai` — text-embedding-3-small (or any OpenAI-compatible endpoint).
 *
 * The model name and dimension are stored with every vector, so re-embedding
 * with a different provider never silently mixes vector spaces.
 */

export type EmbeddingVector = { model: string; dim: number; values: Float32Array };

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dim: number;
  readonly semantic: boolean;
  readonly labelKa: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/* ── offline hashed-feature provider ─────────────────────────────────────── */

const DIM = 384;

function hash32(str: string, seed: number): number {
  let h = seed ^ 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeForIndex(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[_\-/\\]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.%<>=+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function features(text: string): Map<number, number> {
  const norm = normalizeForIndex(text);
  const out = new Map<number, number>();
  const bump = (key: string, weight: number, seed: number) => {
    const idx = hash32(key, seed) % DIM;
    out.set(idx, (out.get(idx) ?? 0) + weight);
  };
  const tokens = norm.split(' ').filter(Boolean);
  tokens.forEach((t) => {
    bump(t, 1, 1);
    for (let i = 0; i + 3 <= t.length; i++) bump(t.slice(i, i + 3), 0.45, 2);
  });
  for (let i = 0; i + 1 < tokens.length; i++) bump(`${tokens[i]} ${tokens[i + 1]}`, 0.7, 3);
  return out;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'hash';
  readonly model = 'gmai-hash-ngram-v1';
  readonly dim = DIM;
  readonly semantic = false;
  readonly labelKa = 'ოფლაინ ჰეშ-ვექტორი (ლექსიკურ-მორფოლოგიური, არა ნასწავლი მოდელი)';
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(DIM);
      features(t).forEach((w, i) => {
        v[i] = w;
      });
      let norm = 0;
      for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < DIM; i++) v[i] /= norm;
      return v;
    });
  }
}

/* ── OpenAI-compatible provider ──────────────────────────────────────────── */

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';
  readonly semantic = true;
  readonly labelKa = 'OpenAI-თავსებადი ემბედინგები (ნასწავლი სემანტიკური მოდელი)';
  constructor(
    readonly model: string,
    readonly dim: number,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    const BATCH = 96;
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, input: slice }),
      });
      if (!res.ok) throw new Error(`EMBEDDING_HTTP_${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      json.data.forEach((d) => {
        const v = Float32Array.from(d.embedding);
        let n = 0;
        for (let k = 0; k < v.length; k++) n += v[k] * v[k];
        n = Math.sqrt(n) || 1;
        for (let k = 0; k < v.length; k++) v[k] /= n;
        out.push(v);
      });
    }
    return out;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const wanted = (process.env.EMBEDDING_PROVIDER ?? 'auto').toLowerCase();
  const key = process.env.EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? '';
  const base = (process.env.EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const dim = Number(process.env.EMBEDDING_DIM ?? 1536);

  if (wanted === 'hash') return new HashEmbeddingProvider();
  if (wanted === 'openai' || (wanted === 'auto' && key)) {
    if (!key) throw new Error('EMBEDDING_PROVIDER=openai requires EMBEDDING_API_KEY or AI_API_KEY');
    return new OpenAiEmbeddingProvider(model, dim, base, key);
  }
  return new HashEmbeddingProvider();
}

/* ── vector storage helpers ──────────────────────────────────────────────── */

export const vectorToBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const blobToVector = (b: Buffer): Float32Array => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
