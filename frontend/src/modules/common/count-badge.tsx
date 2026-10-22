import { cn } from '~/utils/cn';

interface CountBadgeProps {
  count: number;
  variant?: 'primary' | 'destructive';
  className?: string;
}

/** A 16px counter pill that caps at 99+; the caller decides when it shows and where it sits. */
export function CountBadge({ count, variant = 'primary', className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        'flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold text-2xs leading-none',
        variant === 'destructive' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
