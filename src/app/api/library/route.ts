import { NextResponse } from 'next/server';
import { SOURCES } from '@/knowledge/sources';

export const runtime = 'nodejs';

/** Public library view — restricted sources never expose full text. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').toLowerCase();
  const type = params.get('type') ?? '';
  const rights = params.get('rights') ?? '';

  const items = SOURCES.filter((s) => {
    if (type && s.source_type !== type) return false;
    if (rights && s.rights_status !== rights) return false;
    if (!q) return true;
    return [s.title, s.publisher, s.key_finding, ...s.keywords].join(' ').toLowerCase().includes(q);
  }).map((s) => {
    const publicFullText = s.fulltext_public && (s.rights_status === 'OPEN' || s.rights_status === 'PUBLIC_DOMAIN');
    return {
      ...s,
      excerpt: publicFullText ? s.excerpt : '',
      restrictedNoteKa: publicFullText ? '' : 'ამ წყაროს სრული ტექსტი საჯაროდ არ ქვეყნდება უფლებრივი სტატუსის გამო; ხელმისაწვდომია მეტამონაცემები და ციტირება.',
    };
  });

  return NextResponse.json({ items, total: items.length });
}
