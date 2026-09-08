import { useEffect } from 'react';

/**
 * Mirrors a value into localStorage without blocking the interaction that
 * changed it.
 *
 * Writing a large array straight from an effect means a synchronous
 * `JSON.stringify` of the whole catalog (or the whole bill history) on the main
 * thread at exactly the moment the cashier wants to start the next sale.
 * Deferring to idle time keeps that off the critical path, and because the
 * cleanup cancels a pending write, a burst of rapid changes collapses into one.
 *
 * Only use this for caches that can be rebuilt from the server — the write is
 * best-effort and may be skipped if the component unmounts first.
 */
export function useDeferredLocalStorage(key: string, value: unknown) {
  useEffect(() => {
    let cancelled = false;

    const write = () => {
      if (cancelled) return;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Quota exceeded or storage blocked. This is a convenience cache, not
        // the source of truth — the server is re-read on load either way.
      }
    };

    let handle: number | null = null;
    let isIdle = false;

    try {
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        handle = window.requestIdleCallback(write, { timeout: 2000 });
        isIdle = true;
      } else if (typeof window !== 'undefined') {
        handle = window.setTimeout(write, 200) as unknown as number;
      }
    } catch {
      try {
        if (typeof window !== 'undefined') {
          handle = window.setTimeout(write, 200) as unknown as number;
          isIdle = false;
        }
      } catch {
        // Environment does not support timers
      }
    }

    return () => {
      cancelled = true;
      if (handle !== null && typeof window !== 'undefined') {
        try {
          if (isIdle && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(handle);
          } else if (typeof window.clearTimeout === 'function') {
            window.clearTimeout(handle);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [key, value]);
}
