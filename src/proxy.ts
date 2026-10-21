import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { appTier, isPublicApi, isPublicPage } from '@/lib/tier';

/**
 * Tier boundary. In the public deployment every internal route — pages, APIs and
 * admin tooling alike — is answered as if it did not exist, before any handler,
 * database connection or knowledge lookup runs.
 */
export function proxy(req: NextRequest) {
  // The internal tier must be chosen explicitly; anything else is public.
  if (appTier() === 'internal') return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) return NextResponse.next();
    return NextResponse.json(
      { error: 'NOT_AVAILABLE_PUBLIC', messageKa: 'ეს მოდული საჯარო ვერსიაში ხელმისაწვდომი არ არის.' },
      { status: 404 },
    );
  }

  if (isPublicPage(pathname)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/unavailable', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)'],
};
