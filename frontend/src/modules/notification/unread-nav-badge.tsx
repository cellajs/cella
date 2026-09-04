import { useQuery } from '@tanstack/react-query';
import { cn } from '~/utils/cn';
import { notificationsQueryOptions } from './query';

/** Red unread pill; renders nothing at zero. Positioned by the caller (`absolute` over the bell, inline in the sheet header). */
export function UnreadCountBadge({ className }: { className?: string }) {
  const { data } = useQuery(notificationsQueryOptions());
  const unreadCount = data?.unreadCount ?? 0;

  if (unreadCount === 0) return null;

  return (
    <span
      className={cn(
        'flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-bold text-[0.6rem] text-destructive-foreground leading-none',
        className,
      )}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}

/** Unread counter over the bell, mirroring `UnseenNavBadge`; hidden while the sheet is open, which shows the count in its header. */
export function UnreadNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  if (isActive) return null;
  return <UnreadCountBadge className={cn('absolute', className)} />;
}
