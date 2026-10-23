import { useQuery } from '@tanstack/react-query';
import { CountBadge } from '~/modules/common/count-badge';
import { notificationsQueryOptions } from '~/modules/notification/query';
import { cn } from '~/utils/cn';

/** Red unread pill; renders nothing at zero. Positioned by the caller (`absolute` over the bell, inline in the sheet header). */
export function UnreadCountBadge({ className }: { className?: string }) {
  const { data } = useQuery(notificationsQueryOptions());
  const unreadCount = data?.unreadCount ?? 0;

  if (unreadCount === 0) return null;

  return <CountBadge count={unreadCount} variant="destructive" className={className} />;
}

/** Unread counter over the bell, mirroring `UnseenNavBadge`; hidden while the sheet is open, which shows the count in its header. */
export function UnreadNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  if (isActive) return null;
  return <UnreadCountBadge className={cn('absolute', className)} />;
}
