import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { cn } from '~/utils/cn';

/** Total unseen counter over a nav button; hidden while the button is active or the count is zero. */
export function UnseenNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  const totalUnseenCount = useTotalUnseenCount();

  if (isActive || totalUnseenCount === 0) return null;

  return (
    <span
      className={cn(
        'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-bold text-[0.6rem] text-primary leading-none',
        className,
      )}
    >
      {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
    </span>
  );
}
