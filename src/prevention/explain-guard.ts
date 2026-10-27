/**
 * Guard for the AI explanation of a plan item.
 *
 * The explanation may only restate the item: it cannot change its status or
 * interval, add a test, or name a dose. A sentence is dropped when it
 *  - carries a number that is not in the item's own facts, or
 *  - names a dose (mg, mcg, tablets, units of a medicine), or
 *  - is written in a script other than Georgian or Latin.
 * What survives is shown; if nothing survives, the item's own text is shown.
 */

const NUM = /\d+(?:[.,]\d+)?/g;
const DOSE = /(\d\s*(მგ|მკგ|მლ|ერთეულ|ტაბლეტ|კაფსულ|mg|mcg|µg|ml|IU)\b)|დოზ/i;
const FOREIGN = /[Ѐ-ӿ԰-֏Ͱ-Ͽ֐-׿؀-ۿ一-鿿]/;

export function allowedNumbers(...texts: (string | number | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    if (t === undefined) continue;
    for (const m of String(t).match(NUM) ?? []) out.add(normalize(m));
  }
  return out;
}

const normalize = (n: string) => String(Number(n.replace(',', '.')));

export function guardExplanation(text: string, allowed: Set<string>): { textKa: string; dropped: number } {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let dropped = 0;
  for (const s of sentences) {
    const nums = (s.match(NUM) ?? []).map(normalize);
    if (FOREIGN.test(s) || DOSE.test(s) || nums.some((n) => !allowed.has(n))) {
      dropped++;
      continue;
    }
    kept.push(s);
  }
  return { textKa: kept.join(' '), dropped };
}
