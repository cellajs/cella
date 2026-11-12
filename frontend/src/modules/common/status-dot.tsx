import { cn } from '~/utils/cn';

const variantClasses = {
  primary: 'bg-primary [--status-pulse-color:color-mix(in_oklch,var(--primary)_30%,transparent)]',
  success: 'bg-success [--status-pulse-color:color-mix(in_oklch,var(--success)_30%,transparent)]',
  info: 'bg-info [--status-pulse-color:color-mix(in_oklch,var(--info)_30%,transparent)]',
  warning: 'bg-warning [--status-pulse-color:color-mix(in_oklch,var(--warning)_30%,transparent)]',
  destructive: 'bg-destructive [--status-pulse-color:color-mix(in_oklch,var(--destructive)_30%,transparent)]',
  muted: 'bg-muted-foreground [--status-pulse-color:color-mix(in_oklch,var(--muted-foreground)_30%,transparent)]',
};

export type StatusDotVariant = keyof typeof variantClasses;

interface StatusDotProps {
  variant: StatusDotVariant;
  /** Without it the dot is decorative. */
  label?: string;
  pulse?: boolean;
  className?: string;
}

/** An 8px dot in a status color, with a ripple unless `pulse` is off; still under reduced motion. */
export function StatusDot({ variant, label, pulse = true, className }: StatusDotProps) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        pulse && 'animate-status-pulse motion-reduce:animate-none',
        variantClasses[variant],
        className,
      )}
    />
  );
}
