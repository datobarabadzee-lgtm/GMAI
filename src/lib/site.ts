import type { Metadata } from 'next';

/**
 * Public address used to make share-card links absolute (Facebook and others
 * ignore relative og:image paths). Set NEXT_PUBLIC_SITE_URL when the site moves
 * to its own domain; the Cloud Run address keeps working either way.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gmai-29267867738.europe-west1.run.app';

/** Open Graph + Twitter tags for one page; images are 1200×630 PNGs in /public/og. */
export function shareMeta(title: string, description: string, image = '/og/og.png'): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      type: 'website',
      locale: 'ka_GE',
      siteName: 'ლიდერმედი · GMAI',
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
