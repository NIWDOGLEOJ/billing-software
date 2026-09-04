import React from 'react';

/**
 * Pointer-tracked specular glare — now disabled.
 *
 * This used to write --glare-x / --glare-y on hover, and SpecularGlareOverlay
 * painted two cursor-following radial gradients over the whole element: white at
 * 0.35 alpha plus the accent colour at 0.25. The result was that moving the
 * mouse recoloured entire panels, which was distracting rather than tactile —
 * and it fought the glass material, whose highlight is supposed to come from a
 * fixed light source (135°, per the Figma Glass settings) rather than from
 * wherever the cursor happens to be.
 *
 * Both are kept as no-ops so the ~50 call sites across the app don't need to
 * change. Delete the imports at leisure.
 */

/** No-op. Kept so existing onPointerMove={updatePointerGlare} handlers still compile. */
export function updatePointerGlare(
  _e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
): void {
  /* intentionally empty — see the note above */
}

/** Renders nothing. The glass material supplies its own fixed-light sheen. */
export function SpecularGlareOverlay(_props: { className?: string }) {
  return null;
}
