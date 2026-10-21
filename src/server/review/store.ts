import 'server-only';
import type Database from 'better-sqlite3';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { appTier } from '@/lib/tier';

/**
 * HUMAN REVIEW WORKFLOW — internal tier only (audit F15, 2026-10-21).
 *
 * An answer or document the release gate marked HUMAN_REVIEW can be submitted
 * for review. Reviewers are named people with their own tokens (REVIEWERS env:
 * `name|role|sha256(token)` entries separated by `;`, role reviewer or lead);
 * the actor of every event is taken from the token, never from the request
 * body.
 *
 *   submit  (any reviewer)            → pending
 *   assign  (lead)                    → assigned to a named reviewer
 *   approve / reject (the assignee or a lead, not the submitter of that
 *            version: four eyes; reject needs a reason) → approved | rejected
 *   revise  (submitter or lead)       → new version, pending again
 *   comment (any reviewer)            → no status change
 *
 * Events are append-only (no UPDATE or DELETE on review_events); each records
 * the version and the SHA-256 of the content it refers to. The store is a
 * SQLite file on the clinic's own infrastructure (REVIEW_DB_PATH). The public
 * tier has no reviewers and no store: there, „needs human review" is a label.
 */

export type Role = 'reviewer' | 'lead';
export type Reviewer = { name: string; role: Role };
export type ReviewStatus = 'pending' | 'assigned' | 'approved' | 'rejected';
export type Action = 'submit' | 'assign' | 'approve' | 'reject' | 'revise' | 'comment';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function reviewers(): (Reviewer & { hash: string })[] {
  return (process.env.REVIEWERS ?? '')
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [name, role, hash] = e.split('|').map((x) => x.trim());
      return { name, role: (role === 'lead' ? 'lead' : 'reviewer') as Role, hash: (hash ?? '').toLowerCase() };
    })
    .filter((r) => r.name && /^[0-9a-f]{64}$/.test(r.hash));
}

export type AuthResult = { ok: true; reviewer: Reviewer } | { ok: false; status: 401 | 403; error: string; messageKa: string };

