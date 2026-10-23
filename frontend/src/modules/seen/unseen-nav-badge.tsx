import { CountBadge } from '~/modules/common/count-badge';
import type { NavBadgeProps } from '~/modules/navigation/types';
import { useTotalUnseenCount } from '~/modules/seen/use-unseen-count';
import { cn } from '~/utils/cn';

export function UnseenNavBadge({ isActive, className }: NavBadgeProps) {
  const totalUnseenCount = useTotalUnseenCount();

  if (isActive || totalUnseenCount === 0) return null;

  return <CountBadge count={totalUnseenCount} className={cn('absolute', className)} />;
}
