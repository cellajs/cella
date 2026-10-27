import { cn } from '~/utils/cn';

const variantClasses = {
  success: 'bg-success [--status-pulse-color:color-mix(in_oklch,var(--success)_30%,transparent)]',
  warning: 'bg-warning [--status-pulse-color:color-mix(in_oklch,var(--warning)_30%,transparent)]',
  destructive: 'bg-destructive [--status-pulse-color:color-mix(in_oklch,var(--destructive)_30%,transparent)]',
};

export type StatusDotVariant = keyof typeof variantClasses;

interface StatusDotProps {
  variant: StatusDotVariant;
  /** Names the status to assistive tech; without one the dot is decorative. */
  label?: string;
  className?: string;
}

/** An 8px dot in a status color with a ripple, still under reduced motion. */
export function StatusDot({ variant, label, className }: StatusDotProps) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('inline-block size-2 shrink-0 animate-status-pulse rounded-full motion-reduce:animate-none', variantClasses[variant], className)}
    />
  );
}
