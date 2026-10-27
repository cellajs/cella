import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetNotificationsResponse } from 'sdk';
import { useRelativeDate } from '~/hooks/use-relative-date';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { notificationsQueryOptions, useMarkNotificationsReadMutation } from '~/modules/notification/query';
import { UnreadCountBadge } from '~/modules/notification/unread-nav-badge';
import { Button } from '~/modules/ui/button';
import { getProductRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';

type Notification = GetNotificationsResponse['items'][number];

/** Mentions and addressed activity only: ambient posts are covered by the menu sheet's unseen badges. */
export function NotificationsSheet() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery(notificationsQueryOptions());
  const { mutate: markRead } = useMarkNotificationsReadMutation();

  const items = data?.items ?? [];
  const hasUnread = (data?.unreadCount ?? 0) > 0;

  return (
    <NavSheetFrame>
      {/* Sticky like the menu sheet's section buttons: opaque card layer inside the sheet's scroll container. */}
      <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-2 bg-card px-5">
        <h2 className="flex items-center gap-2 font-semibold text-base">
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

function NotificationRow({ notification, onOpen }: { notification: Notification; onOpen: (body: { ids?: string[] }) => void }) {
  const { t } = useTranslation();
  const relativeDate = useRelativeDate(notification.createdAt);
  const route = getProductRoute(notification);

  const openNotification = (event: MouseEvent) => {
    // No id: the bars open this sheet as `navSheetId`, the floating-nav menu header as `notifications-sheet` over the menu sheet.
    if (!isModifiedClick(event) && !navigationStore.getState().keepNavOpen) {
      sheeter.getState().remove();
      navigationStore.getState().setNavSheetOpen(null);
    }
    if (!notification.readAt) onOpen({ ids: [notification.id] });
  };

  const { actor, channelName, subjectTitle } = notification;
  const content = (
    <>
      <EntityAvatar
        type="user"
        className={cn('size-8 shrink-0', notification.readAt && 'opacity-70')}
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
        <span className="text-muted-foreground text-xs">{relativeDate}</span>
      </span>
    </>
  );

  // Unread rows carry the full accent (accent/30 is ~3 sRGB steps off the card in light mode). Hover adds the ghost
  // button's 8% foreground on top of whichever fill the row has.
  const className = cn(
    'focus-effect flex w-full items-start gap-3 rounded-md p-2 text-left',
    notification.readAt ? 'hover:bg-foreground/8' : 'bg-accent hover:bg-[color-mix(in_oklab,var(--accent),var(--foreground)_8%)]',
  );

  return (
    <li>
      {route ? (
        <Link
          to={route.to}
          params={route.params}
          search={route.search}
          onClick={openNotification}
          {...pageTopHashNav}
          draggable={false}
          className={className}
        >
          {content}
        </Link>
      ) : (
        // An unknown channel type still marks read; it just cannot navigate anywhere sensible.
        <button type="button" onClick={openNotification} className={className}>
          {content}
        </button>
      )}
    </li>
  );
}
