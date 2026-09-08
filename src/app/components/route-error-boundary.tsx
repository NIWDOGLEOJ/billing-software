import { useRouteError, isRouteErrorResponse } from 'react-router';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Catches anything a route throws during render or lazy-loading.
 *
 * Without this, a single bad render (or a stale chunk after a redeploy) drops
 * the cashier onto React Router's raw default error page mid-sale. This gives
 * them something they can act on instead.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('[RouteErrorBoundary caught error]', error);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  const stack = error instanceof Error ? error.stack : undefined;

  // A failed dynamic import almost always means the app was rebuilt while this
  // tab was open, so the chunk it's asking for no longer exists. A reload fixes
  // it, and saying so beats showing the cashier a module-resolution error.
  const isStaleChunk =
    /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);

  return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-[var(--bg-glass)] text-[var(--text-primary)]">
      <div className="glass-panel border border-[var(--border-glass)] rounded-2xl p-8 max-w-lg w-full shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              {isStaleChunk ? 'This page needs a refresh' : 'Something went wrong'}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {isStaleChunk
                ? 'The app was updated while this tab was open.'
                : 'This screen failed to load. Your saved bills are safe.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold text-sm transition-colors active:scale-[0.98]"
          >
            <RefreshCw size={15} />
            Reload
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] font-semibold text-sm transition-colors active:scale-[0.98]"
          >
            <Home size={15} />
            Back to billing
          </button>
        </div>

        {/* Collapsed by default — useful when reporting the problem, but not
            something a cashier should have to look at. */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors select-none">
            Technical details
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border-glass)] text-[11px] leading-relaxed text-[var(--text-muted)] overflow-auto max-h-56 whitespace-pre-wrap break-words">
            {message}
            {stack ? `\n\n${stack}` : ''}
          </pre>
        </details>
      </div>
    </div>
  );
}
