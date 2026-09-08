/**
 * Unified mobile and touch tablet device detection.
 *
 * Checks:
 * 1. Screen / viewport width < 768px (standard mobile breakpoint)
 * 2. Mobile User Agent regex (iPhone, Android, webOS, iPod, BlackBerry, Opera Mini, etc.)
 * 3. iPadOS 13+ detection (Safari on iPad reports as Macintosh in navigator.userAgent,
 *    but has navigator.maxTouchPoints > 1)
 * 4. Touchscreen pointer coarse media queries for small-to-medium tablets
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Viewport width check (portrait phones, small screens)
  if (typeof window.innerWidth === 'number' && window.innerWidth < 768) return true;

  const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';

  // Standard mobile UA pattern
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  // Modern iPadOS (iOS 13+) Safari reports as 'Macintosh' but has multiple touch points
  if (
    /Macintosh/i.test(ua) &&
    typeof navigator !== 'undefined' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }

  // Touch screen devices without fine pointer under 1024px
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    typeof window.innerWidth === 'number' &&
    window.innerWidth < 1024
  ) {
    return true;
  }

  return false;
}
