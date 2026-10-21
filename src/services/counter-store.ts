import 'server-only';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * COUNTER STORE (audit F13, 2026-10-21)
 *
 * Rate limits and the daily spend cap need one counter that every instance of
 * the application sees. The limiter talks only to this interface; which store
 * backs it is a deployment decision (LIMIT_STORE):
 *
 *   memory  — this process only. Correct for one long-running process; on
 *             serverless every instance has its own counters. Reported as
 *             shared:false so nobody mistakes it for a site-wide ceiling.
 *   file    — a JSON file guarded by an exclusive lock file. Shared by every
 *             process on one host (or one mounted volume) and survives
 *             restarts. Not for several hosts.
 *   redis   — LIMIT_STORE_URL=redis://[:password@]host:port[/db] (self-hosted
 *             Redis, RESP over TCP) or https://… with LIMIT_STORE_TOKEN
 *             (Upstash-compatible REST). Shared across hosts.
 *
 * Every mutation is a single atomic "add if the result stays within the limit"
 * (incrWithin), so concurrent requests cannot both take the last slot.
 * Values are integers; money is counted in micro-dollars.
 */

export type StoreKind = 'memory' | 'file' | 'redis';

export interface CounterStore {
  readonly kind: StoreKind;
  /** true when every instance of the application sees the same counters. */
  readonly shared: boolean;
  /** Atomically adds `by` (may be negative) if the result is ≤ limit. ttlSec applies when the key is new. */
  incrWithin(key: string, by: number, limit: number, ttlSec: number): Promise<{ ok: boolean; value: number }>;
  get(key: string): Promise<number>;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/* ── memory ─────────────────────────────────────────────────────────────── */

export class MemoryStore implements CounterStore {
  readonly kind = 'memory' as const;
  readonly shared = false;
  private m = new Map<string, { v: number; exp: number }>();
  async incrWithin(key: string, by: number, limit: number, ttlSec: number) {
    const t = nowSec();
    if (this.m.size > 20_000) for (const [k, e] of this.m) if (e.exp <= t) this.m.delete(k);
    const e = this.m.get(key);
    const cur = e && e.exp > t ? e.v : 0;
    if (cur + by > limit) return { ok: false, value: cur };
    this.m.set(key, { v: cur + by, exp: e && e.exp > t ? e.exp : t + ttlSec });
    return { ok: true, value: cur + by };
  }
  async get(key: string) {
    const e = this.m.get(key);
    return e && e.exp > nowSec() ? e.v : 0;
  }
}

/* ── file ───────────────────────────────────────────────────────────────── */

type FileData = Record<string, { v: number; exp: number }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FileStore implements CounterStore {
  readonly kind = 'file' as const;
  readonly shared = true;
  private lock: string;
  constructor(private file: string) {
    this.lock = `${file}.lock`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    const deadline = Date.now() + 5000;
    for (;;) {
      try {
        const fd = fs.openSync(this.lock, 'wx');
        try {
          return fn();
        } finally {
          fs.closeSync(fd);
          fs.rmSync(this.lock, { force: true });
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        // A holder that died leaves its lock behind; a lock older than 10 s is stale.
        try {
          if (Date.now() - fs.statSync(this.lock).mtimeMs > 10_000) fs.rmSync(this.lock, { force: true });
        } catch {
          /* removed meanwhile */
        }
        if (Date.now() > deadline) throw new Error('counter store lock timeout');
        await sleep(2 + Math.random() * 8);
      }
    }
  }

  private read(): FileData {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as FileData;
    } catch {
      return {};
    }
  }

  private write(d: FileData) {
    const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, this.file);
  }

  incrWithin(key: string, by: number, limit: number, ttlSec: number) {
    return this.withLock(() => {
      const t = nowSec();
      const d = this.read();
      for (const k of Object.keys(d)) if (d[k].exp <= t) delete d[k];
      const cur = d[key]?.v ?? 0;
      if (cur + by > limit) return { ok: false, value: cur };
      d[key] = { v: cur + by, exp: d[key]?.exp ?? t + ttlSec };
      this.write(d);
      return { ok: true, value: cur + by };
    });
  }

  async get(key: string) {
    const e = this.read()[key];
    return e && e.exp > nowSec() ? e.v : 0;
  }
}

/* ── redis ──────────────────────────────────────────────────────────────── */

/** Adds ARGV[1] if the result stays ≤ ARGV[2]; sets the TTL when the key is new. */
const INCR_WITHIN_LUA = `local v = tonumber(redis.call('GET', KEYS[1]) or '0')
local by = tonumber(ARGV[1])
if v + by > tonumber(ARGV[2]) then return {0, v} end
local n = redis.call('INCRBY', KEYS[1], by)
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
return {1, n}`;

