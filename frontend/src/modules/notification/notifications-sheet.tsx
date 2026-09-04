import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetNotificationsResponse } from 'sdk';
import { useRelativeDate } from '~/hooks/use-relative-date';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { getNotificationRoute } from './notification-link';
import { notificationsQueryOptions, useMarkNotificationsRead } from './query';
import { UnreadCountBadge } from './unread-nav-badge';

type Notification = GetNotificationsResponse['items'][number];

/** Mentions and addressed activity only: ambient posts are covered by the menu sheet's unseen badges. */
export function NotificationsSheet() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery(notificationsQueryOptions());
  const { mutate: markRead } = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const hasUnread = (data?.unreadCount ?? 0) > 0;

  return (
    <NavSheetFrame>
      {/* Sticky like the menu sheet's section buttons: opaque card layer inside the sheet's scroll container. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-card px-4 py-3">
        <h2 className="flex items-center gap-2 font-medium text-lg">
          {t('c:notifications')}
          <UnreadCountBadge />
        </h2>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={() => markRead({})}>
            {t('c:mark_all_read')}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 py-2">
        {isLoading && <Spinner className="mt-8" />}

        {!isLoading && items.length === 0 && <ContentPlaceholder icon={BellIcon} title="c:no_notifications" />}

        <ul className="flex flex-col gap-1 pb-60">
          {items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onOpen={markRead} />
          ))}
        </ul>
      </div>
    </NavSheetFrame>
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
    // Like the account sheet: a pinned nav sheet stays open beside the content. No id, because this sheet is
    // `nav-sheet` from the bars but stacks over the menu sheet from the floating-nav menu header.
    if (!useNavigationStore.getState().keepNavOpen) {
      useSheeter.getState().remove();
      useNavigationStore.getState().setNavSheetOpen(null);
    }
    if (!notification.readAt) onOpen({ ids: [notification.id] });
  };

  const { actor, channelName, subjectTitle } = notification;
  const body = (
    <>
      <EntityAvatar
        type="user"
        className={cn('h-8 w-8 shrink-0', notification.readAt && 'opacity-70')}
        id={actor?.id ?? 'unknown'}
        name={actor?.name ?? ''}
        url={actor?.thumbnailUrl ?? null}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* One `c:notification.<type>` sentence per vocabulary type, interpolating actor, subject and channel; apps add theirs to app.json */}
        <span className={cn('text-sm', notification.readAt && 'opacity-70')}>
          {t(`c:notification.${notification.type}`, {
            actor: actor?.name || t('c:someone'),
            subject: subjectTitle || t('c:unknown'),
            channel: channelName || t('c:unknown'),
          })}
        </span>
        <span className="text-xs opacity-50">{relativeDate}</span>
      </span>
    </>
  );

  // Unread rows carry the full accent (accent/30 is ~3 sRGB steps off the card in light mode); only read rows tint on hover.
  const className = cn(
    'flex w-full items-start gap-3 rounded-md px-2 py-2 text-left',
    notification.readAt ? 'hover:bg-accent/50' : 'bg-accent',
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
