/**
 * NexusFlow design language — shared primitives.
 *
 * The single source of truth for the redesign's repeated visual devices,
 * reproduced from design-handoff/README.md ("Design language", "Typography",
 * "Spacing, radius, control sizes"). Colour values themselves live as CSS
 * custom properties on :root in src/styles/design-tokens.css; this file only
 * composes them into the shapes the screens reuse.
 *
 * WHY INLINE STYLE OBJECTS AND NOT TAILWIND CLASSES
 * -------------------------------------------------
 * globals.css and roughly 1,400 hardcoded colour utilities across the src/app
 * component tree set the same visual properties at equal-or-higher specificity.
 * A class-based skin loses to them nondeterministically depending on stylesheet
 * order; inline styles win outright. Layout and responsiveness stay in
 * Tailwind, where no such conflict exists.
 *
 * Screens import from here rather than redeclaring, so a change to the eyebrow
 * or panel treatment lands everywhere at once.
 */
import type { CSSProperties } from 'react';

/** Numerals, codes and eyebrows. Prose stays in Public Sans (set on body). */
export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

/**
 * Figures. Tabular numerals are the point: columns of rupees line up without
 * fixed widths, so a cashier can scan a column vertically.
 */
export const NUM: CSSProperties = {
  fontFamily: MONO,
  fontVariantNumeric: 'tabular-nums',
};

/**
 * Section eyebrow — the one repeated device that structures every panel.
 * 10px mono caps at 0.14em, sitting above a 1px rule.
 */
export const EYEBROW: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--ink3)',
};

/** Table column head — a size down from the eyebrow, tighter tracking. */
export const COL_HEAD: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--ink3)',
};

/** Card surface on the ruled page ground. The grid never appears inside one. */
export const PANEL: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
};

/** Panel header strip: eyebrow on the left, actions pushed right. */
export const PANEL_HEAD: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  borderBottom: '1px solid var(--rule2)',
};

/** Inset control surface: inputs, selects, secondary buttons. */
export const FIELD: CSSProperties = {
  background: 'var(--sub)',
  border: '1px solid var(--border2)',
  borderRadius: 7,
  color: 'var(--ink)',
  outline: 'none',
};

/** Keycap on a panel ground. */
export const KBD: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  border: '1px solid var(--border2)',
  borderBottomWidth: 2,
  borderRadius: 4,
  padding: '2px 6px',
  background: 'var(--sub)',
  color: 'var(--ink2)',
  whiteSpace: 'nowrap',
};

/**
 * Keycap rendered inside a filled button, where --border2 would disappear
 * against the fill. Borrows the button's own text colour instead.
 */
export const KBD_ON_FILL: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  padding: '2px 6px',
  border: '1px solid color-mix(in srgb, currentColor 42%, transparent)',
  borderBottomWidth: 2,
};

/** Primary action. 46px per the design's control-height scale. */
export const BTN_PRIMARY: CSSProperties = {
  height: 46,
  border: 0,
  borderRadius: 8,
  background: 'var(--ink)',
  color: 'var(--panel)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

/** Secondary action on an inset ground. */
export const BTN_SECONDARY: CSSProperties = {
  height: 46,
  border: '1px solid var(--border2)',
  borderRadius: 8,
  background: 'var(--sub)',
  color: 'var(--ink)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

/** Status chip grounds. Status colour appears only on genuine state. */
export const CHIP = {
  ok: { background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' },
  warn: { background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn)' },
  danger: { background: 'var(--danger-soft)', border: '1px solid var(--danger-line)', color: 'var(--danger)' },
  accent: { background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)' },
  neutral: { background: 'var(--rule)', border: '1px solid var(--border)', color: 'var(--ink2)' },
} satisfies Record<string, CSSProperties>;

/**
 * ₹ with Indian digit grouping and always two decimals.
 *
 * Two decimals unconditionally is deliberate: the design's totals rails align
 * on the decimal point, and a bare "₹285" in a column of "₹1,240.50" breaks
 * that alignment even with tabular numerals.
 */
export function inr(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole rupees — for KPI figures and axis labels, where paise are noise. */
export function inrWhole(n: number): string {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

/** The ruled page ground: two grid layers over two soft radial glows. */
export const PAGE_GROUND: CSSProperties = {
  backgroundColor: 'var(--bg)',
  backgroundImage: [
    'radial-gradient(1100px 640px at 80% -12%, var(--glow-a), transparent 62%)',
    'radial-gradient(880px 560px at 4% 108%, var(--glow-b), transparent 62%)',
    'repeating-linear-gradient(0deg, var(--grid2) 0 1px, transparent 1px 40px)',
    'repeating-linear-gradient(90deg, var(--grid2) 0 1px, transparent 1px 40px)',
    'repeating-linear-gradient(0deg, var(--grid1) 0 1px, transparent 1px 5px)',
    'repeating-linear-gradient(90deg, var(--grid1) 0 1px, transparent 1px 5px)',
  ].join(', '),
  backgroundAttachment: 'fixed',
};
