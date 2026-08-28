import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetNotificationsResponse } from 'sdk';
import { useRelativeDate } from '~/hooks/use-relative-date';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { getNotificationRoute } from './notification-link';
import { notificationsQueryOptions, useMarkNotificationsRead } from './query';

type Notification = GetNotificationsResponse['items'][number];

/** Explicit map: template-literal keys do not narrow to `TKey`, and each type reads differently. */
const labelByType = {
  mention: 'c:notification.mention',
  comment: 'c:notification.comment',
  reply: 'c:notification.reply',
} as const satisfies Record<Notification['type'], TKey>;

/** Mentions and addressed activity only: ambient posts are covered by the menu sheet's unseen badges. */
export function NotificationsSheet() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery(notificationsQueryOptions());
  const { mutate: markRead } = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const hasUnread = (data?.unreadCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-medium text-lg">{t('c:notifications')}</h2>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={() => markRead({})}>
            {t('c:mark_all_read')}
          </Button>
        )}
      </div>

      {isLoading && <Spinner className="mt-8" />}

      {!isLoading && items.length === 0 && <ContentPlaceholder icon={BellIcon} title="c:no_notifications" />}

      <ul className="flex flex-col gap-1">
        {items.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} onOpen={markRead} />
        ))}
      </ul>
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (body: { ids?: string[] }) => void;
}) {
  const { t } = useTranslation();
  const relativeDate = useRelativeDate(notification.createdAt);
  const route = getNotificationRoute(notification);

  const onActivate = () => {
    // The nav owns the sheet and always mounts it under this id, so closing uses the nav's own pair.
    useSheeter.getState().remove('nav-sheet');
    useNavigationStore.getState().setNavSheetOpen(null);
    if (!notification.readAt) onOpen({ ids: [notification.id] });
  };

  const body = (
    <>
      {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
      <span className="flex flex-col gap-0.5">
        <span className="text-sm">{t(labelByType[notification.type])}</span>
        <span className="text-muted-foreground text-xs">{relativeDate}</span>
      </span>
    </>
  );

  const className = cn(
    'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/50',
    !notification.readAt && 'bg-accent/30',
  );

  // An unknown channel type still marks read; it just cannot navigate anywhere sensible.
  if (!route) {
    return (
      <li>
        <button type="button" onClick={onActivate} className={cn('focus-effect', className)}>
          {body}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={route.to}
        params={route.params}
        search={route.search}
        onClick={onActivate}
        {...pageTopHashNav}
        className={cn('focus-effect', className)}
      >
        {body}
      </Link>
    </li>
  );
}