export function authenticateReviewer(req: Request): AuthResult {
  if (appTier() !== 'internal') return { ok: false, status: 403, error: 'INTERNAL_ONLY', messageKa: 'განხილვის სამუშაო პროცესი მხოლოდ შიდა ვერსიაშია.' };
  const list = reviewers();
  if (!list.length) return { ok: false, status: 403, error: 'REVIEWERS_NOT_CONFIGURED', messageKa: 'რეცენზენტები (REVIEWERS) სერვერზე კონფიგურირებული არ არის.' };
  const origin = req.headers.get('origin');
  if (origin) {
    const expected = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : new URL(req.url).host;
    let got = '';
    try {
      got = new URL(origin).host;
    } catch {
      got = '';
    }
    if (got !== expected) return { ok: false, status: 403, error: 'ORIGIN_REJECTED', messageKa: 'მოთხოვნის წყარო უარყოფილია (cross-origin).' };
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return { ok: false, status: 401, error: 'REVIEWER_AUTH_REQUIRED', messageKa: 'რეცენზენტის ავტორიზაცია საჭიროა.' };
  const h = Buffer.from(sha(m[1].trim()), 'hex');
  const r = list.find((x) => timingSafeEqual(Buffer.from(x.hash, 'hex'), h));
  if (!r) return { ok: false, status: 401, error: 'REVIEWER_AUTH_REQUIRED', messageKa: 'რეცენზენტის გასაღები არასწორია.' };
  return { ok: true, reviewer: { name: r.name, role: r.role } };
}

/* ── storage ─────────────────────────────────────────────────────────────── */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  assignee TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES review_items(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  note TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS review_events_no_update BEFORE UPDATE ON review_events BEGIN SELECT RAISE(ABORT, 'review_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS review_events_no_delete BEFORE DELETE ON review_events BEGIN SELECT RAISE(ABORT, 'review_events is append-only'); END;
`;

let db: Database.Database | null = null;
let dbPath = '';

function open(): Database.Database {
  const p = process.env.REVIEW_DB_PATH ?? path.join(process.cwd(), 'data', 'review', 'reviews.sqlite');
  if (db && dbPath === p) return db;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const Driver = createRequire(import.meta.url)('better-sqlite3') as typeof Database;
  db = new Driver(p);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  dbPath = p;
  return db;
}

export type ReviewItem = {
  id: string;
  kind: 'answer' | 'document';
  title: string;
  run_id: string | null;
  status: ReviewStatus;
  version: number;
  content: unknown;
  content_sha256: string;
  submitted_by: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
};
export type ReviewEvent = { seq: number; at: string; actor: string; actor_role: Role; action: Action; version: number; content_sha256: string; note: string | null; from_status: ReviewStatus | null; to_status: ReviewStatus };

type Row = Omit<ReviewItem, 'content'> & { content_json: string };
const toItem = (r: Row): ReviewItem => ({ ...r, content: JSON.parse(r.content_json) });

export class ReviewError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, public code: string, public messageKa: string) {
    super(code);
  }
}

const canonical = (content: unknown) => JSON.stringify(content);

function event(d: Database.Database, item: { id: string; version: number; content_sha256: string }, actor: Reviewer, action: Action, from: ReviewStatus | null, to: ReviewStatus, note?: string) {
  d.prepare('INSERT INTO review_events (item_id, at, actor, actor_role, action, version, content_sha256, note, from_status, to_status) VALUES (?,?,?,?,?,?,?,?,?,?)').run(item.id, new Date().toISOString(), actor.name, actor.role, action, item.version, item.content_sha256, note ?? null, from, to);
}

export function submitReview(actor: Reviewer, input: { kind: 'answer' | 'document'; title: string; runId?: string | null; content: unknown }): ReviewItem {
  const d = open();
  const body = canonical(input.content);
  if (body.length > 64_000) throw new ReviewError(400, 'CONTENT_TOO_LARGE', 'განსახილველი შინაარსი ძალიან დიდია.');
  const now = new Date().toISOString();
  const item = { id: randomUUID(), kind: input.kind, title: input.title.slice(0, 200), run_id: input.runId ?? null, status: 'pending' as const, version: 1, content_json: body, content_sha256: sha(body), submitted_by: actor.name, assignee: null, created_at: now, updated_at: now };
  d.transaction(() => {
    d.prepare('INSERT INTO review_items (id, kind, title, run_id, status, version, content_json, content_sha256, submitted_by, assignee, created_at, updated_at) VALUES (@id,@kind,@title,@run_id,@status,@version,@content_json,@content_sha256,@submitted_by,@assignee,@created_at,@updated_at)').run(item);
    event(d, item, actor, 'submit', null, 'pending');
  })();
  return toItem(item);
}

export function getReview(id: string): { item: ReviewItem; events: ReviewEvent[] } | null {
  const d = open();
  const r = d.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as Row | undefined;
  if (!r) return null;
  return { item: toItem(r), events: d.prepare('SELECT seq, at, actor, actor_role, action, version, content_sha256, note, from_status, to_status FROM review_events WHERE item_id = ? ORDER BY seq').all(id) as ReviewEvent[] };
}

export function listReviews(filter: { status?: ReviewStatus; assignee?: string } = {}): Omit<ReviewItem, 'content'>[] {
  const d = open();
  const where: string[] = [];
  const args: string[] = [];
  if (filter.status) {
    where.push('status = ?');
    args.push(filter.status);
  }
  if (filter.assignee) {
    where.push('assignee = ?');
    args.push(filter.assignee);
  }
  return d.prepare(`SELECT id, kind, title, run_id, status, version, content_sha256, submitted_by, assignee, created_at, updated_at FROM review_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 200`).all(...args) as Omit<ReviewItem, 'content'>[];
}

/** Submitter of the item's current version (the last submit or revise event). */
function versionAuthor(d: Database.Database, id: string): string {
  const r = d.prepare("SELECT actor FROM review_events WHERE item_id = ? AND action IN ('submit','revise') ORDER BY seq DESC LIMIT 1").get(id) as { actor: string } | undefined;
  return r?.actor ?? '';
}

export function act(actor: Reviewer, id: string, action: Exclude<Action, 'submit'>, opts: { note?: string; assignee?: string; content?: unknown; expectedVersion?: number } = {}): { item: ReviewItem; events: ReviewEvent[] } {
  const d = open();
  d.transaction(() => {
    const r = d.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new ReviewError(404, 'NOT_FOUND', 'ჩანაწერი ვერ მოიძებნა.');
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== r.version) throw new ReviewError(409, 'VERSION_CONFLICT', `ჩანაწერი შეიცვალა (მიმდინარე ვერსია ${r.version}). გადატვირთეთ და გადახედეთ ახალ ვერსიას.`);
    const now = new Date().toISOString();
    const closed = r.status === 'approved' || r.status === 'rejected';
    switch (action) {
      case 'comment':
        if (!opts.note?.trim()) throw new ReviewError(400, 'NOTE_REQUIRED', 'კომენტარი ცარიელია.');
        event(d, r, actor, 'comment', r.status, r.status, opts.note.trim());
        return;
      case 'assign': {
        if (actor.role !== 'lead') throw new ReviewError(403, 'LEAD_ONLY', 'მინიჭება მხოლოდ წამყვან რეცენზენტს შეუძლია.');
        if (closed) throw new ReviewError(409, 'CLOSED', 'დასრულებული განხილვის მინიჭება შეუძლებელია.');
        const who = reviewers().find((x) => x.name === opts.assignee);
        if (!who) throw new ReviewError(400, 'UNKNOWN_REVIEWER', 'ასეთი რეცენზენტი არ არის კონფიგურირებული.');
        d.prepare("UPDATE review_items SET status = 'assigned', assignee = ?, updated_at = ? WHERE id = ?").run(who.name, now, id);
        event(d, r, actor, 'assign', r.status, 'assigned', `→ ${who.name}${opts.note ? ` · ${opts.note}` : ''}`);
        return;
      }
      case 'approve':
      case 'reject': {
        if (closed) throw new ReviewError(409, 'CLOSED', 'განხილვა უკვე დასრულებულია.');
        if (actor.role !== 'lead' && r.assignee !== actor.name) throw new ReviewError(403, 'NOT_ASSIGNEE', 'გადაწყვეტილებას იღებს მინიჭებული რეცენზენტი ან წამყვანი.');
        if (versionAuthor(d, id) === actor.name) throw new ReviewError(403, 'FOUR_EYES', 'საკუთარი ვერსიის დამტკიცება/უარყოფა დაუშვებელია (ოთხი თვალის პრინციპი).');
        if (action === 'reject' && !opts.note?.trim()) throw new ReviewError(400, 'REASON_REQUIRED', 'უარყოფისას მიზეზი სავალდებულოა.');
        const to: ReviewStatus = action === 'approve' ? 'approved' : 'rejected';
        d.prepare('UPDATE review_items SET status = ?, updated_at = ? WHERE id = ?').run(to, now, id);
        event(d, r, actor, action, r.status, to, opts.note?.trim());
        return;
      }
      case 'revise': {
        if (actor.role !== 'lead' && r.submitted_by !== actor.name) throw new ReviewError(403, 'NOT_SUBMITTER', 'ახალ ვერსიას ტვირთავს წარმდგენი ან წამყვანი.');
        if (r.status === 'approved') throw new ReviewError(409, 'CLOSED', 'დამტკიცებული ვერსია არ იცვლება; წარადგინეთ ახალი ჩანაწერი.');
        if (opts.content === undefined) throw new ReviewError(400, 'CONTENT_REQUIRED', 'ახალი ვერსიის შინაარსი არ არის.');
        const body = canonical(opts.content);
        const next = { id, version: r.version + 1, content_sha256: sha(body) };
        d.prepare("UPDATE review_items SET status = 'pending', assignee = NULL, version = ?, content_json = ?, content_sha256 = ?, updated_at = ? WHERE id = ?").run(next.version, body, next.content_sha256, now, id);
        event(d, next, actor, 'revise', r.status, 'pending', opts.note?.trim());
        return;
      }
    }
  })();
  return getReview(id)!;
}

/** Test seam. */
export function __closeReviewDb() {
  db?.close();
  db = null;
  dbPath = '';
}
