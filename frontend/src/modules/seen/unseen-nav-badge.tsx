import { CountBadge } from '~/modules/common/count-badge';
import { useTotalUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import type { NavBadgeProps } from '~/modules/navigation/types';
import { cn } from '~/utils/cn';

export function UnseenNavBadge({ isActive, className }: NavBadgeProps) {
  const totalUnseenCount = useTotalUnseenCount();

  if (isActive || totalUnseenCount === 0) return null;

  return <CountBadge count={totalUnseenCount} className={cn('absolute', className)} />;
}
