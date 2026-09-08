import type { ReactNode } from 'react';

/**
 * Shared vocabulary for the six sector screens.
 *
 * These were modal bodies inside layout.tsx, each inventing its own header,
 * table and badge styling. As routes they are peers of Register and Reports,
 * so they get the same three devices those screens use — page head, eyebrow
 * panel, ruled table — and nothing else.
 */

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Rupees, Indian grouping. The old panels printed `$` in GST and CRM and `₹`
 *  in tables; the store is in Karnataka, so it is ₹ everywhere. */
export function inr(n: number, paise = false): string {
  return (
    '₹' +
    Number(n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: paise ? 2 : 0,
      maximumFractionDigits: paise ? 2 : 0,
    })
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[10px] font-bold uppercase text-[var(--text-muted)]"
      style={{ fontFamily: MONO, letterSpacing: '0.14em' }}
    >
      {children}
    </div>
  );
}

/** Page head: eyebrow, title, and a right-aligned action slot. One per screen,
 *  so a sector screen announces itself the way Register does. */
export function SectorPage({
  eyebrow,
  title,
  meta,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-[14px] flex flex-col gap-[14px] min-h-0">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-[19px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)] mt-1">
            {title}
          </h1>
          {meta && (
            <div
              className="text-[11.5px] text-[var(--text-muted)] mt-1"
              style={{ fontFamily: MONO }}
            >
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel({
  label,
  right,
  pad = true,
  className = '',
  children,
}: {
  label?: string;
  right?: ReactNode;
  pad?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-[10px] border border-[var(--border)] bg-[var(--surface)] min-w-0 ${className}`}
    >
      {label && (
        <header className="flex items-center justify-between gap-3 px-4 h-[42px] border-b border-[var(--rule2)]">
          <Eyebrow>{label}</Eyebrow>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

const TONES: Record<Tone, { bg: string; fg: string; line: string }> = {
  neutral: { bg: 'var(--rule)', fg: 'var(--text-secondary)', line: 'var(--border)' },
  ok: { bg: 'var(--success-soft)', fg: 'var(--success)', line: 'var(--success)' },
  warn: { bg: 'var(--warning-soft)', fg: 'var(--warning)', line: 'var(--warning)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)', line: 'var(--danger)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--primary)', line: 'var(--accent-line)' },
};

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span
      className="inline-flex items-center h-[20px] px-2 rounded-full border text-[10px] font-bold uppercase whitespace-nowrap"
      style={{
        fontFamily: MONO,
        letterSpacing: '0.1em',
        background: t.bg,
        color: t.fg,
        borderColor: t.line,
      }}
    >
      {children}
    </span>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-[44px] px-3 rounded-[7px] border border-[var(--border2)] bg-[var(--sub)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] w-full ${className}`}
    />
  );
}

/** Column head for the ruled tables. 9.5px mono caps, per the type scale. */
export function Th({
  children,
  align = 'left',
  w,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  w?: string;
}) {
  return (
    <th
      className="h-[34px] px-3 border-b border-[var(--border)] text-[9.5px] font-bold uppercase text-[var(--text-muted)] whitespace-nowrap"
      style={{
        fontFamily: MONO,
        letterSpacing: '0.1em',
        textAlign: align,
        width: w,
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  mono = false,
  className = '',
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 border-b border-[var(--rule)] text-[13px] text-[var(--text-primary)] ${className}`}
      style={{
        textAlign: align,
        fontFamily: mono ? MONO : undefined,
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      }}
    >
      {children}
    </td>
  );
}

/** Label on the left in secondary, value right-aligned in mono. The one row
 *  type used by every totals block and every detail rail in the product. */
export function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tone?: 'ok' | 'warn' | 'danger' | 'accent';
}) {
  const color =
    tone === 'ok'
      ? 'var(--success)'
      : tone === 'warn'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : tone === 'accent'
            ? 'var(--primary)'
            : 'var(--text-primary)';
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12.5px] text-[var(--text-secondary)]">{label}</span>
      <span
        className={strong ? 'text-[14px] font-bold' : 'text-[13px] font-semibold'}
        style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color }}
      >
        {value}
      </span>
    </div>
  );
}

export function Button({
  onClick,
  children,
  variant = 'secondary',
  disabled = false,
  full = false,
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  full?: boolean;
}) {
  const base =
    'h-[38px] px-3.5 rounded-[8px] border text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer';
  const styles =
    variant === 'primary'
      ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]'
      : variant === 'danger'
        ? 'bg-[var(--danger-soft)] border-[var(--danger)] text-[var(--danger)]'
        : 'bg-[var(--sub)] border-[var(--border2)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]';
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
      className={`${base} ${styles} ${full ? 'w-full' : ''}`}
      style={disabled ? { opacity: 0.4 } : undefined}
    >
      {children}
    </button>
  );
}

/** Empty state for the detail rails. Words, not a large faded icon. */
export function EmptyRail({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-6">
      <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">{title}</div>
      <p className="text-[12px] leading-relaxed text-[var(--text-muted)] mt-1.5 max-w-[220px]">
        {body}
      </p>
    </div>
  );
}
