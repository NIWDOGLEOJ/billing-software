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

    const idle = window.requestIdleCallback;
    const handle = idle
      ? idle(write, { timeout: 2000 })
      : window.setTimeout(write, 200);

    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback?.(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [key, value]);
}
