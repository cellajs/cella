import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { cn } from '~/utils/cn';

export function UnseenNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  const totalUnseenCount = useTotalUnseenCount();

  if (isActive || totalUnseenCount === 0) return null;

  return (
    <span
      className={cn(
        'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-bold text-[0.6rem] text-primary-foreground leading-none',
        className,
      )}
    >
      {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
    </span>
  );
}
