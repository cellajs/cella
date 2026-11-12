import { cn } from '~/utils/cn';
import { formatCount } from '~/utils/format-count';

const variantClasses = {
  primary: 'bg-primary text-primary-foreground',
  // For a count of rows the person put out of the way, such as hidden or archived ones
  muted: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

interface CountBadgeProps {
  count: number;
  variant?: keyof typeof variantClasses;
  className?: string;
}

/** A 16px counter pill, compact from a thousand up (1.2k); the caller decides when it shows and where it sits. */
export function CountBadge({ count, variant = 'primary', className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        'text-2xs flex h-4 min-w-4 items-center justify-center rounded-full px-1 leading-none font-bold',
        variantClasses[variant],
        className,
      )}
    >
      {formatCount(count)}
    </span>
  );
}
