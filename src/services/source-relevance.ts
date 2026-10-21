import type { Source } from '@/schemas/evidence';

/**
 * PUBLISHED SOURCES MUST SUPPORT THE PUBLISHED ANSWER
 *
 * Agents attach source IDs to everything they compute, including checklist
 * items the reader never sees (e.g. A03 „renal function not assessed" carries
 * Cockcroft-Gault). Listing the union of those IDs under an answer implies the
 * answer rests on them. Observed 2026-10-20: a patient answer about leech
 * therapy for pain was published with „Cockcroft DW, Gault MH… Nephron 1976"
 * as its only source.
 *
 * A source is published only when one of its curated keywords occurs in the
 * text the reader actually gets for this answer (question, bottom line and the
 * sections shown in that mode). Nothing is added in its place: an answer with
 * no supporting source in the registry is shown without a source list, and
 * the page says so.
 */

const stem = (k: string) => {
  const t = k.toLowerCase().trim();
  // Georgian keywords are matched by stem so that case endings still count.
  return /[ა-ჿ]/.test(t) && t.length > 6 ? t.slice(0, Math.max(5, t.length - 2)) : t;
};

export function sourceSupports(source: Pick<Source, 'keywords'>, text: string): boolean {
  const hay = text.toLowerCase();
  return (source.keywords ?? []).some((k) => {
    const s = stem(k);
    if (s.length < 3) return false;
    // Latin keywords as whole words (CrCl must not match inside another word).
    if (/^[a-z0-9 .+-]+$/i.test(s)) return new RegExp(`(^|[^a-z0-9])${s.replace(/[.+]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(hay);
    return hay.includes(s);
  });
}

export function relevantSources<T extends Pick<Source, 'keywords'>>(sources: T[], text: string): T[] {
  return sources.filter((s) => sourceSupports(s, text));
}
