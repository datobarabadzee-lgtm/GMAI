import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Georgian, Poppins } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { CaseProvider } from '@/features/case/case-store';
import { engineStatus } from '@/services/ai-provider';
import { appTier } from '@/lib/tier';
import { ServiceWorker } from '@/components/layout/service-worker';
import { InstallHint } from '@/components/layout/install-hint';
import { THEME_BOOT_SCRIPT } from '@/components/layout/theme';
import { RoleProvider } from '@/features/settings/role-store';

const ge = Noto_Sans_Georgian({ subsets: ['georgian'], weight: ['400', '500', '600', '700'], variable: '--font-ge', display: 'swap' });
const latin = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-latin', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'ლიდერმედი — Medical AI', template: '%s · ლიდერმედი' },
  description: 'ლიდერმედის კლინიკური ინტელექტის სისტემა — ექიმებისთვის, სტუდენტებისთვის, კლინიკებისთვის და პაციენტებისთვის.',
  applicationName: 'ლიდერმედი Medical AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ლიდერმედი', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#102638',
  width: 'device-width',
  initialScale: 1,
  // iOS: let the layout paint under the notch and home indicator; safe-area insets
  // are applied per-element in globals.css rather than left to the browser.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const engine = engineStatus();
  const tier = appTier();
  return (
    <html lang="ka" className={`${ge.variable} ${latin.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ServiceWorker />
        <CaseProvider>
          <RoleProvider>
          <AppShell engine={engine} tier={tier}>{children}</AppShell>
        </RoleProvider>
        </CaseProvider>
        <InstallHint />
      </body>
    </html>
  );
}
