#!/usr/bin/env node
/** npm run med:curation-diff -- OLD.json NEW.json — added/changed/removed decisions and the entry hashes (F10). */
import crypto from 'node:crypto';
import fs from 'node:fs';
const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: curation-diff OLD.json NEW.json');
  process.exit(2);
}
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8')).entries ?? [];
const hash = (e) => crypto.createHash('sha256').update(JSON.stringify([...e].sort((x, y) => x.mis_id.localeCompare(y.mis_id)))).digest('hex');
const A = load(a), B = load(b);
const ma = new Map(A.map((e) => [e.mis_id, e])), mb = new Map(B.map((e) => [e.mis_id, e]));
const added = [...mb.keys()].filter((k) => !ma.has(k));
const removed = [...ma.keys()].filter((k) => !mb.has(k));
const changed = [...mb.keys()].filter((k) => ma.has(k) && JSON.stringify(ma.get(k)) !== JSON.stringify(mb.get(k)));
console.log(JSON.stringify({ old_sha256: hash(A), new_sha256: hash(B), added, changed, removed }, null, 2));