type RespValue = string | number | null | RespValue[];

function encode(args: (string | number)[]): string {
  return `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('');
}

/** Parses one RESP value from buf at offset; returns [value, nextOffset] or null if incomplete. */
function parse(buf: Buffer, at: number): [RespValue, number] | null {
  const eol = buf.indexOf('\r\n', at);
  if (eol < 0) return null;
  const type = String.fromCharCode(buf[at]);
  const line = buf.toString('utf8', at + 1, eol);
  if (type === '+') return [line, eol + 2];
  if (type === '-') throw new Error(`redis: ${line}`);
  if (type === ':') return [Number(line), eol + 2];
  if (type === '$') {
    const n = Number(line);
    if (n < 0) return [null, eol + 2];
    if (buf.length < eol + 2 + n + 2) return null;
    return [buf.toString('utf8', eol + 2, eol + 2 + n), eol + 2 + n + 2];
  }
  if (type === '*') {
    const n = Number(line);
    if (n < 0) return [null, eol + 2];
    const out: RespValue[] = [];
    let p = eol + 2;
    for (let i = 0; i < n; i++) {
      const r = parse(buf, p);
      if (!r) return null;
      out.push(r[0]);
      p = r[1];
    }
    return [out, p];
  }
  throw new Error(`redis: unexpected reply type ${type}`);
}

/** One short-lived connection per command batch: no pooling state to leak across serverless invocations. */
function respCommand(url: URL, commands: (string | number)[][]): Promise<RespValue[]> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: url.hostname, port: Number(url.port || 6379) });
    sock.setTimeout(3000, () => sock.destroy(new Error('redis timeout')));
    const pre: (string | number)[][] = [];
    if (url.password) pre.push(url.username ? ['AUTH', decodeURIComponent(url.username), decodeURIComponent(url.password)] : ['AUTH', decodeURIComponent(url.password)]);
    const db = url.pathname.replace('/', '');
    if (db) pre.push(['SELECT', db]);
    const all = [...pre, ...commands];
    let buf = Buffer.alloc(0);
    const replies: RespValue[] = [];
    sock.on('connect', () => sock.write(all.map(encode).join('')));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        let at = 0;
        for (let r = parse(buf, at); r; r = parse(buf, at)) {
          replies.push(r[0]);
          at = r[1];
        }
        buf = buf.subarray(at);
      } catch (e) {
        sock.destroy();
        reject(e);
        return;
      }
      if (replies.length >= all.length) {
        sock.end();
        resolve(replies.slice(pre.length));
      }
    });
    sock.on('error', reject);
  });
}

export class RedisStore implements CounterStore {
  readonly kind = 'redis' as const;
  readonly shared = true;
  private url: URL;
  constructor(url: string, private token?: string) {
    this.url = new URL(url);
  }
  private async run(cmd: (string | number)[]): Promise<RespValue> {
    if (this.url.protocol === 'redis:') return (await respCommand(this.url, [cmd]))[0];
    // Upstash-compatible REST: POST the command as a JSON array.
    const res = await fetch(this.url, { method: 'POST', headers: { authorization: `Bearer ${this.token ?? ''}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd.map(String)), signal: AbortSignal.timeout(3000) });
    const j = (await res.json()) as { result?: RespValue; error?: string };
    if (!res.ok || j.error) throw new Error(`redis rest: ${j.error ?? res.status}`);
    return j.result ?? null;
  }
  async incrWithin(key: string, by: number, limit: number, ttlSec: number) {
    const r = (await this.run(['EVAL', INCR_WITHIN_LUA, 1, key, by, limit, ttlSec])) as [number, number];
    return { ok: Number(r[0]) === 1, value: Number(r[1]) };
  }
  async get(key: string) {
    return Number((await this.run(['GET', key])) ?? 0);
  }
}

/* ── selection ──────────────────────────────────────────────────────────── */

let store: CounterStore | null = null;

export function counterStore(): CounterStore {
  if (store) return store;
  const kind = (process.env.LIMIT_STORE ?? 'memory').toLowerCase();
  if (kind === 'redis' && process.env.LIMIT_STORE_URL) store = new RedisStore(process.env.LIMIT_STORE_URL, process.env.LIMIT_STORE_TOKEN);
  else if (kind === 'file') store = new FileStore(process.env.LIMIT_STORE_PATH ?? path.join(process.cwd(), 'data', 'runtime', 'limits.json'));
  else store = new MemoryStore();
  return store;
}

/** Test seam. */
export function __setCounterStore(s: CounterStore | null) {
  store = s;
}
