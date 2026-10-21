import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { FileStore, MemoryStore, RedisStore, __setCounterStore, type CounterStore } from '@/services/counter-store';

/**
 * F13 (audit 2026-10-21): limits and the spend cap lived in one process's
 * memory. These tests prove the shared stores behave as one counter across
 * instances, restarts and concurrent callers, and that the spend reservation
 * cannot be overshot by concurrent runs.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmai-limits-'));

async function race(store: () => CounterStore, n: number, limit: number) {
  const results = await Promise.all(Array.from({ length: n }, () => store().incrWithin('k', 1, limit, 60)));
  return results.filter((r) => r.ok).length;
}

describe('MemoryStore', () => {
  it('is atomic within one process and says it is not shared', async () => {
    const m = new MemoryStore();
    expect(await race(() => m, 50, 20)).toBe(20);
    expect(m.shared).toBe(false);
  });
});

describe('FileStore', () => {
  it('two instances on one file see one counter, and exactly the limit is granted under concurrency', async () => {
    const file = path.join(tmp, 'a.json');
    const a = new FileStore(file);
    const b = new FileStore(file);
    let i = 0;
    expect(await race(() => (i++ % 2 ? a : b), 60, 25)).toBe(25);
    expect(await a.get('k')).toBe(25);
    expect(await b.get('k')).toBe(25);
  });

  it('survives a restart (a new instance reads the persisted value)', async () => {
    const file = path.join(tmp, 'b.json');
    await new FileStore(file).incrWithin('spend', 700, 1000, 60);
    const restarted = new FileStore(file);
    expect(await restarted.get('spend')).toBe(700);
    expect((await restarted.incrWithin('spend', 400, 1000, 60)).ok).toBe(false);
    expect((await restarted.incrWithin('spend', 300, 1000, 60)).ok).toBe(true);
  });

  it('separate OS processes share the counter without losing or over-granting updates', async () => {
    const file = path.join(tmp, 'c.json');
    const script = path.join(tmp, 'worker.ts');
    fs.writeFileSync(
      script,
      `import { FileStore } from '${path.join(process.cwd(), 'src/services/counter-store.ts')}';
void (async () => {
  const s = new FileStore(process.argv[2]);
  let ok = 0;
  for (let i = 0; i < 30; i++) if ((await s.incrWithin('k', 1, 100, 60)).ok) ok++;
  console.log(ok);
})();`,
    );
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    // Four processes running at the same time.
    const procs = await Promise.all(
      Array.from({ length: 4 }, () =>
        new Promise<{ code: number | null; out: string }>((resolve) => {
          const c = spawn(tsx, ['--conditions=react-server', script, file]);
          let out = '';
          c.stdout.on('data', (d) => (out += d));
          c.on('close', (code) => resolve({ code, out }));
        }),
      ),
    );
    const granted = procs.map((p) => Number(p.out.trim()));
    expect(procs.every((p) => p.code === 0)).toBe(true);
    // 4 × 30 attempts against a limit of 100: exactly 100 granted in total.
    expect(granted.reduce((a, b) => a + b, 0)).toBe(100);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).k.v).toBe(100);
  }, 90_000);

  it('expires keys after their TTL', async () => {
    const s = new FileStore(path.join(tmp, 'd.json'));
    await s.incrWithin('short', 1, 10, -1);
    expect(await s.get('short')).toBe(0);
  });
});

/* A real Redis server, when the binary is installed (it is in CI and in the Docker image tests). */
const hasRedis = spawnSync('redis-server', ['--version']).status === 0;
let redis: ChildProcess | null = null;
let redisUrl = '';

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const p = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });
}

describe.runIf(hasRedis)('RedisStore (real redis-server)', () => {
  beforeAll(async () => {
    const port = await freePort();
    redis = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no', '--requirepass', 'test-only-pass'], { stdio: 'ignore' });
    redisUrl = `redis://:test-only-pass@127.0.0.1:${port}/0`;
    for (let i = 0; i < 50; i++) {
      try {
        execFileSync('redis-cli', ['-p', String(port), '-a', 'test-only-pass', 'ping'], { stdio: 'pipe' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  afterAll(() => redis?.kill());

  it('is atomic across two client instances and sets a TTL', async () => {
    const a = new RedisStore(redisUrl);
    const b = new RedisStore(redisUrl);
    let i = 0;
    expect(await race(() => (i++ % 2 ? a : b), 40, 15)).toBe(15);
    expect(await b.get('k')).toBe(15);
    const port = new URL(redisUrl).port;
    const ttl = execFileSync('redis-cli', ['-p', port, '-a', 'test-only-pass', '--no-auth-warning', 'TTL', 'k'], { encoding: 'utf8' }).trim();
    expect(Number(ttl)).toBeGreaterThan(0);
  });

  it('rejects a wrong password instead of silently counting nowhere', async () => {
    const bad = new RedisStore(redisUrl.replace('test-only-pass', 'wrong'));
    await expect(bad.incrWithin('x', 1, 10, 60)).rejects.toThrow(/redis/i);
  });
});

describe('spend reservation through the limiter', () => {
  it('concurrent runs cannot reserve more than the daily cap, and settlement releases unused reservation', async () => {
    const { LIMITS, checkLimit, recordSpend, spendToday } = await import('@/services/rate-limit');
    __setCounterStore(new FileStore(path.join(tmp, 'spend.json')));
    const cap = LIMITS.dailyBudgetUsd;
    const per = cap / 4;
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, (_, i) => checkLimit(new Request('https://x.test/', { headers: { 'x-real-ip': `10.0.0.${i}` } }), { reserveUsd: per })),
    );
    const granted = verdicts.filter((v) => v.ok);
    expect(granted.length).toBe(4);
    expect(verdicts.filter((v) => !v.ok && v.reason === 'budget').length).toBe(6);
    // Each run actually cost a tenth of its reservation: settling frees the rest.
    for (const v of granted) if (v.ok) await recordSpend(per / 10, v.reservation);
    expect((await spendToday()).usd).toBeCloseTo(cap / 10, 6);
    // A failed run settles to zero.
    const again = await checkLimit(new Request('https://x.test/', { headers: { 'x-real-ip': '10.0.1.1' } }), { reserveUsd: per });
    expect(again.ok).toBe(true);
    if (again.ok) await recordSpend(0, again.reservation);
    expect((await spendToday()).usd).toBeCloseTo(cap / 10, 6);
    __setCounterStore(null);
  });
});
