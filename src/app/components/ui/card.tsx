import * as React from "react";

import { cn } from "./utils";

function Card({ className, onPointerMove, onMouseMove, children, style, ...props }: React.ComponentProps<"div">) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cardRef.current) {
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      const rect = cardRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        cardRef.current.style.setProperty('--glare-x', `${x.toFixed(2)}%`);
        cardRef.current.style.setProperty('--glare-y', `${y.toFixed(2)}%`);
      }
    }
    if (onPointerMove) onPointerMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardRef.current) {
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      const rect = cardRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        cardRef.current.style.setProperty('--glare-x', `${x.toFixed(2)}%`);
        cardRef.current.style.setProperty('--glare-y', `${y.toFixed(2)}%`);
      }
    }
    if (onMouseMove) onMouseMove(e);
  };

  return (
    <div
      ref={cardRef}
      data-slot="card"
      onPointerMove={handlePointerMove}
      onMouseMove={handleMouseMove}
      className={cn(
        "group/card relative overflow-hidden bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl backdrop-saturate-200 border border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.08),var(--shadow-glass)] flex flex-col gap-6 rounded-xl",
        className,
      )}
      style={style}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 z-0"
        style={{
          background:
            'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 0%), rgba(255,255,255,0.25), transparent 60%)',
        }}
      />
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <h4
      data-slot="card-title"
      className={cn("leading-none", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 [&:last-child]:pb-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 pb-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
