import { ReactNode } from 'react';

/**
 * The standard frame for a routed page.
 *
 * Before this existed each screen rolled its own: root padding was `p-6`, `p-8`
 * or nothing; page titles ranged from `text-xl` to `text-4xl`; and analytics used
 * `h-screen` inside the shell's `overflow-hidden` main while its siblings used
 * `h-full`. That drift is most of why moving between screens felt like moving
 * between different apps.
 *
 * Pages own their scroll region: PageShell is a fixed-height flex column, so put
 * long content in a child with `flex-1 overflow-y-auto`.
 */
export function PageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // Transparent on purpose: the page must let the app backdrop show
      // through, otherwise the glass panels inside sit on the same colour they
      // are and the whole screen reads as one flat slab.
      className={`app-content h-full flex flex-col overflow-hidden text-[var(--text-primary)] p-4 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Title block for a page. `actions` sits opposite the title and collapses below
 * it on narrow screens rather than squashing the heading.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 sm:mb-6 flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      {/* pl-10 below md keeps clear of the layout's floating drawer trigger. */}
      <div className="min-w-0 pl-10 md:pl-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
