import React, { useRef } from 'react';

interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  glareEffect?: boolean;
}

/**
 * LiquidGlassCard Component
 * Implements Apple's Liquid Glass UI specification:
 * 1. Background blur + saturation boost
 * 2. Translucent surface tint
 * 3. Hairline top-edge specular light highlight & bottom-edge shade
 * 4. Soft floating depth shadow
 * 5. Pointer-reactive specular glare layer (following cursor position)
 * 6. Elastic press animation feedback (`active:scale-[0.97]`)
 * 7. Accessibility fallbacks for `prefers-reduced-transparency` and `prefers-reduced-motion`
 */
export function LiquidGlassCard({
  children,
  className = '',
  interactive = true,
  glareEffect = true,
  onMouseMove,
  ...props
}: LiquidGlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (glareEffect && cardRef.current) {
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      const rect = cardRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      cardRef.current.style.setProperty('--glare-x', `${x}%`);
      cardRef.current.style.setProperty('--glare-y', `${y}%`);
    }
    if (onMouseMove) {
      onMouseMove(e);
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`liquid-glass-card group relative overflow-hidden rounded-3xl border border-[var(--border-glass)]
        bg-[var(--bg-glass)] backdrop-blur-3xl backdrop-saturate-200
        shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.1),var(--shadow-glass)]
        transition-all duration-200 ease-out
        ${interactive ? 'hover:-translate-y-1.5 hover:border-[var(--primary-accent)]/50 hover:shadow-[var(--accent-glow)] active:scale-[0.97]' : ''}
        ${className}`}
      {...props}
    >
      {/* Pointer-reactive specular glare & liquid reflection layer */}
      {glareEffect && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-0"
            style={{
              background:
                'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 0%), rgba(255,255,255,0.35), transparent 60%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-0"
            style={{
              background:
                'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 0%), rgba(var(--primary-accent-rgb, 16, 185, 129), 0.25), transparent 75%)',
            }}
          />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default LiquidGlassCard;
