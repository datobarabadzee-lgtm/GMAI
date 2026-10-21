'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell. The worker caches static assets and the
 * deterministic pages only — clinical answers are never served from cache, so a
 * stale reply can never be mistaken for a current one.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is an enhancement; the app works without it */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
