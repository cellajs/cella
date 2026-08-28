import { useQuery } from '@tanstack/react-query';
import { cn } from '~/utils/cn';
import { notificationsQueryOptions } from './query';

/** Unread counter over the bell, mirroring `UnseenNavBadge`. */
export function UnreadNavBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  const { data } = useQuery(notificationsQueryOptions());
  const unreadCount = data?.unreadCount ?? 0;

  if (isActive || unreadCount === 0) return null;

  return (
    <span
      className={cn(
        'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-bold text-[0.6rem] text-destructive-foreground leading-none',
        className,
      )}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
