import { CountBadge } from '~/modules/common/count-badge';
import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { cn } from '~/utils/cn';

export function UnseenNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  const totalUnseenCount = useTotalUnseenCount();

  if (isActive || totalUnseenCount === 0) return null;

  return <CountBadge count={totalUnseenCount} className={cn('absolute', className)} />;
}
