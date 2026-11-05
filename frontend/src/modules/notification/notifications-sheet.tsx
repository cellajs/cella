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
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
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
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const { mutate: markRead } = useMarkNotificationsReadMutation();

  const items = data?.items ?? [];
  const hasUnread = (data?.unreadCount ?? 0) > 0;
  // The listed rows count too: a system admin is told of organizations they hold no membership in
  const organizationIds = new Set([...(myMemberships?.items ?? []), ...items].map(({ organizationId }) => organizationId));
  const showOrganization = organizationIds.size > 1;

  return (
    <NavSheetFrame>
      <div className="bg-card sticky top-0 z-10">
        <div className="flex min-h-16 items-center justify-between gap-2 px-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {t('c:notifications')}
            <UnreadCountBadge />
          </h2>
          {hasUnread && (
            <Button variant="ghost" size="sm" onClick={() => markRead({})}>
              {t('c:mark_all_read')}
            </Button>
          )}
        </div>
        <div className={menuHairlineClass} />
      </div>

      <div className="flex flex-col gap-2 px-3 py-2">
        {isLoading && <Spinner className="mt-8" />}

        {!isLoading && items.length === 0 && <ContentPlaceholder icon={BellIcon} title="c:no_notifications" />}

        <ul className="flex flex-col gap-1 pb-60">
          {items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} showOrganization={showOrganization} onOpen={markRead} />
          ))}
        </ul>
      </div>
    </NavSheetFrame>
  );
}

interface NotificationRowProps {
  notification: Notification;
  /** The place line names the organization only for someone in more than one. */
  showOrganization: boolean;
  onOpen: (body: { ids?: string[] }) => void;
}

function NotificationRow({ notification, showOrganization, onOpen }: NotificationRowProps) {
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
  // A subject homed in the organization names no channel: the place line names the organization where it helps
  const hasChannel = notification.channelType !== 'organization';
  const content = (
    <>
      <span className={cn('relative shrink-0', notification.readAt && 'opacity-70')}>
        <EntityAvatar type="user" className="size-8" id={actor?.id ?? 'unknown'} name={actor?.name ?? ''} url={actor?.thumbnailUrl ?? null} />
        {hasChannel && (
          <EntityAvatar
            aria-hidden
            type={notification.channelType}
            id={notification.channelId}
            name={channelName}
            url={notification.channelThumbnailUrl}
            className={cn('absolute -right-1 -bottom-1 size-4 rounded-sm ring-2', notification.readAt ? 'ring-card' : 'ring-accent')}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* One `c:notification.<type>` sentence per vocabulary type, and one without its channel; apps add theirs to app.json */}
        <span className={cn('text-sm wrap-break-word', notification.readAt && 'text-muted-foreground')}>
          {t(hasChannel ? `c:notification.${notification.type}` : `c:notification.${notification.type}.no_channel`, {
            actor: actor?.name || t('c:someone'),
            subject: subjectTitle || t('c:unknown'),
            channel: channelName || t('c:unknown'),
          })}
        </span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="shrink-0">{relativeDate}</span>
          {showOrganization && (
            <>
              <span aria-hidden>·</span>
              <EntityAvatar
                aria-hidden
                type="organization"
                id={notification.organizationId}
                name={notification.organizationName}
                url={notification.organizationThumbnailUrl}
                className="size-3.5 shrink-0 rounded-sm"
              />
              <span className="truncate">{notification.organizationName}</span>
            </>
          )}
        </span>
      </span>
    </>
  );

  // Unread rows carry the full accent: accent/30 barely shows on the card in light mode
  const className = cn(
    'focus-effect flex w-full items-start gap-3 rounded-md p-2 text-left',
    notification.readAt ? 'hover:bg-hover' : 'bg-accent hover:bg-muted-hover',
  );

  return (
    <li>
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
    </li>
  );
}
